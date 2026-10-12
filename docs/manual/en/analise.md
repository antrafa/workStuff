# Analysis

Asks the AI for a full report on the architecture of a project on your machine, with diagrams, risks and recommendations, and lets you chat about the code and keep the report inside the project itself.

## When to use

- You are about to work on a project you do not know and want to understand how it is organized.
- You need to document a system's architecture for the team or for management.
- You want to know where the biggest technical risks are before planning a refactoring.
- You have a specific question, such as "what breaks if I change the database?", and want an answer grounded in the code.

Some terms on this page:

- **Architecture** is the overall design of the system: which parts exist, what each one does and how they talk to each other.
- A **commit** is a saved point in git history. The screen uses the current commit to know whether the project changed since the last analysis.
- A **persona** is a role the AI takes on, with its own way of thinking.

See also [Concepts and terms](/documentacao/conceitos).

## Before you start

- The project must be in a folder on your machine.
- An AI provider must be set up in [Settings](/configuracoes). See [Settings](/documentacao/configuracoes).
- Optional: if the [Catalog](/catalogo) has a persona named `arquiteto-software`, the AI uses its reasoning when writing the report. Without it, the report comes out just the same. See [Catalog](/documentacao/catalogo).

## Getting to know the screen

- **Path field**: the project folder, for example `/home/you/workspace/shop-api`. Pressing Enter opens the saved report, if there is one. The **Choose folder** button opens the system picker. The screen remembers the last project and opens it on its own.
- **Generate report**: starts the analysis. When the project already has a report, the button becomes **Update report**.
- **Generated analyses**: at the top of the screen, lists the reports already made on this machine.
- **Report in progress**: while the AI works, shows the files it is reading and the text as it starts coming out.

With a report open, the screen has three tabs:

| Tab | What it shows |
|---|---|
| **Report** | The full report, with date, commit, provider and how long it took. |
| **Graph** | The project's knowledge graph, when there is one (see below). |
| **Chat** | A chat to ask about the code. |

## Step by step: generate the report

1. Type the project folder path or click **Choose folder**.
2. Click **Generate report**.
3. Follow the progress: first the AI explores the project (the screen counts the reads), then it writes the report.
4. When it ends, the report appears in the **Report** tab. It has an executive summary and sections on overview, components, main flow, data, decisions, patterns, dependencies, technical debt, recommendations and open questions.
5. Use the buttons at the top of the report:
   - **Copy** copies the text.
   - **Download .md** downloads the report as a Markdown file.
   - **Save to project** saves the report to `docs/arquitetura/arquitetura-YYYY-MM-DD.md` inside the project, to version it with the code.
   - **Redo** redoes the whole analysis, even with no changes in the project.

> **Tip:** if the project has had no commits since the last analysis, **Update report** shows the saved report right away, without calling the AI or spending again.

### Chat about the code

1. Open the **Chat** tab.
2. Write your question and click **Send**, or click one of the suggestions, such as "What is the main end-to-end flow?".
3. The AI starts from the report and confirms by reading the files. Below the answer you see how many reads it made.
4. Ask follow-up questions: it remembers the last exchanges of the conversation.
5. To start from scratch, click **New conversation**.

### See the project graph

1. Open the **Graph** tab.
2. If the project has a `graphify-out/graph.html` file, the graph shows on screen. **Open in a tab** opens it in a separate browser tab.
3. If it does not, the tab explains how to generate it: run `/graphify` in Claude Code inside the project, or `graphify extract .`. The panel does not generate the graph.

### Reopen or delete an old analysis

1. Click **Generated analyses**.
2. Each project shows whether its report is **up to date**, **outdated** (with how many commits behind) or has its **folder missing**. The **versioned** tag means the report was saved in the project, and **graph** means there is a graph.
3. Click a project to open its report.
4. To take an analysis out of the history, click the trash icon and confirm with **Remove**. The file saved in `docs/arquitetura/`, if any, stays in the project.

## Good to know

- The AI only reads the code: it does not write or run commands.
- The report is only written inside the project when you click **Save to project**. Saving again on the same day overwrites that day's file.
- When the project gets commits after the analysis, the **Report** tab shows the **Outdated: generate again** button.
- A project without git always gets a new report, since there is no commit to compare.
- If you click **Stop** during the analysis, nothing is saved.
- The report is written in Portuguese.
- An analysis has a 30-minute limit, and it ends if the AI goes 5 minutes without any output.

## Common problems

- **"use the absolute folder path".** Type the full path, starting with `/` or `~`.
- **"folder not found".** Check the path; the folder may have been moved.
- **"the agent finished without producing a report".** Try again with **Generate report**. If it happens again, check the provider in [Settings](/configuracoes).
- **The progress line says "no persona".** The [Catalog](/catalogo) does not have the `arquiteto-software` persona. The report comes out normally; add the persona if you want its reasoning.
- **The Graph tab says the project has no graph.** Generate the graph with graphify in the project and open the tab again.
