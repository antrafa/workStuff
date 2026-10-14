# Pipelines

Shows in a single list how the pipelines of the projects you follow are doing, on GitLab CI or GitHub Actions. When a job fails, the AI reads the log and explains, in plain words, the likely cause and how to fix it.

## When to use

- You follow several projects and want to see at a glance which ones have a red latest pipeline.
- The `test` job of the `group/orders-api` project failed and you want to know why without reading 3,000 lines of log.
- You want to read a job's log without opening GitLab or GitHub.

## Before you start

Some terms used on this page:

- **Pipeline**: the automatic sequence of tasks GitLab or GitHub runs on every code change (build, test, publish). On GitHub it is called a GitHub Actions workflow.
- **Job**: each task in the pipeline, such as `build` or `test`. Jobs are grouped into **stages**.
- **Log**: the text the job wrote while it ran. That is where the error shows up.
- **Branch**: the line of development the pipeline ran on, such as `main` or `feature/new-login`.

More terms in [Concepts and terms](/documentacao/conceitos).

What must be ready:

- A connection to GitLab or GitHub, created on the [Repositories](/repositorios) screen. See [Repositories](/documentacao/repositorios). Without one, the screen shows **No connection to GitLab or GitHub** and the **Create connection** button.
- To use **Explain failure**, an AI assistant set up in [Settings](/configuracoes). See [Settings](/documentacao/configuracoes).

## Getting to know the screen

| Part | What it shows |
|---|---|
| **Project list** | Followed projects grouped by the group they live in (for example, `team-a` and `team-b`). The group line shows how many projects it has, how many failed or are running and the connection (hover it to see the full path of the group); groups start closed: click the line to expand or collapse it. Each project row shows the **Latest pipeline** (its status), the **Branch**, **When** it ran and the **Duration**. |
| **Refresh** | Reads everything again now. The list also refreshes on its own every 30 seconds while the tab is open, and an open project (its pipelines and jobs) every 10 seconds. |
| **Follow project** | Adds a project to the list. |
| **Table header** | Click a column name to sort each group's projects by it; click again to reverse. **Latest pipeline** puts first what needs attention (failed, running, pending) and **When** starts with the most recent. A project with no pipeline always stays last. |
| **Project detail** | Opens right under the row you click: the recent pipelines and the jobs of the chosen one. Click the row again to close it. Click a column of the jobs table to sort it; **Stage** is the order the pipeline runs them in (the default) and **Status** puts failures first. |

The status of a pipeline or a job:

| Status | Meaning |
|---|---|
| **passed** | Finished with no error. |
| **failed** | Some step ran into an error. |
| **running** | Running right now. |
| **queued** | Waiting for a free machine to run on. |
| **manual** | Waiting for someone to start it by hand on GitLab or GitHub. |
| **canceled** | Someone or something interrupted it. |
| **skipped** | Did not run because of a rule in the pipeline itself. |

On each row, the arrow icon opens the pipeline in the browser, and the trash can stops following the project.

## Step by step: follow a project

1. Click **Follow project**.
2. In **Connection**, pick the connection where the project lives.
3. Choose how to find the project:
   - **Browse groups** (the default): the window opens on the connection's base group. Click a group to go into it, and use the path at the top to go back. Type in **Filter this group…** to narrow the list. On the project you want, click **Follow**. Projects already in the list show **followed**.
   - **Paste address**: in **Project**, paste the project's URL, such as `https://gitlab.com/my-company/area/orders-api/-/pipelines`, or type just the path, `my-company/area/orders-api`. On GitHub, it is `owner/repository`. With a URL, the panel picks the connection on that address and shows below the field which path it will follow. Click **Follow** (or press Enter).
4. The panel checks that the project exists before saving, and the project joins the list with the status of its latest pipeline.

## Step by step: understand why a job failed

1. In the list, click the project's row. The detail opens right under it.
2. At the top of the detail, each button is one of the 10 most recent pipelines, with the branch and how long ago it ran. The dot is green (passed), red (failed) or yellow (anything else). The latest one comes already selected.
3. Click the pipeline that failed. You see its status, the commit message (the change that started the pipeline), the short commit code, the duration and the **Open** button, which takes you to the pipeline in the browser.
4. In the jobs table, find the job marked **failed**. When the provider gives it, the row also shows the **step:** that failed.
5. Click **Explain failure**. A window shows the progress: how many log lines were sent and whether the AI will also read the project's code. Use **Stop** to interrupt; whatever already arrived stays on screen.
6. Read the answer. Use **Copy** to take it elsewhere or **Run again** to ask again. The answer brings the **Causa provável** (likely cause, with the log line that backs it), the **Correção sugerida** (suggested fix) and, when the failure looks like network, infrastructure or a flaky test, a **Se for intermitente** (if it is intermittent) note.

> **Tip:** if the project is cloned in the connection's workspace, the AI also reads the files the log mentions and confirms the cause in the code. Without the clone, it relies on the log only. To clone, use the [Repositories](/repositorios) screen.

### Read the whole log

1. On the job's row, click the document icon (**See the log**).
2. The log opens in a window. If it is very long, the screen says so and shows the end, which is where the error usually is.
3. Click **Copy** to take the log elsewhere.

### Stop following a project

1. Click the trash can on the project's row.
2. Confirm with **Stop following**. The project leaves the list; nothing changes on GitLab or GitHub.

## Good to know

- The screen only reads. No pipeline is started, canceled or retried from here. For that, use the button that opens it in the browser.
- The AI only reads too: it gets the end of the log and the job's name, and it is told not to run commands.
- The AI currently answers in Portuguese, whatever the panel's language.
- A failed job with **(allowed)** next to it was marked, in the pipeline itself, as an acceptable failure.
- You can follow up to 50 projects. Following a project that is already on the list again does not duplicate it.
- The projects you follow here can become an alert on the [Scheduled checks](/agenda) screen, which warns you when the pipeline breaks. See [Scheduled checks](/documentacao/agenda).

## Common problems

- **"enter the project's full path (e.g. group/project)".** The group or owner is missing. Type the whole path, such as `my-company/area/orders-api`.
- **The project's row shows an error and does not open.** The message next to it says why. The most common cause is a connection with no token: fix the connection on the [Repositories](/repositorios) screen.
- **"connection removed" on the group line.** The connection it used was deleted in Repositories. Stop following the project and follow it again with another connection.
- **"No pipeline in this project" or "no pipeline yet".** The project has no pipeline set up, or it never ran.
- **The AI explanation failed.** Check in [Settings](/configuracoes) that the AI assistant is installed and set up, and click **Run again** in the window.
