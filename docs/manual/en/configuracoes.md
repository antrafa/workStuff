# Settings

Chooses which AI program the panel calls and with which model, and adjusts how the panel looks to you: language, theme, accent color and which screens show in the menu.

## When to use

- It is your first time in the panel and the AI screens need to know which program to call.
- You installed a new AI program (for example Codex) and want to switch to it.
- A new model came out and you want to use it, or the answers are slow and you want less effort.
- You prefer the panel in Portuguese, or in light colors for a shared screen.
- The menu has screens you never use and you want it shorter.

## Before you start

- At least one AI program installed on your computer: `claude` (Claude Code), `codex` (OpenAI Codex) or `agy` (Google Antigravity). The [Machine](/maquina) screen says which ones are missing.

## Getting to know the screen

Open it from **Settings**, at the bottom of the menu. On the left there are three sections; the one you click opens on the right.

| Section | What it holds | Where it is saved |
|---|---|---|
| **AI provider** | The AI program, the model and the effort. The label next to it shows the chosen program. | On your computer (`~/.workstuff/settings.json`), after **Save changes**. |
| **Appearance** | **Language**, **Theme** and **Accent color**. | Language on your computer, right away. Theme and color in this browser, right away. |
| **Menu items** | One switch per screen, to show it or hide it in the menu. The label shows how many are hidden. | In this browser, right away. |

The button at the top right says **Save changes** when there is an unsaved change in **AI provider**, and **Saved** when there is nothing to save. Only the AI provider section needs it: everything else applies on its own.

## Step by step: choose the AI provider

1. Click **AI provider**.
2. Each card is a program the panel knows. The installed ones show **available**; the others show **not found** and cannot be clicked. Click the one you want.
3. Read the note under the cards:
   - **Claude Code** has a **native command guard**: the program itself refuses commands that change things.
   - **OpenAI Codex** and **Google Antigravity** show **no native guard: reduced protection**: the panel's own guard is the only barrier.
4. In **Model**, pick one from the list. The one marked **recommended** is a safe start, and **always the newest** marks an alias that follows the newest version on its own.
5. In **Effort**, choose how hard the AI should think: more effort gives more careful and slower answers.
6. Click **Save changes**. The message **Settings saved** confirms it.

> **Tip:** the list of models comes from the installed program itself, not from the panel. If a model you know is missing, click **Refresh list** to read it again.

### Use a model that is not on the list

1. Under the list, type the model's exact name in **Other model id:** (for example `claude-opus-5-5`).
2. Click **Save changes**.

Use this for a model the program accepts but that does not appear in the list yet.

### Change the language

1. Click **Appearance**.
2. Under **Language**, click **English** or **Português**.
3. The page reloads in the new language. The panel's server messages also change.

> **Tip:** the **EN | PT** switch in the top bar does the same from any screen.

> **Warning:** the reload throws away unsaved changes in **AI provider**. Click **Save changes** first.

### Change the theme

1. Click **Appearance**.
2. Under **Theme**, click **Dark** (the panel default), **Light** (for shared screens and bright rooms) or **Automatic** (follows your operating system).

It applies right away. The sun or moon icon at the top of every screen also switches between light and dark.

### Change the accent color

1. Click **Appearance**.
2. Under **Accent color**, click one of the colors, or **Other** to pick any color.
3. Look at the **Preview** below: it shows the main button, an active filter and a progress bar in the new color.

The accent color marks the main action, the active item and the filters that are on. The panel adjusts it on its own so it stays readable in both themes.

### Hide screens from the menu

1. Click **Menu items**. The screens appear grouped as in the menu.
2. Turn off the switch of each screen you do not use. It leaves the menu right away.
3. To bring them all back, click **Show all**.

## Good to know

- Every AI provider runs in read-only mode on your code and clusters. Antigravity only runs on Linux, inside bubblewrap (`bwrap`), because it writes to disk even when asked not to.
- The choice made here is used by the screens that call the AI, such as the Cluster Doctor, [Analysis](/analise) and the item review in the [Catalog](/catalogo). The [Factory](/fabrica) can pick a model per agent in each task.
- A hidden screen still opens by its address and is still found by the search in **Ctrl+K**.
- Theme, accent color and hidden screens are saved in this browser: another browser or computer starts with the defaults. The provider, model, effort and language are saved on your computer and apply to any browser.

## Common problems

- **No AI CLI found on PATH.** No AI program was found. Install `claude`, `codex` or `agy` (the [Machine](/maquina) screen shows how) and open Settings again.
- **The saved model is not in the current list.** The model may be outdated or discontinued. Click the **Use** button that appears in the warning to switch to the suggested model, and then **Save changes**.
- **The program returned no model.** Click **Refresh list**. If the read fails, a red box shows the command that failed and its error; the list below it, if any, is the last one that worked.
- **Not saved: invalid model id.** The name typed in **Other model id:** has a character the panel does not accept. Use only letters, numbers and `. _ : / -`.
- **The red, orange or yellow accent looks like an alert.** Those colors look like the error and warning signs. Choose another one if you rely on alerts at a glance.
