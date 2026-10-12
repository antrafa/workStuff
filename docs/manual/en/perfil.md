# Team profile

Takes your panel setup to another person or another computer in a single file: the Machine screen checks, the repository connections and what is active in the Catalog. A newcomer imports the file and starts working with the same setup.

## When to use

- Someone new joined the team and you want their panel to check the same versions, private repositories and internal addresses as yours.
- You switched computers and want to bring the setup over from the old one.
- The team agreed on a standard setup and wants to hand it out to everyone.

## Getting to know the screen

The screen has two cards and, once you pick a file, a third one:

- **Export**: creates the file with your setup, through the **Download profile** button.
- **Import**: reads a file you received, through the **Choose file** button.
- **What changes with** `<file name>`: shows up after you pick the file. It lists, part by part, what will change in your panel, before anything is applied.

The profile file is a JSON file (a text file with structured data the panel can read) and carries three parts:

| Part | What it carries | What happens on import |
|---|---|---|
| **Machine checks** | Maven repositories, npm scopes, network addresses and the Java, Maven and Node versions registered on the [Machine](/maquina) screen. | **Replaces** the lists that differ from yours. The screen says which. |
| **Repository connections** | The GitLab or GitHub connections from the [Repositories](/repositorios) screen, without tokens. | **Adds** the ones you do not have yet. |
| **Catalog folders** | The folders the [Catalog](/catalogo) screen reads skills, prompts and rules from. | **Adds** the ones that exist on your computer. |

The file also lists the items that were active in the exporter's Catalog. Those are not applied: the screen only shows which they are, so you can turn them on by hand.

## Step by step: share your setup

1. Open the **Team profile** screen.
2. In the **Export** card, click **Download profile**. The browser saves a file named, for example, `workstuff-perfil-2026-10-12.json`.
3. Send that file to the person, by email or through the team chat.

> **Tip:** before exporting, check on the [Machine](/maquina) screen, under **Customize checks**, that what is registered is what the whole team needs.

### Import a profile you received

1. In the **Import** card, click **Choose file** and select the `.json` file you received.
2. Read the **What changes with** card. Each part shows:
   - under **Machine checks**, the lists that will be replaced, or "same as what you already have";
   - under **Repository connections**, the new connections, the ones that **already exist** and the **ignored** ones (with the reason);
   - under **Catalog folders**, the new folders and the ones that **do not exist on this machine**.
3. Uncheck the box of any part you do not want to apply. Parts with nothing new come unchecked and greyed out.
4. Click **Import selected**. The screen shows **Profile imported** and recalculates what would still change.
5. If connections without a token showed up, open the [Repositories](/repositorios) screen and set the token (the access password for GitLab or GitHub) for each one.
6. If the **Items active in the profile** list showed up, open the [Catalog](/catalogo) screen and turn those items on in the agents listed.
7. To see the effect, open the [Machine](/maquina) screen: it already checks against what came in the profile.

## Good to know

- A token never goes into the file. A connection whose token was typed into the panel goes out as "no token". A connection that takes its token from an environment variable or from the `gh` login (GitHub's command-line tool) keeps pointing to the same source.
- The connections' workspace folder goes out with `~` in place of your home folder, so it works on someone else's computer.
- The imported file goes through the same validation as the screens, as if you had typed each value. An odd value is refused.
- Importing the same file again does not duplicate connections or folders. A connection counts as the same when it has the same provider, address and base group.
- Nothing is installed or turned on by itself. After importing, the Machine screen only shows what is missing; you do the installing.
- The panel reads at most 50 connections and 50 folders from a file.

## Common problems

- **"the file is not valid JSON".** The file was changed or cut off along the way. Ask the person to export it again.
- **"the file is not a workStuff profile (or it is from a version this panel does not know)".** The file was not created by the **Download profile** button, or it came from a different version of the panel. Ask for a new file exported from the screen.
- **A folder shows under "do not exist on this machine (clone them first)".** The other person's Catalog folder does not exist on your computer yet. Clone the repository to the same path and choose the file again.
- **A connection shows as "ignored".** One of its values failed validation, for example an address with `http://` instead of `https://`. The reason shows next to it. Create the connection by hand on the [Repositories](/repositorios) screen.
- **The button reads "Nothing to import".** Everything the file brings is already the same in your panel.
