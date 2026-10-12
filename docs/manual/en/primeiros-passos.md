# First steps

A guided first session: start the panel, check that your machine has what it needs, choose the AI, connect your code and your cluster, and try a first task in the Software Factory. Follow the steps in order; each one says how you know it worked.

## Start the panel

workStuff is two programs that run together on your computer: the server (it talks to your tools) and the web page you open in the browser.

**With the app shortcut.** If someone already installed the launcher on your computer, open **workStuff** from the application menu (Linux) or from Applications (macOS). It starts the panel in the background and opens the browser on its own. If the panel is already running, it just opens the browser.

**From the terminal.** In the workStuff folder:

```bash
npm install     # only the first time
npm run dev
```

Then open <http://localhost:5180> in the browser.

> **Tip:** to get the app shortcut, run `npm run launcher:install` once in the workStuff folder. Add `-- --desktop` to also get an icon on the desktop.

**How you know it worked:** the [Home](/) screen opens, and the bar at the bottom of the window says **local server :3101**. If it says **local server did not respond**, the server is not running: start it again with `npm run dev` and watch the terminal for errors.

## Step 1: check the machine

**Why:** most screens call programs installed on your computer (`git`, `kubectl`, `docker`, an AI program). If one is missing, the screen fails without a clear reason. The [Machine](/maquina) screen finds out first.

1. Open [Machine](/maquina) in the **Tools** group.
2. Click **Check machine** (or **Check again**, if it already ran once). The check only reads versions and settings; it changes nothing.
3. Look at the **Blockers** and **Warnings** counters. Each item says what is missing and how to fix it.
4. When an item has an automatic fix, click **Run**. Items that need administrator rights (`sudo`) show the command for you to run in the terminal.

**How you know it worked:** the screen says **Machine ready: no required item missing.** Warnings can stay: they work, with limits. The full guide is in [Machine](/documentacao/maquina).

## Step 2: choose the AI and the language

**Why:** several screens ask an AI for help (diagnosing a pod, explaining a failed pipeline, reviewing a branch). The panel needs to know which AI program to call and which model to use.

1. Click **Settings** at the bottom of the menu.
2. In **AI provider**, click the program you have installed: **Claude Code**, **OpenAI Codex** or **Google Antigravity**. Programs that are not installed show **not found** and cannot be chosen.
3. Pick a model (the one marked **recommended** is a good start) and the **Effort**.
4. Click **Save changes**.
5. If you prefer the panel in Portuguese, open **Appearance** and choose **Português** under **Language**. The page reloads.

> **Tip:** save the AI choice before changing the language: the reload throws away changes that were not saved.

**How you know it worked:** the button changes to **Saved**, and **AI provider** shows the name of the chosen program. The full guide is in [Settings](/documentacao/configuracoes).

## Step 3: connect GitLab or GitHub

**Why:** with a connection, you browse your groups and projects, clone them keeping the folder structure, follow pipelines and let the Factory open the merge request for you.

1. Open [Repositories](/repositorios) in the **Deploy** group.
2. Click **Connect GitLab or GitHub**. A wizard asks, one step at a time, for the **Provider**, the **Token** (a personal access key created in GitLab or GitHub), the **Protocol**, the **Base group** and the **Workspace** (the folder where clones go).
3. Click **Next** at each step and, at the end, **Save connection**.

**How you know it worked:** the message **Connection created** appears, and the screen lists the groups and projects of the base group. The full guide is in [Repositories](/documentacao/repositorios).

## Step 4: connect a cluster (if you use Kubernetes)

**Why:** the screens in the **Kubernetes** group all work on the cluster you connect here. If you do not work with Kubernetes, skip this step.

1. Open [Cluster](/cluster) in the **Kubernetes** group.
2. Click **Choose kubeconfig**. The list shows the files in `~/.kube`. If yours is not there, click **Add kubeconfig** and pick the file: the panel checks it before saving.
3. Before connecting, check the environment class in the selector next to the file (**DES**, **ITG**, **HML** or **PRO**). The panel guesses it from the file name; choose another class to correct it. A file with no class counts as production and stays read-only.
4. Click the file to connect. If it has more than one context (more than one cluster or user inside the same file), pick the context in the selector that appears at the top.

**How you know it worked:** the screen shows **Connected**, the pods appear in **Overview**, and the stamp at the top left of the Kubernetes screens shows the class and the context. The full guide is in [Cluster](/documentacao/cluster).

## Step 5: try a first task in the Factory

**Why:** the [Factory](/fabrica) is where AI agents write code for you, in a separate copy of the repository. Trying a small task shows the whole flow without risk: nothing reaches GitLab or GitHub without your approval.

1. Open [Factory](/fabrica) in the **Development** group.
2. Click **Guided mode**. It first checks the machine: the Factory needs `bwrap` (the bubblewrap package) to isolate the agents, and the [Machine](/maquina) screen shows how to install it.
3. Choose the **Repository folder** and the **Base branch**, and check the **Verification command** (for example `npm run build`).
4. Write a small, clear request in **Title** and **Description**, for example "Fix the typo in the README title".
5. Pick a **Cost cap in US$** if you want a limit, and click **Create and start**.
6. Follow the card on the board. When the plan is ready, the task waits for you: read it, edit it if you want and approve it.

**How you know it worked:** the task reaches review with the changes, the tests and the findings on display, and you choose whether it becomes a merge request. The full guide is in [Factory](/documentacao/fabrica).

## Where to go next

- Look around the [Home](/) screen: it sums up everything you set up in this session ([manual page](/documentacao/inicio)).
- Learn the shortcuts and the parts of the interface in [What workStuff is](/documentacao/introducao).
- Keep [Concepts and terms](/documentacao/conceitos) at hand for any word you do not know.
