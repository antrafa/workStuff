# Catalog

Gathers in one screen the files that guide your AI agents (skills, prompts, rules, personas, templates and notes) spread across your folders, and turns each one on or off in the agents installed on the machine with one click.

## When to use

- You have several skills and rules in different folders and want to see them all in one place.
- You want Claude Code to start following one of your rules, for example `rule-clean-code.md`, without editing the instructions file by hand.
- You want to activate the same skill in Claude, Codex and Gemini at once.
- You want to look for a ready-made skill in the public skills.sh catalog and install it.

## Before you start

Some terms on this page:

- An **AI agent** is the command-line program that talks to the model and works on your code: Claude Code, Codex, Gemini/Antigravity or OpenCode.
- A **skill** is a folder with a `SKILL.md` file that teaches the agent a specific task. The agent only loads it when the subject comes up.
- A **rule** is a working rule the agent must follow, such as a code style guide.
- A **persona** is a role the agent takes on, such as "software architect", with that role's way of thinking.
- A **prompt** is ready-made text to ask the agent for something. A **template** is a document model. A **note** is free text, with no metadata header.
- The **instructions file** is the file the agent reads every time it starts, such as `~/.claude/CLAUDE.md`.
- **Frontmatter** is the metadata block at the top of a Markdown file, between `---` lines, with fields such as `description`.

See also [Concepts and terms](/documentacao/conceitos).

You need at least one folder holding these files, for example `~/workspace/personal/skills`.

## Getting to know the screen

- **Refresh**: scans the folders again, to show files you created or changed outside the panel.
- **New item**: creates a new file in one of the folders and opens it in the editor.
- **Folders**: the folders being read, with how many items each one has. A folder that no longer exists shows **folder gone**. The **Manage folders** button adds or removes folders.
- **Agents**: the agents the panel knows how to activate. The **@ reference** tag means the agent imports the file directly; **pointer** means the agent gets the path and reads the file when it needs to. Hover to see each agent's instructions file and skills folder.
- **Tabs by type**: **Skills**, **Prompts**, **Rules**, **Personas**, **Templates** and **Notes**, with how many of each. The Skills tab always shows; the others only when they have items.
- **Filters**: the search by name, description or trigger, the folder filter and the status filter.
- **List** or **Cards**: two ways to view the items.

In the **List**, each agent has a column with the item's state in it:

| State | What it means | On click |
|---|---|---|
| **missing** | The item is not active in this agent. | Activates it. |
| **active** | The item is active. | Deactivates it. |
| **outdated** | The activation exists but no longer matches the item: the link is gone or the description changed after activation. | Reactivates it. |
| **managed elsewhere** | Something with the same name already exists that the panel did not create. | Nothing: the panel leaves it alone. |

In **Cards**, the same states show as buttons named after the agent. A card with **also in** warns that another item of the same type and name exists in another folder.

## Step by step: register your folders

1. The first time, click **Choose folders**. Later, use **Manage folders**.
2. In the **Catalog folders** window, type the path and click **Add**, or click **Choose folder** to use the system picker.
3. To remove a folder, click the X next to it. The files stay in the folder; it just stops being read.
4. Click **Save folders**. The catalog scans the folders and shows the items.

The panel classifies each file like this, in this order:

1. A folder with `SKILL.md` is a skill.
2. A file starting with `rule-`, `persona-`, `template-` or `prompt-` is of that type.
3. A file inside a folder named `rules`, `personas`, `templates` or `prompts` is of that type.
4. A `.md` with frontmatter is a prompt; without frontmatter, it is a note.

`README.md`, `CHANGELOG.md`, `LICENSE.md`, `AGENTS.md` and `CLAUDE.md` files are ignored, and the scan goes down 4 levels in each folder.

## Step by step: activate an item in an agent

1. Pick the type tab, for example **Rules**.
2. Find the item with the search, for example by typing `clean-code`.
3. In the agent's column, click **missing**. The state becomes **active** and a message confirms it.
4. To deactivate, click **active**.

What activation does on disk:

- A **skill** becomes a link in the agent's skills folder, for example `~/.claude/skills/<name>`. The link points to the original file: editing the skill in your folder already applies to the agent.
- The other types go into a marked block of the agent's instructions file (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `~/.gemini/GEMINI.md` or `~/.config/opencode/AGENTS.md`). The panel only touches that block.

> **Tip:** notes are not activated in agents; they stay in the catalog for reference only.

### Activate several items at once

1. In the **List**, tick each item's box, or the header box to tick every visible item.
2. In the bar that appears at the bottom, pick the agent.
3. Check the preview of what will happen: the skill links and how many references go into the instructions file.
4. Click **Activate N in** followed by the agent's name. Items already active or managed elsewhere are skipped.

### View, track and review an item

1. Click the item to open its details.
2. In the **Content** tab, read the file. **Copy content** copies the text.
3. In the **Tracking** tab, set the status (**idea**, **in progress**, **finished** or **needs work**) and write notes. Notes save on their own as you type.
4. In the **AI review** tab, click **Ask for a review**. The AI reads the item (and your notes) and points out strengths, what to improve and the next step. Use **Copy review** to keep the text and **Review again** for another round.
5. In the footer, **Open in editor** opens the file in your editor, and **Copy prompt** copies a sentence asking the agent to read the file and apply it.

### Create a new item

1. Click **New item**.
2. Pick the **Folder** and the **Type**.
3. In **Name**, use lowercase letters, numbers and hyphens, no accents, for example `review-pr`. Below it shows the file name that will be created, such as `rule-review-pr.md` or `review-pr/SKILL.md`.
4. In **Description**, say when the agent should use the item. It is what the agent reads to decide whether the item applies.
5. Click **Create and open**. The file is created and opens in the editor.

### Install a skill from skills.sh

skills.sh is a public skills catalog run by Vercel.

1. In the **Skills** tab, click **Search skills.sh**.
2. Type at least 2 letters or click a suggestion, such as `react` or `kubernetes`.
3. Under **Install for:**, tick the agents that will get the skill.
4. Before installing, use **repository** to review the skill's code: the content is third-party and becomes instructions for the agent.
5. Click **Install**. The confirmation shows the exact command that will run on the machine. Confirm with **Install**.
6. Follow the installation output. When it ends, click **Back to search**.

> **Tip:** with a single agent, the skill goes straight into its folder. With several, it lives in `~/.agents/skills` with a link in each one; in that case, click **Add ~/.agents/skills to the folders** so it shows up in the catalog.

## Good to know

- The panel never changes what it did not create. A link or folder with the same name made by another tool shows as **managed elsewhere** and blocks activation.
- The first time the panel writes to an instructions file, it keeps a copy of the original next to it, ending in `.workstuff.bak`.
- If the agent's instructions file does not exist yet, it is created on the first activation.
- Status and notes are kept by the panel, never in the item's file.
- The AI review only reads: it changes no file. It uses the provider and model from [Settings](/configuracoes).
- Installing from skills.sh needs internet access and `npx` (which comes with Node.js).
- The chosen tab and view live in the page address: reloading or sharing the link brings you back to the same place.

## Common problems

- **A folder shows "folder gone".** The folder was moved or deleted. Move it back or remove it from the catalog in **Manage folders**.
- **The item shows "managed elsewhere".** Hover to see why, for example a real folder with the same name in `~/.claude/skills`. Remove or rename that item outside the panel if you want the catalog to take over.
- **A new file does not show up.** Click **Refresh**. Also check that its name or folder follows the classification rules above.
- **"item not found".** The folder changed since the last read. Click **Refresh**.
- **The New item button is disabled.** None of the catalog folders exists. Register one in **Manage folders**.
