/** @format */
const fs = require("fs");
const fg = require("fast-glob");
const path = require("path");
const ejs = require("ejs");
const { createSpinner } = require("nanospinner");

class PageHelper {
  constructor(pagename) {
    this.absolutePath = this._parsePath(pagename);
    this.pagename = path.basename(this.absolutePath);
    this.spinner = createSpinner(`Adding ${pagename} page...\n`);
  }

  _toSentenceCase(input) {
    if (typeof input !== "string") {
      throw new TypeError("Input must be a string");
    }
    return input
      .replace(/[^a-zA-Z0-9]/g, "")
      .replace(/^\w/, (c) => c.toUpperCase());
  }

  _parsePath(p) {
    return path.normalize(p).replace(/^[/\\]+|[/\\]+$/g, "");
  }

  _getFgPath({ pattern, ignore = [], onlyDir = false }) {
    const result = fg.sync([pattern], {
      cwd: process.cwd(),
      onlyDirectories: onlyDir,
      ignore: [...ignore],
    });

    return result.length > 0 ? path.join(process.cwd(), result[0]) : null;
  }

  _splitPathIntoSegments(rootPath, absPath) {
    const segments = absPath.split("/");
    const result = [];

    for (let i = 0; i < segments.length; i++) {
      const currentSegment = path.join(...segments.slice(0, i + 1));
      result.push(path.join(rootPath, currentSegment));
    }

    return result;
  }

  _getUntrackedSegment(paths) {
    const result = [];

    for (const path of paths) {
      if (fs.existsSync(path) && fs.statSync(path).isDirectory()) {
        continue;
      } else {
        result.push(path);
      }
    }
    return result;
  }

  _readFiles(base, files) {
    return Promise.all(
      files.map((filename) => {
        return new Promise((resolve) => {
          fs.readFile(
            path.join(base, filename),
            { encoding: "utf-8" },
            (err, data) => resolve({ filename, err, data })
          );
        });
      })
    );
  }

  _rewriteFile(file, variables, regex) {
    const content = [];
    let insertAtIndex = 0;

    for (let i = 0; i < file.length; i++) {
      const currentLine = file[i];
      content.push(currentLine);
      if (regex.test(currentLine)) {
        insertAtIndex = i;
      }
    }

    if (insertAtIndex <= 0) {
      insertAtIndex = content.length;
    }

    variables.forEach((element) => {
      content.splice(insertAtIndex + 1, 0, element);
    });

    return content;
  }
}

// TODO: add support for --with-cms-controller flag
//    this should create controller on code/application/cms/
//    this should insert the cms menu on /cms dashboard
class FeggPage extends PageHelper {
  constructor(pagename, option = {}) {
    super(pagename);
    const defaultOption = {
      withController: false,
      withCmsController: false,
    };
    this.option = { ...defaultOption, ...option };
    this.paths = this._initPaths();
    this.variables = this._initVariables();
  }

  _initPaths() {
    const routes = this._getFgPath({
      pattern: "**/route.php",
    });
    const style = this._getFgPath({
      pattern: "**/style.scss",
      ignore: ["**/cms/**"],
    });
    // Folder paths
    const cms = this._getFgPath({
      pattern: "**/code/application/cms",
      onlyDir: true,
    });
    const controller = this._getFgPath({
      pattern: "**/code/application",
      onlyDir: true,
    });
    const template = this._getFgPath({
      pattern: "**/code/template",
      onlyDir: true,
    });
    const views = this._getFgPath({
      pattern: "**/img/views",
      onlyDir: true,
    });
    const scss = this._getFgPath({
      pattern: "**/scss/object/project",
      ignore: ["**/cms/**"],
      onlyDir: true,
    });
    const ejs = path.resolve(__dirname, "../templates");

    return { routes, style, cms, controller, template, views, scss, ejs };
  }

  _initVariables() {
    let variables = {
      route: !this.option.withCmsController
        ? `$route['${this.absolutePath}/'] = 'page/render/${this.absolutePath}/index';`
        : `$route['${this.absolutePath}/post_:num.html'] = '${this.absolutePath}/detail/$1';`,
      style: {
        index: `@import "object/project/${this.absolutePath}/index";`,
        detail: `@import "object/project/${this.absolutePath}/detail";`,
      },
    };

    return variables;
  }

  _generateBoilerPlatePaths() {
    const { cms, controller, template, views, scss } = this.paths;
    let selected = {
      cms,
      controller,
      template: path.join(template, this.absolutePath),
      scss: path.join(scss, this.absolutePath),
      views: {
        pc: path.join(views, this.absolutePath, "pc"),
        sp: path.join(views, this.absolutePath, "sp"),
      },
    };

    return selected;
  }

