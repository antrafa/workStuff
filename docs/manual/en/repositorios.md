# Repositories

Connects the panel to your company's GitLab or GitHub so you can browse groups and projects and download (clone) one project or a whole group at once, with the folders laid out the same way as on the server.

## When to use

- You just joined the team and need to download the 30 projects of the `my-company/area` group without cloning them one by one.
- You want to find a project by name and see whether it is already on your computer.
- You want to open a project you already cloned in the editor, without hunting for its folder.
- You are going to use the [Pipelines](/pipelines) screen, which depends on a connection created here.

## Before you start

Some terms used on this page:

- **Repository** (or project): the code folder kept on GitLab or GitHub, with its whole history of changes.
- **Clone**: download a copy of the repository to your computer, using the `git` program.
- **Group** and **subgroup**: on GitLab, folders that hold projects, one inside the other (`my-company/area/product`). On GitHub, the equivalent is the **organization** or your user.
- **Token**: a special password you create on GitLab or GitHub that gives the panel permission only to read your groups and projects. You can delete it there whenever you want.
- **Workspace**: the folder on your computer where the clones live, for example `~/workspace`.

More terms in [Concepts and terms](/documentacao/conceitos).

What must be ready:

- `git` installed. If it is missing, the screen says so, and the [Machine](/maquina) screen shows what is installed on the machine.
- A token, if the projects are private (the usual case at a company). See how to create one under **Create the token**, further down.
- To clone over SSH, your SSH key registered on GitLab or GitHub. SSH is a way for `git` to identify itself with a key stored on your computer instead of a password.

## Getting to know the screen

With no connection, the screen shows the **No connection to GitLab or GitHub** card, listing what is missing (git, token in the environment, connection) and the **Connect GitLab or GitHub** button.

With a saved connection, the screen has:

| Part | What it shows |
|---|---|
| **Connections** | One tag per connection, with its name, provider (GitLab or GitHub), protocol (SSH or HTTPS) and token (only its last 4 characters, or **no token**). Next to it, the edit and remove icons. Click a connection to browse it. |
| **New connection** | Button at the top to create another connection. |
| **Path** | Where you are inside the group, starting from the base group (house icon). Click a part to go back to it. |
| **Filter subgroups and projects…** | Shows only what has the typed text in its name, path or description. |
| **Include archived** | Shows archived projects (deactivated on the server) and includes them in a subgroup clone. |
| **destination:** | The folder on your computer where the current group will end up. |
| **List** | Subgroups first, then projects. After the arrow, each row shows its destination folder. |

Each project's marks:

| Mark | Meaning |
|---|---|
| **cloned** | A git repository already exists in the destination folder. |
| **not cloned** | The folder does not exist in your workspace yet. |
| **folder taken** | The folder exists, has files and is not a git repository. The clone skips this project so nothing gets damaged. |
| **archived** | The project was archived on the server. |
| **activity** | How long ago the project last changed. |

## Step by step: connect GitLab or GitHub

The connection is created in a six-step wizard. The **Next** button only unlocks once the current step is filled in, and **Back** returns without losing anything.

1. Click **Connect GitLab or GitHub** (or **New connection**, if you already have one).
2. **Provider**: pick **GitLab** or **GitHub**. In **Address**, keep `https://gitlab.com` or `https://github.com`, or change it to your company's address, such as `https://gitlab.yourcompany.com`. The address must start with `https://`.
3. **Token**: choose where the token comes from.

   | Option | When to use it |
   |---|---|
   | **Use GITLAB_TOKEN from the environment** (or **GITHUB_TOKEN**) | The token is already in an environment variable on the computer when the panel starts. Available only if the panel finds the variable. |
   | **Use the gh login** | GitHub only: you already signed in with the `gh` program (`gh auth login`). |
   | **Paste a token** | You paste the token in the **Token** field. This is the simplest way. |
   | **No token** | Only public projects show up. |

4. Click **Test connection**. The screen checks the address and the token without saving anything and answers, for example, "Connected as maria: 4 group(s) and 0 project(s) visible at the root". If it fails, the message says why.
5. **Protocol**: choose how `git` will download the code.
   - **SSH (recommended)**: uses your key in `~/.ssh`. Afterwards, `git pull` and `git push` work without asking for anything. Click **Test SSH** to see whether the key is accepted.
   - **HTTPS**: clones with the token, no key. The token is not stored in the repository, so for `pull` and `push` later you will need your own `git` credentials.
6. **Base group**: enter the group where browsing starts, such as `my-company/area`. You can paste the whole group URL, and the site address is removed on its own. On GitHub, the field is called **Organization or user**. See below how the base group shapes the folders.
7. **Workspace**: in **Workspace folder**, type the path (starting with `/` or `~`) or click **Choose folder**. The folder is created if it does not exist.
8. **Review**: check the summary, give it a **Connection name** (optional) and click **Save connection**.

