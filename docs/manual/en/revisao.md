# Pre-MR review

Asks the AI to review what your branch brings before you open the merge request: it reads the changes and the surrounding code and points out problems by severity, with file and line.

## When to use

- You finished a task on a branch and want to catch bugs before the team's reviewer does.
- You want a ready-made paragraph for the merge request description.
- You changed code you do not know well and want a second opinion on what could break.

Some terms on this page:

- A **branch** is the separate line of work where you made your changes, for example `feat/customer-signup`.
- The **base branch** is the one your branch is compared with, usually the project's main branch (`main`, `master` or `develop`).
- A **merge request (MR)** is the request to merge your branch into the base, which the team reviews on GitLab or GitHub.
- A **diff** is the list of what changed: the lines that came in and the ones that went out.

See also [Concepts and terms](/documentacao/conceitos).

## Before you start

- The project must be a git repository cloned on your machine.
- An AI provider must be set up in [Settings](/configuracoes). See [Settings](/documentacao/configuracoes).
- Run `git fetch` in the repository first. That way the remote base branch (for example, `origin/main`) is up to date, and the comparison does not include changes that already reached the base.

## Getting to know the screen

- **Tabs (`Local branch` and `Open MR / PR`)**: switch between reviewing a branch in a repository cloned on your machine and inspecting an open Merge Request / Pull Request from followed projects (or by pasting its GitLab/GitHub URL). The AI review of an MR/PR needs bwrap, because its title, description and diff were written by someone else.
- **Path field**: where the repository folder goes, for example `/home/you/workspace/shop-api`. The **Choose** button opens the system folder picker. The screen remembers the last folder you opened.
- **Back**: shows when you arrive from the **Review** button in My Workspace (in Repositories) and returns to that list with the same search and filter.
- **Branch line**: once opened, the screen shows "Branch `your-branch` against" and a list of the repository's branches to pick the base from.
- **include uncommitted**: adds to the review what you changed but have not committed yet. The number of such files shows in parentheses. When there are such files, it comes ticked.
- **Cognitive diff & Blast Radius**: as soon as a base branch (or an open MR/PR) is selected, the screen renders the diff organized by cognitive category (**Core logic**, **Wiring & API**, **Tests**, **Docs & Meta**) and highlights the deterministic **Blast Radius** (outside modules that import the changed files and whether they have test coverage) before you even run the AI.
- **Review with AI**: starts the AI review in read-only mode.
- **Answer area**: the review appears bit by bit while the AI writes it.

## Step by step: review your branch

1. Type the repository folder path and click **Open**, or click **Choose** to pick the folder.
2. Check the base branch in the list. The screen suggests the remote's main branch (`origin/HEAD`); if it cannot find it, it suggests `origin/main`, `origin/master`, `main`, `master`, `origin/develop` or `develop`, in that order.
3. Check **include uncommitted**: it comes ticked when there are uncommitted changes; untick it to review only what is committed.
4. Click **Review**. The progress line shows how many files changed against the base and says the AI is reading the code.
5. Wait for the answer. Each problem comes with its severity (blocking, important or suggestion), the `file:line`, what is wrong, a scenario where it breaks and the fix, from most to least serious.
6. At the end comes the **Para o MR** section, a paragraph describing what the change does. Click **Copy** to take the whole text.

> **Tip:** if you fixed something and want another review, click **Run again**. To change the base or the option, adjust it and click **Review** again.

### Stop a review

1. While the AI is working, click **Stop**.
2. Whatever already arrived stays on screen.

## Good to know

- The AI only reads. It does not change files, commit or run commands.
- The comparison only covers what your branch brought since it left the base. What reached the base after that does not show up.
- The AI uses the provider and model chosen in [Settings](/configuracoes).
- The review is always written in Portuguese.
- A very large diff is cut before it goes to the AI; the progress line then says "diff cut" and the AI reads the missing files straight from the folder.
- A review has a 20-minute limit.

## Common problems

- **"the folder is not a git repository".** Choose the project's root folder, the one that holds `.git`.
- **"Could not find the remote's default branch".** The repository has no `origin/HEAD` set. Pick the base by hand in the list.
- **"the base branch ... does not exist in this repository".** If the base is remote, run `git fetch` in the repository and open the folder again.
- **"nothing to review".** Your branch has no difference against the base. If your changes are not committed yet, tick **include uncommitted**.
- **The Review button stays disabled.** Pick a base branch in the list.