  _getFilesToRewrite() {
    let files = [
      {
        path: this.paths.style,
        file: fs.readFileSync(this.paths.style, "utf-8").split("\n"),
        variable: [
          this.variables.style.index,
          ...(this.option.withController ? [this.variables.style.detail] : []),
        ],
        regex: /@import\s+"(object\/project\/[^";]+)";/,
      },
    ];

    if (
      typeof this.option.withController === "undefined" ||
      typeof this.option.withCmsController === "undefined" ||
      this.option.withController != true ||
      this.option.withCmsController != true
    ) {
      files = [
        ...files,
        {
          path: this.paths.routes,
          file: fs.readFileSync(this.paths.routes, "utf-8").split("\n"),
          variable: [this.variables.route],
          regex: /\$route\['[^']*'\]/,
        },
      ];
    }

    return files;
  }

  async _generateEjsFiles() {
    const isCmsPage = this.option.withController || this.option.withCmsController

    const pageArgs = {
      url: `${this.absolutePath}/`,
      relativePathCount: this.absolutePath.split("/").length,
      className: this.pagename.replace(" ", "-"),
      isDetail: isCmsPage,
    };

    let ejsFileArgs = [
      {
        key: "template",
        template: "page-fegg.ejs",
        filename: this.option.withController ? "list.tpl" : "index.tpl",
        args: pageArgs,
      },
      {
        key: "scss",
        template: "page-style.ejs",
        filename: "_index.scss",
        args: {
          styleClass: this.pagename.replace(" ", "-"),
          isDetail: this.option.withController || false,
        },
      },
    ];

    if (this.option.withController || this.option.withCmsController) {
      ejsFileArgs = [
        ...ejsFileArgs,
        {
          key: "controller",
          template: "page-controller.ejs",
          filename: `${this._toSentenceCase(this.pagename)}.php`,
          args: {
            name: this._toSentenceCase(this.pagename),
          },
        },
      ];
    }

    if (this.option.withCmsController) {
      ejsFileArgs = [
        ...ejsFileArgs,
        {
          key: "cms",
          template: "page-cms-controller.ejs",
          filename: `${this._toSentenceCase(this.pagename)}.php`,
          args: {
            name: this._toSentenceCase(this.pagename),
            hasGalleries: true,
            columns: ['foo', 'bar']
          },
        },
      ];
    }

    const ejsItems = [];

    const result = await this._readFiles(
      this.paths.ejs,
      ejsFileArgs.map(({ template }) => template)
    );

    result.forEach(({ filename: template, err, data }) => {
      const { key, filename, args } = ejsFileArgs.find(
        (j) => j.template === template
      );
      if (key)
        ejsItems.push({
          keyFor: key,
          data: ejs.render(data, args),
          filename: filename,
        });
    });

    return ejsItems;
  }

  _isPageFullyCreated(paths) {
    const requiredPaths = [
      paths.template,
      paths.views?.pc,
      paths.views?.sp,
      paths.scss,
    ];

    return requiredPaths.every((path) => path && fs.existsSync(path));
  }

  async create() {
    try {
      if (this._splitPathIntoSegments("", this.absolutePath).length > 1) {
        const splittedPaths = this._splitPathIntoSegments(
          this.paths.template,
          this.absolutePath
        ).slice(0, -1);

        const untracked = this._getUntrackedSegment(splittedPaths);

        if (untracked.length > 0)
          throw new Error(
            `trying to add page ${
              this.pagename
            } but found missing directories:\n${[...untracked].join("\n")}`
          );
      }

      const paths = this._generateBoilerPlatePaths();
      const boilerPlatePaths = [
        paths.controller,
        paths.template,
        paths.scss,
        paths.views.pc,
        paths.views.sp,
      ];

      if (this._isPageFullyCreated(paths)) return;

      this.spinner.start();

      // create all required folders folders
      for (const dir of boilerPlatePaths) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const ejsTemplates = await this._generateEjsFiles();

      // Match the path with the generated ejs files
      // This write the ejs template with the matching key from boiler paths
      Object.entries(paths).forEach(([key, value]) => {
        const matches = ejsTemplates
          .filter((item) => item.keyFor === key)
          .map((item) => ({ ...item, path: value }));
        if (matches.length > 0) {
          matches.forEach((item) => {
            fs.writeFileSync(
              `${item.path}/${item.filename}`,
              item.data,
              "utf8"
            );
          });
        }
      });

      // Rewrite variables to route.php and style.scss
      const rewrite = this._getFilesToRewrite();

      rewrite.forEach((item) => {
        const modifiedFile = this._rewriteFile(
          item.file,
          item.variable,
          item.regex
        );

        fs.writeFileSync(item.path, modifiedFile.join("\n"), "utf-8");
      });

      this.spinner.success(`${this.pagename} Added!`);
    } catch (error) {
      // console.log("There was a problem when creating the files");
      throw error;
    }
  }
}

// TODO: WpPage class for adding pages on Wordpress project

module.exports = {
  FeggPage,
};
