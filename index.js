#!/usr/bin/env node
/** @format */

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("os");
const fg = require("fast-glob");
const yargs = require("yargs");
const { spawn } = require("child_process");
const { getProjects, checkProjectType } = require("./utils/helper");
const dotenv = require("dotenv");
const { FeggPage } = require("./utils/page");

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
  const projects = await getProjects(virtualDir);

  yargs
    .usage("Usage: $0 <command> [options]")
    .command(
      "projects",
      "Prints all installed projects in the directory",
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
      "Creates a new page",
      (yargs) => {
        return yargs
          .positional("name", {
            describe:
              "Specify the name of the page to be created\n and supports nested insertion by using slash",
            type: "string",
          })
          .option("with-controller", {
            describe: "Create controller for the current page.",
            type: "boolean",
          })
          .option("with-cms-controller", {
            describe: "This is for fegg only and will create a controller",
          });
      },
      async (argv) => {
        try {
          const projectDir = process.cwd();

          const projectType = await checkProjectType(projectDir);

          if (!path.normalize(argv.name))
            throw new Error("Cannot create page without name");

          switch (projectType) {
            case "FEGG":
              new FeggPage(argv.name, {
                withController: argv.withController,
                withCmsController: argv.withCmsController,
              }).create();
              break;
            case "WP":
              // TODO: generate page for Wordpress project
              break;
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
