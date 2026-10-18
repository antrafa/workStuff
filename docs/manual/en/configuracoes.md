# Settings

Chooses which AI program the panel calls and with which model, and adjusts how the panel looks to you: language, theme, accent color, background and which screens show in the menu.

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
| **AI provider** | The AI program, the model, the effort and the sandbox policy. The label next to it shows the chosen program. | On your computer (`~/.workstuff/settings.json`), after **Save changes**. |
| **Appearance** | **Language**, **Theme**, **Accent color** and **Background**. | Language on your computer, right away. Theme, color and background in this browser, right away. |
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
6. Under **Sandbox policy**, select the isolation level for write operations and verification in the [Factory](/fabrica):
   - **Strict (Isolated)**: requires kernel-level sandbox isolation (`bwrap` on Linux or `sandbox-exec` on macOS). If no sandbox is detected, write operations are blocked for safety.
   - **Relaxed (Unconfined)**: allows AI agents and tests to run directly on the machine if no kernel sandbox is available.
7. Click **Save changes**. The message **Settings saved** confirms it.

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

### Change the background

1. Click **Appearance**.
2. Under **Background**, click **Choose image** and pick an image from your computer. It fills the panel's background, behind the cards and the menu.
3. In **Base color**, choose the color that sits behind the image. **Use the theme's** goes back to the theme's own background.
4. Drag **Transparency** to fade the image: at 0% the image shows in full, at 100% only the base color shows.
5. In **Fit**, choose how the image fills the screen: **Cover the screen** fills everything and crops what is left over, **Fit whole** shows the whole image with the base color around it, **Original size** does not resize it. In **Position**, choose which part stays in view, such as **Top center** to keep the top of the photo when it is cropped.

To go back to a plain background, click **Remove image**. Without an image, the base color alone is the background.

### Hide screens from the menu

1. Click **Menu items**. The screens appear grouped as in the menu.
2. Turn off the switch of each screen you do not use. It leaves the menu right away.
3. To bring them all back, click **Show all**.

## Good to know

- Every AI provider runs in read-only mode on your code and clusters. In the [Factory](/fabrica), write operations and test verification run isolated by a kernel sandbox (`bwrap` on Linux or `sandbox-exec` on macOS), or unconfined when the sandbox policy is set to relaxed. With `bwrap`, every provider only sees the folder of the run, never the rest of your home folder; with macOS's `sandbox-exec` it no longer sees the credential folders (`~/.ssh`, `~/.kube`, `~/.config`, `~/.workstuff`...), but the rest of your home folder stays visible. The remote MR review only runs with `bwrap`.
- The choice made here is used by the screens that call the AI, such as the Cluster Doctor, [Analysis](/analise) and the item review in the [Catalog](/catalogo). The [Factory](/fabrica) can pick a model per agent in each task.
- A hidden screen still opens by its address and is still found by the search in **Ctrl+K**.
- Theme, accent color, background and hidden screens are saved in this browser: another browser or computer starts with the defaults. The provider, model, effort and language are saved on your computer and apply to any browser.

## Common problems

- **No AI CLI found on PATH.** No AI program was found. Install `claude`, `codex` or `agy` (the [Machine](/maquina) screen shows how) and open Settings again.
- **The saved model is not in the current list.** The model may be outdated or discontinued. Click the **Use** button that appears in the warning to switch to the suggested model, and then **Save changes**.
- **The program returned no model.** Click **Refresh list**. If the read fails, a red box shows the command that failed and its error; the list below it, if any, is the last one that worked.
- **Not saved: invalid model id.** The name typed in **Other model id:** has a character the panel does not accept. Use only letters, numbers and `. _ : / -`.
- **The red, orange or yellow accent looks like an alert.** Those colors look like the error and warning signs. Choose another one if you rely on alerts at a glance.