### How the base group becomes folders

The base group is the part of the path that does **not** become a folder. Everything below it is recreated in the workspace with the same hierarchy.

Example: with the base group `my-company/area` and the workspace `~/workspace`, the project `my-company/area/product/backend/api` goes to `~/workspace/product/backend/api`.

On GitHub, if the base is the organization `my-org`, the repository `my-org/my-repo` goes to `~/workspace/my-repo`. Leave the base empty to keep the organization as a folder.

### Create the token

On GitLab:

1. Sign in to GitLab and open the personal access tokens page of your profile. For gitlab.com, the link shows in the wizard's **Token** step itself when you pick **Paste a token**.
2. Create a token with the scopes (permissions) `read_api` and `read_repository`.
3. Copy the token, which starts with `glpat-`, and paste it in the **Token** field.

On GitHub:

1. Open `github.com/settings/tokens` (the link also shows in the wizard).
2. Create a token with the scopes `repo` and `read:org`.
3. Copy the token, which starts with `ghp_` or `github_pat_`, and paste it in the **Token** field.

> **Tip:** give the token only these read scopes. That way, even if it leaks, nobody can change anything with it.

## Step by step: browse and clone a project

1. Click the connection. The list opens on the base group.
2. Click a subgroup (or its **Open** button) to go into it. Use the path at the top to go back.
3. If you cannot find the project, type part of its name in **Filter subgroups and projects…**.
4. On the project's row, check the destination folder after the arrow.
5. Click **Clone**. A progress panel shows up at the end of the list.
6. When it finishes, the mark changes to **cloned** and the button becomes **Open in editor**.

### Clone a whole subgroup

1. On the subgroup's row, click **Clone subgroup**. Or, once inside it, click **Clone this subgroup** at the top.
2. Read the confirmation: it says which folder everything goes to and reminds you that projects already cloned are skipped.
3. If you want archived projects too, turn on **Include archived** before clicking.
4. Click **Clone**. The progress panel shows how many are done ("12 of 30") and counts each result: **cloned**, **already there**, **skipped** and **failed**. Hover over a result to see the detail.
5. To interrupt, click **Stop**. What was already downloading finishes, and half-done clones are removed.

> **Tip:** only one clone runs at a time on the screen. Wait for the current one to finish (or stop it) before starting another.

### Open a cloned project

1. On the row of a **cloned** project, click **Open in editor**.
2. The folder opens in VS Code (the `code` command). If it is not installed, the folder opens in the system's default program for folders.

### Edit or remove a connection

1. Click the connection's pencil icon to go through the wizard again with the current data. If the token was pasted, check **Keep the current token** so you do not have to paste it again.
2. Click the trash icon to remove the connection and confirm with **Remove**. The connection and the pasted token, if any, are removed. The clones on disk are not touched.

## Good to know

- Cloning never overwrites anything: what is already cloned is skipped, and folders with files are not touched.
- A pasted token stays only on this computer, in a file only your user can read (mode 600). It never goes to the browser and never shows in full on screen.
- With HTTPS, the token is used only during the clone and is not stored in the repository.
- In a subgroup, up to 3 projects are cloned at the same time, so the disk and the network are not saturated.
- You can only clone what is inside the base group, because that is where the destination folder comes from.
- These connections also serve the [Pipelines](/pipelines) screen. When you export your [Team profile](/perfil), the connections go without the token.

## Common problems

- **The Next button does not unlock.** Something is missing in the step: the address must start with `https://`, the token must be pasted (with the **Paste a token** option) and the workspace folder must start with `/` or `~`.
- **The environment variable or gh option is greyed out.** The panel did not find the `GITLAB_TOKEN`/`GITHUB_TOKEN` variable, or `gh` is not logged in. Pick **Paste a token**, or set the variable and restart the panel.
- **"no token found in that source".** The chosen source did not provide a token. Check the variable or the `gh` login, or paste the token.
- **"Empty group" or only a few projects show up.** The token cannot see those projects. Check that it has the right scopes and that your user has access to the group.
- **"the SSH key was not accepted".** Register your public key on GitLab or GitHub and use **Test SSH**, or edit the connection and switch to HTTPS.
- **"the token has no repository read permission".** Over HTTPS, the token needs `read_repository` (GitLab) or `repo` (GitHub). Create another token with that scope.
- **The project shows folder taken and Clone is greyed out.** A folder with files that is not a git repository already exists at the destination. Move or rename that folder and click **Refresh**.
- **A project does not show up.** It may be archived: turn on **Include archived**.
