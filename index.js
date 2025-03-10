#!/usr/bin/env node
/** @format */

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("os");
const fg = require("fast-glob");
const yargs = require("yargs");
const { spawn } = require("child_process");
const dotenv = require("dotenv");

(async () => {
  dotenv.config({path: path.join(__dirname, '.env')});
  
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
      }
    )
    .demandCommand()
    .help()
    .parseAsync();
})();
