# Dev runbooks

Collects ready-made recipes for everyday programming chores (cleaning up branches, undoing a commit, restarting containers, clearing caches) and lets you run each command of the recipe with one click, seeing the result right on the screen.

## When to use

- You want to delete the local branches that were already merged, but you do not remember the Git commands in the right order.
- A container will not start and you want to follow an investigation script without skipping a step.
- You need to undo a commit or recover lost work and prefer to see each command before it runs.
- Your team wrote its own procedures as Markdown files and you want to run them from the panel.

## Before you start

- Have the tool the runbook uses installed (Git, Docker, npm, Maven...). The [Machine](/maquina) screen shows what is missing.
- Know which folder holds the project you will work on, for example `~/workspace/orders-api`.

## Getting to know the screen

A **runbook** is a recipe written in a text file (in Markdown, the same format as `README.md` files): it explains the problem and lists the commands that solve it, in order. See also [Concepts and terms](/documentacao/conceitos).

The screen has two parts:

- **On the left, the runbook list**, grouped by subject: **Software Factory** (tagged **pipeline**), **Git & Branches**, **Containers & Docker**, **Local environment** and **Other procedures**. At the top you see **Project runbooks** (the ones that ship with the panel) or the path of the folder you chose, plus the **Change** button.
- **On the right, the open runbook**, in two cards:
  - **Run parameters**: the fields the commands need, such as `projeto` (the folder the commands run in), `branch` or `branch_base`. The `projeto` field always shows.
  - **The runbook text**, with each command on its own line, ready to run.

Each command line carries a tag that says what it does to your machine:

| Tag | What it means | Button |
|---|---|---|
| **read** | Only looks, changes nothing (for example, `git status`). | **Run**, which runs it right away. |
| **write** | Changes something: deletes a branch, restarts a container, installs packages. | **Execute**, which asks for confirmation first. |
| **blocked** | The command cannot run yet. The reason shows right below it. | None. |

Every line also has the copy icon, to take the command to your own terminal.

## Step by step: run a runbook

1. In the list on the left, click the runbook. Example: the branch cleanup runbook under **Git & Branches**.
2. Read the opening text: it says when to use the runbook and which parameters to fill in.
3. Under **Run parameters**, fill in `projeto`. You can type the path or click the folder icon next to the field to pick the folder on your computer.
4. Fill in any other parameter the runbook asks for, for example `branch_base` with `main`. The commands on the screen update with the values you typed.
5. On the lines tagged **read**, click **Run**. The command output shows right below the line, just as it would in a terminal.
6. On the lines tagged **write**, click **Execute**. A window shows the exact command and the **Working directory** (the folder it will run in). Check them and click **Execute** to confirm, or close the window to back out.
7. Follow the lines in the order of the text. Read the notes between them: many say what to check before moving to the next command.

> **Tip:** each line's result stays on the screen while the runbook is open, so you can compare one step's output with the previous one.

### Use a folder with your own runbooks

1. Click **Change**, at the top of the list.
2. In the **Dev runbooks folder** window, type the folder path (for example, `~/my-runbooks`) or click **Choose…** to pick it on your computer.
3. Click **Use folder**. The list now shows the `.md` files in that folder and its subfolders.
4. To go back to the runbooks that ship with the panel, click **Change** and then **Back to the project runbooks**.

### Write a runbook

1. Create a `.md` file. The first line starting with `# ` becomes the title in the list. Without one, the file name is used.
2. Write the explanation as normal text.
3. Put the commands inside a code block marked `bash` (or `sh`, `shell`, `console`). Each line of the block becomes a runnable line on the screen. Lines starting with `#` are treated as comments and skipped, and a leading `$ ` is removed.
4. For a value that changes on each use, write `{{name}}`, for example `git branch -d {{branch}}`. The `name` field then shows under **Run parameters**.
5. Use subfolders to group runbooks: the name of the first subfolder becomes the group in the list.

> **Tip:** the runbooks that ship with the panel are written in Portuguese, so their titles and parameter names (such as `projeto`) are in Portuguese too.

## Good to know

- Only commands from these development tools run: `git`, `docker`, `docker-compose`, `npm`, `pnpm`, `yarn`, `cargo`, `mvn`, `gradle`, `go` and `make`. Any other command shows as **blocked**.
- Each line is a single command. Terminal features that chain or redirect commands (`;`, `&&`, `|`, `>`, `$(...)`) make the line **blocked**.
- Parameter values used inside commands accept only letters, numbers and `. _ - / @ : =`. This keeps a typed value from turning into another command.
- When in doubt, the panel treats a command as **write** and asks for confirmation. For Git, only known lookups run directly, such as `status`, `log`, `diff`, and `branch` without an option to delete or rename.
- Git commands get up to 1 minute to finish; the others (build, tests, installs) get up to 10 minutes.
- Every run, read or write, is recorded in the file `~/.workstuff/dev-runbook-audit.log`, with the date, command, folder and whether it worked. Each line carries the fingerprint of the one before it: if someone deletes or edits a line, the **Audit trails** item on the [Machine](/maquina) screen warns you.
- The list reads up to three levels of subfolders and skips hidden folders, `node_modules` and files larger than 512 KB.

## Common problems

- **The line shows as blocked with "fill in the variable".** A parameter under **Run parameters** is empty. As soon as you type it, the line is released.
- **"set the project folder (parameter projeto) before running this step".** The command has to run inside a repository. Fill in `projeto` with a folder that exists. Only `docker` commands other than `docker compose` run without it.
- **"invalid value for ...".** The value has a character that is not accepted, such as a space or an accented letter. Use only letters, numbers and `. _ - / @ : =`.
- **"step not found; the file may have changed, reload".** The runbook file was edited while it was open. Reload the page.
- **"folder not found".** The path typed under **Change** does not exist on this machine. Check the path or use **Choose…**.
- **The folder picker does not open anything (Linux).** The system has no folder dialog installed. The [Machine](/maquina) screen shows the **Folder picker** item and how to install it. Meanwhile, type the path.
