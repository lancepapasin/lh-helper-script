# Lion Heart Helper Script

This script is created to automate the development of LH projects which streamline workflow,  process and reduce boilerplates.

## How to setup?
First you need to clone the repository on your local machine
```
git clone https://github.com/lancepapasin/lh-helper-script.git
```
Install the packages used by the script by running
```
npm install
```
Since this project is not yet deployed and is currently an experiment, install it on the device by running
```
npm install . -g
```
## How to run?
You can run the script by executing
```
lh-helper
```
currently the script has few commands to run during development

| Command | Description |
| --- | --- |
| `projects` | Prints all installed projects in the directory. |
| `start <project>` | Watch and run the selected project. |
| `add:page <pagename>` | Setups a new page on the project. <br> <sub>_This is currently on `feature/add-page` branch_<sub> |

This tool is developed and maintained by Lance.