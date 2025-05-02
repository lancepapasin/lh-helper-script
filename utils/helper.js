/** @format */
const fs = require("fs");
const fg = require("fast-glob");

function isValidDirectory(dirent) {
  return dirent.isDirectory && !dirent.name.startsWith(".");
}

async function getProjects(virtualDir) {
  try {
    const projectsDir = fs.readdirSync(virtualDir, {
      withFileTypes: true,
    });

    return projectsDir.filter((dirent) => isValidDirectory(dirent));
  } catch (error) {
    console.error(`Error reading directory: ${virtualDir}`, error);
    return [];
  }
}

async function checkProjectType(projectDir) {
  try {
    const packageJson = fs.readFileSync(`${projectDir}/package.json`, "utf8");
    const parsedJsonPackage = JSON.parse(packageJson);

    const isWP = parsedJsonPackage.name.includes("wordpress");
    const isFegg = fg.sync("**/fegg", {
      cwd: projectDir,
      onlyDirectories: true,
    });

    // Check if the project is Wordpress
    if (isWP) return "WP";
    // Check if the project is FEGG
    if (isFegg.length > 0) return "FEGG";
  } catch (error) {}
}

module.exports = {
  getProjects,
  checkProjectType,
};
