#!/usr/bin/env node
/** @format */

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("os");
const fg = require("fast-glob");
const yargs = require("yargs");
const { createSpinner } = require("nanospinner");
const { spawn } = require("child_process");
const ejs = require("ejs");
const dotenv = require("dotenv");

(async () => {
  dotenv.config({ path: path.join(__dirname, ".env") });

  const concurrentlyPath = path.resolve(
    __dirname,
    "node_modules/.bin/concurrently"
  );
  const browserSyncPath = path.resolve(
    __dirname,
    "node_modules/.bin/browser-sync"
  );

  const homeDir = os.homedir();
  const virtualDir = path.join(homeDir, "Virtual");

  const projectsDir = await fs.readdir(virtualDir, {
    withFileTypes: true,
  });

  const projects = projectsDir.filter(
    (dirent) => dirent.isDirectory && !dirent.name.startsWith(".")
  );

  yargs
    .usage("Usage: $0 <command> [options]")
    .command(
      "projects",
      "Prints all the projects",
      () => {},
      async () => {
        projects.forEach((project) => {
          console.log(project.name);
        });

        process.exit(0);
      }
    )
    .command(
      "start <project>",
      "Watch and run the selected project",
      async (yargs) => {
        return yargs
          .positional("project", {
            alias: "p",
            describe: "please select a project",
            choices: [...projects.map((dirent) => dirent.name)],
            demandOption: true,
          })
          .fail((msg, err, yargs) => {
            if (err) throw err;
            console.error("Project could not be found in directory.");
            process.exit(1);
          });
      },
      async (argv) => {
        try {
          const projectDir = path.join(virtualDir, argv.project);

          const files = await fs.readdir(projectDir);

          if (!files.includes("package.json")) {
            console.error("Current directory is not a project.");
            return;
          }

          const pkJsonFile = path.join(projectDir, "package.json");

          const rawPackageJson = await fs.readFile(pkJsonFile, "utf8");

          const packageJson = JSON.parse(rawPackageJson);

          const sassBase = Array(...packageJson.config.sass.split(","));

          const entries = fg.sync(
            ["**/Template/**/*.php", "code/template/**/*.tpl"],
            {
              cwd: projectDir,
              onlyFiles: true,
              ignore: ["node_modules", "**/ckeditor", "**/page-generator"],
            }
          );

          const compliedStyleBasePaths = sassBase.map((path) =>
            path.slice(0, path.lastIndexOf("/"))
          );

          let command = `${browserSyncPath} start --proxy ${argv.project}.localhost --files \"${entries}"\ \"${compliedStyleBasePaths}/**/*.css"\ --inject-changes --reload-delay=500`;

          const child = spawn(
            concurrentlyPath,
            ['"npm run watch"', `"${command}"`],
            {
              cwd: projectDir,
              stdio: "inherit",
              shell: true,
            }
          );

          child.on("exit", (code) => {
            process.exit(code ?? 0);
          });

          const cleanExit = () => {
            if (!child.killed) {
              child.kill("SIGINT");
            }
          };

          process.on("SIGINT", cleanExit);
          process.on("SIGTERM", cleanExit);
        } catch (error) {
          console.log(error.message);
          process.exit(1);
        }
      }
    )
    .command(
      "add:page <name>",
      "foo bar description",
      (yargs) => {
        return yargs
          .positional("name", {
            describe: "Command like add:foo",
            type: "string",
          })
          .option("fegg", {
            describe: "specify the",
          });
      },
      async (argv) => {
        try {
          const projectDir = process.cwd();
          const PACKAGE_JSON = await fs.readFile(
            `${projectDir}/package.json`,
            "utf8"
          );
          const PROJECT_NAME = JSON.parse(PACKAGE_JSON);
          const { parsedPath: parsedPagePath, pageName: newPageName } =
            parsePath(argv.name);

          if (!newPageName) throw new Error("Cannot create page without name");

          if (argv.fegg || !PROJECT_NAME.name.includes("wordpress")) {
            const spinner = createSpinner(
              `Adding ${newPageName} page...\n`
            ).start();

            // PATHs
            const templateBaseDir = path.join(projectDir, "code/template");

            // Fast glob finding route file directory
            const routeFilePath = fg.sync(["**/route.php"], {
              cwd: projectDir,
              onlyFiles: true,
            });

            const fgImgPathResult = fg.sync(["**/img/views"], {
              cwd: projectDir,
              onlyDirectories: true,
            });
            const imgBasePath = path.join(projectDir, fgImgPathResult[0]);

            const fgStylePathResult = fg.sync(["**/scss/object/project"], {
              cwd: projectDir,
              onlyDirectories: true,
              ignore: ["**/cms/**"],
            });

            const scssImportFilePath = fg.sync(["**/style.scss"], {
              cwd: projectDir,
              onlyFiles: true,
              ignore: ["**/cms/**"],
            });

            const styleBasePath = path.join(projectDir, fgStylePathResult[0]);

            // FILEs
            const pageTemplateDir = path.join(__dirname, "templates");
            const pageTemplateFile = await fs.readFile(
              `${pageTemplateDir}/page.ejs`,
              "utf8"
            );

            // Route file
            const routeFile = (
              await fs.readFile(`${projectDir}/${routeFilePath}`, "utf8")
            ).split("\n");

            const scssImportFile = (
              await fs.readFile(`${projectDir}/${scssImportFilePath}`, "utf8")
            ).split("\n");

            // TODO: Generate the image dir(s)
            const imageArrayPaths = createArrayPaths(
              imgBasePath,
              parsedPagePath
            );

            for (const imgPath of imageArrayPaths) {
              for (const mq of ["pc", "sp"]) {
                try {
                  await fs.access(`${imgPath}/${mq}`);
                } catch (error) {
                  await fs.mkdir(`${imgPath}/${mq}`, {
                    recursive: true,
                  });
                }
              }
            }

            // TODO: Generate page style dir(s)
            const styleArrayPaths = createArrayPaths(
              styleBasePath,
              parsedPagePath
            );

            for (const [i, stylePath] of styleArrayPaths.entries()) {
              await fs.mkdir(stylePath, {
                recursive: true,
              });

              // This will only creates scss file that does not exist
              try {
                await fs.access(stylePath);
              } catch (error) {
                // TODO: Generate page style file
                //  Will only create for the new page
                if (i === styleArrayPaths.length - 1) {
                  await fs.writeFile(
                    `${stylePath}/_index.scss`,
                    `p-${newPageName.replace(" ", "-")} {\n\tdisplay: block;\n}`
                  );
                }
              }
            }

            // TODO: Generate page file
            const pageTemplatePaths = createArrayPaths(
              templateBaseDir,
              parsedPagePath
            );

            for (const pageTemplatePath of pageTemplatePaths) {
              try {
                await fs.access(pageTemplatePath);
              } catch (error) {
                const currentPage = pageTemplatePath.split("/").at(-1);
                const pageTemplateContent = ejs.render(pageTemplateFile, {
                  url:
                    pageTemplatePath
                      .replace(templateBaseDir, "")
                      .replace("/", "") + "/",
                  relativePathCount: parsedPagePath.split('/').length,
                  className: `p-${currentPage.replace(" ", "-")}`,
                });
                await fs.mkdir(pageTemplatePath);
                await fs.writeFile(
                  `${pageTemplatePath}/index.tpl`,
                  pageTemplateContent
                );
              }
            }

            // Adding new page to route
            const newRouteVar = `$route['${parsedPagePath}']${"\t".repeat(
              10
            )}= 'page/render/${parsedPagePath}/index';`;
            const newRouteFile = reWriteFile(routeFile, {
              page: parsedPagePath,
              newLine: newRouteVar,
              regex: /^(?!\/\/)\$route\['((?:(?!contact)[^':])+)'/,
            });

            const newScssImport = `@import "object/project/${parsedPagePath}/index";`;
            const newScssFile = reWriteFile(scssImportFile, {
              page: parsedPagePath,
              newLine: newScssImport,
              regex: /@import\s+"(object\/project\/[^";]+)";/,
            });

            // Rewriting route.php
            await fs.writeFile(
              routeFilePath[0],
              newRouteFile.join("\n"),
              "utf-8"
            );

            // Rewriting styles.scss
            await fs.writeFile(
              scssImportFilePath[0],
              newScssFile.join("\n"),
              "utf-8"
            );

            spinner.success(`${newPageName} Added!`);
          } else {
            console.log("Directory not supported");
            process.exit(1);
          }
        } catch (error) {
          console.log("Error:", error.message);
          process.exit(1);
        }
      }
    )
    .demandCommand()
    .help()
    .parseAsync();
})();

function parsePath(path) {
  const parsedPath =
    path.split("/").length === 1
      ? path
      : path.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");

  const matchedName = parsedPath.match(/([^\\/]+)[\\/]*$/);
  const pageName = matchedName ? matchedName[1] : null;

  return { parsedPath, pageName };
}

function createArrayPaths(baseDir, inputPath) {
  const segments = inputPath.split("/");
  let currentSegment = segments[0];

  return segments.map((segment, i) => {
    if (i != 0) currentSegment = `${currentSegment}/${segment}`;
    return `${baseDir}/${currentSegment}`;
  });
}

function reWriteFile(file, { page, newLine, regex }) {
  const content = [];
  let isAdded = false;

  for (let i = 0; i < file.length; i++) {
    const currentLine = file[i];
    content.push(currentLine);

    if (!isAdded && currentLine && currentLine.match(regex)) {
      if (page.includes(currentLine.match(regex)?.[1])) {
        content.push(newLine);
        isAdded = true;
      } else if (currentLine && !file[i + 1]) {
        content.push(newLine);
        isAdded = true;
      }
    }
  }

  return content;
}
