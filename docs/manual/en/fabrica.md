# Factory

Turns a change request ("export the orders report as CSV") into code that eight AI agents write, test, review and document in an isolated copy of the repository, and delivers it only after you approve. With the **Ideas** tab, it also helps you grow a rough idea into a list of tasks ready for that pipeline.

## When to use

- You have a clear request (a bug, a small or medium improvement) and want the agents to do the work while you only decide at the points that matter.
- There is an open issue on GitLab or GitHub and you want to turn it into code ready for review, without starting from scratch.
- You have a product idea that is still vague and want to refine it, hear the case against it and break it into small, ordered tasks before any code is written.
- You just want a quick opinion from a specialist (architecture, tests, security, review) on a repository, without changing anything in it.

## Before you start

- **An AI CLI installed.** The agents run through an AI command-line program, called the **provider** here: Claude Code, Codex or Antigravity. The default provider is set in [Settings](/configuracoes) (see [Settings](/documentacao/configuracoes)).
- **bwrap installed.** bwrap (bubblewrap) is a Linux "jail": a closed environment (a sandbox) where code the agent wrote can run without being able to touch the rest of your machine. Without it, planning runs, but building and verification do not. The [Machine](/maquina) screen shows the install command.
- **The repository cloned on your machine.** The Factory works on a local folder with Git (the version control system that keeps the history of the code).
- **To import issues or have the MR opened for you:** a connection to your GitLab or GitHub set up in [Repositories](/repositorios).

> **Tip:** if a term on this page is new to you, the [Concepts and terms](/documentacao/conceitos) page explains the panel's vocabulary.

## Getting to know the screen

The general buttons sit at the top:

| Button | What it does |
|---|---|
| **Factory runbooks** | Opens the [Dev runbooks](/dev-runbooks) with the Factory's manual procedures (for example, cleaning up leftover worktrees). |
| **Refresh** | Reloads the tasks and the projects. |
| **Guided mode** | Opens the step-by-step assistant that creates your first task. |
| **New project** | Creates a project, which groups the tasks and ideas of a folder. |
| **New task** | Creates a task directly, typed in or imported from an issue. |

Below them:

- **Project chips.** They show up once there is at least one project: **All**, one chip per project and **Loose** (tasks with no project). Each chip shows how many tasks it holds. The chosen chip is kept in the page address, so a reload or a shared link opens the same project.
- **Project header.** With a project chosen, it shows the name, the folder and the repositories found in it.
- **Tabs.** **Board** (with the number of tasks), **Ideas** (only with a project chosen) and **Specialized agents**.
- **Counters.** To the right of the tabs: **Running**, **Waiting for you** (tasks stopped until you decide something) and **Done**.

## How a task moves through the pipeline

The **pipeline** is the fixed sequence of steps every task goes through. Each step is done by an AI agent with a single role:

| Agent | What it does |
|---|---|
| **Analyst** | Reads the request and writes the **acceptance criteria**: checkable statements that say when the task is done. If a business detail is missing, it stops and asks you. |
| **Architect** | Writes the technical plan: which files to change, risks and test scenarios. |
| **Implementer** | Writes the code in an isolated worktree. |
| **Tester** | Writes at least one automated test per acceptance criterion. |
| **Documenter** | Updates the affected docs and writes the MR description. |
| **Reviewer** | Reviews the code for bugs and checks each criterion. |
| **Security** | Runs the security audit, in parallel with the Reviewer. |
| **Verifier** | Tries to prove that each serious problem raised in the review is not real. |

A few terms used from here on:

- A **branch** is a separate line of work inside Git. Each task gets its own.
- A **worktree** is a second working folder of the same repository, pointing at another branch. The Factory creates one per task under `~/.workstuff/worktrees`, so your own working folder is never changed.
- A **commit** is a saved record of a change in Git.
- An **MR** (merge request, which GitHub calls a PR, pull request) is the request, made on GitLab or GitHub, to join a branch into the main branch after it is reviewed.
- A **gate** is a check made by plain code, not by AI, that passes or fails a step. For example: "did any file change?" or "did the build pass?".

You decide at three points: answering the Analyst's questions, approving the plan and approving the delivery. Everything in between runs on its own.

Each task shows its state in a badge:

| State on screen | What it means |
|---|---|
| **in intake** | Created, nothing has run yet. |
| **planning** | The Analyst and the Architect are working. |
| **waiting for answers** | The Analyst has questions only you can answer. |
| **waiting for approval** | The plan is ready for you to read. |
| **building** | The Implementer is writing the code. |
| **QA and security** | Tests, docs and review are running. |
| **waiting for review** | The delivery is ready for your decision. |
| **done** | The MR was opened or the merge was made. |
| **failed** | The run stopped with an error; the message shows on the card. |

## Step by step: your first task with Guided mode

**Guided mode** opens by itself on the first visit, when there is no task yet. After that, click **Guided mode** at the top.

1. **How it works.** Read the summary of what each agent does and of the three points where you decide. Click **Next**.
2. **Prerequisites.** The screen checks whether bwrap and each provider (Claude Code, Codex, Antigravity) are installed. Pick the **Provider for this task**; the ones not installed are disabled. **Next** only unlocks with bwrap and the chosen provider present.
3. **Repository.** Type the **Repository folder** or click **Choose**. The screen shows the current branch and warns about uncommitted changes (they are not part of the task). Check:
   - **Base branch**: where the worktree starts and where the MR goes back to (for example, `main`).
   - **Verification command**: the command that proves the code works, such as `npm run build`. If the panel detected the project's commands, leave it empty to use them.
   - **Smoke command (optional)**: a quick "smoke" test that runs last: start the app, hit it, stop it. Example: `npm run dev & sleep 5; curl -fs localhost:5173 >/dev/null`.
4. **Request.** Write the **Title** and the **Description**: the problem, the expected behavior, where to change it (if you know) and how to tell it is done. To start from an issue, open **Import from a GitLab or GitHub issue** and click the issue: title and description are filled in.
5. **Agents and cost.**
   - **Open the MR by itself when everything is verified**: tick it to have the MR opened without you when nothing blocks and nothing needs a look.
   - With Claude Code, **opus to judge, sonnet to build (recommended)** uses a stronger model (opus) to specify, plan and review and a cheaper one (sonnet) to build, test and document.
   - **Cost cap in US$**: the most the task may spend (it starts at 5). It only has an effect with Claude Code, the only one that reports cost.
6. **Review.** Check the summary and click **Create and start**.

The task is created, planning starts right away and the screen opens the task's timeline so you can follow it live.

## Creating a task with New task

**New task** creates the task directly, with every option at hand. With a project chosen in the chips, the task goes into that project and the repository field suggests its repositories.

### A typed-in task

1. Click **New task**. The **Manual task** tab opens.
2. Fill in **Request title** and **Local repository (clone folder)** (or click **Choose**). Both are required.
3. If you want, adjust:
   - **Base branch**: empty uses the repository's default branch.
   - **AI provider**: starts with the one from Settings.
   - **Requirements**: what needs to be done, affected files, criteria.
   - **Verification command (optional)** and **Smoke command (optional)**.
   - **Open the MR by itself when everything is verified**.
   - **Cost cap in US$ (optional)**.
4. Click **Add to intake**. The task shows up in the board's **Intake** column.
5. On the card, click **Plan** to start.

> **Warning:** if bwrap is not installed, the window warns you at the top. Planning runs, but building does not; install it first so you do not pay for planning in vain.

### Importing an issue

An **issue** is a request recorded on GitLab or GitHub.

1. In **New task**, click the **Import remote issue** tab. The screen fetches the open issues from the [Repositories](/repositorios) connections.
2. Use **Filter issues by title or repository...** to find the issue.
3. Click **Fill in**. The screen goes back to **Manual task** with the title (`[#42] Issue title`) and the description taken from the issue, and shows **Linked to issue #42 of ...**. **Unlink** undoes the link.
4. Fill in the local repository and click **Add to intake**.

When this task's MR is opened, its description carries `Closes #42`, and GitLab or GitHub closes the issue once the MR is accepted.

### Model per agent

In **Model per agent (optional)**, you pick each agent's model. **Claude: opus to judge, sonnet to build** fills in the recommended mix; **Clear** sets everything back to the task model. The model name must exist in the chosen provider.

## The Board

### The columns

| Column | States that go in it |
|---|---|
| **Intake** | in intake |
| **Planning** | planning, waiting for answers, waiting for approval and failures before the build |
| **Build and QA** | building, QA and security and failures during the build |
| **Review** | waiting for review |
| **Done** | done |

The board refreshes itself while any task is running. If the columns do not fit, scroll sideways.

### The task card

Each card shows:

- The state badge, the lines added and removed (`+120/-8`) and the summed cost (`US$ 0.42`), when the provider reports it.
- The title. A task that came from an idea shows its key (for example, **M1.T2**) and, if it depends on another one not done yet, the **waits for** badge with the other's key.
- One dot per agent: hollow when it has not run, filled when it finished, blinking while it works and red when it failed. Hover to see the name.
- The step running now (or the last one): who runs it, the step name, for how long and how many tools the agent called.
- The task's branch.
- In review: **QA ok** or **QA pending**, and **Review ok** or **Findings**.
- The error message, when there is one.

Clicking the card opens the task's timeline.

### The card buttons

The button changes with the state:

| State | Button |
|---|---|
| in intake | **Plan** |
| running | **Stop** |
| waiting for answers | **Answer questions** |
| waiting for approval | **Read and approve the plan** |
| waiting for review | **Review delivery** |
| failed | **Try again** and **Details** |
| others | **Details** |

The buttons that do not run anything open the task window, where you read what you are about to decide.

### Discarding a task

1. Click the trash icon (**Discard task**) in the corner of the card.
2. The confirmation lists the effect: it stops the run in progress, removes the worktree and the branch and, if the task came from an idea, the tasks that depended on it stop waiting for it.
3. Click **Discard**. The task leaves the board.

> **Warning:** the code that did not become an MR or a merge is lost, along with the history of the runs.

## Following a run on the timeline

Click any card to open the timeline. **Back** returns to the board.

- **Top bar.** **Refresh** fetches the data now. **Live** / **Paused** turns automatic updating on and off. Next to them sit the same action buttons as on the card and the **running in the background** or **idle** indicator.
- **Task strip.** Title, state, start time, total time, model and how many tools were called.
- **Agent activity.** Everything each agent writes and every tool it calls (reading a file, running a command), as it happens. Filter by **All**, **Tools** or **Steps and errors**. **Follow the end** keeps the list scrolled to the newest entry; **Copy** copies all the activity.
- **Lanes.** One row per actor: **Engineer** (you), **Workspace** (the worktree and the commits), one per agent and **Gates**. Each block is a phase, placed in time.
- **Phase details.** Click a block to open a window with everything about it: **Result** (criteria, plan, changed files, the Tester's verdict, gate command and output), **Agent output** and **Tools**.
- **Footer.** **Isolated worktree** shows the branch where the work happens.

> **Tip:** the run lives on the server. Closing the timeline, the window or the browser tab only stops watching; the task goes on. To actually interrupt it, use **Stop**.

## Answering the Analyst's questions

When the Analyst finds a business question it cannot answer by reading the code, the task stops at **waiting for answers**.

1. On the card, click **Answer questions**.
2. Read the summary and the numbered list under **Analyst's questions**.
3. Answer in the text box, in the same order as the questions.
4. Click **Answer and plan**. Planning runs again from the start, now with your answers.

## Approving the plan

When the task reaches **waiting for approval**:

1. On the card, click **Read and approve the plan**.
2. Read **Analyst's acceptance criteria** (with what was left **Out of scope**) and the **Architect's technical plan**.
3. To change something, click **Edit the plan before approving**, edit the text and go on. **Discard the edit** goes back to the original plan.
4. Click **Approve and build**.

From here it runs on its own: the Implementer writes the code, the gates check it and, if one fails (nothing changed, a declared file does not exist, verification failed), it gets the failure and fixes it, up to 3 attempts. Then come the Tester, the Documenter, the installed security tools (gitleaks, semgrep, npm audit), the Reviewer and Security. The Verifier tries to knock down each serious problem; what holds goes back to the Implementer for a fix, up to 2 rounds. At the end, the branch is brought up to date with the newest version of the base (a **rebase**: replaying the task's changes on top of the current base) and verified again.

**A repository whose tests already failed.** When a verification step fails, the Factory runs the same verification on the commit the task started from and compares the failures. If everything that failed was already failing before, the step is marked **already failing on the base** and the pipeline moves on. If a new failure appeared, it goes back to the Implementer, with the list of what is new. This comparison only runs when something fails: a green suite costs nothing extra.

## Reviewing the delivery

When the task reaches **waiting for review**, click **Review delivery**. The top of the window shows the branch, the repository, the provider, the state and the cost (with the cap, if there is one).

### What blocks and what needs your look

In the **Your call: adjustments and decision** section:

- **Everything verified: nothing blocks and nothing needs a look.** You can deliver.
- **Blocks the delivery** (in red): for example, no verification command, verification failing, a conflict with the current base, a serious finding the Verifier did not knock down, an unmet acceptance criterion or a review that did not run.
- **Needs your look** (in yellow): for example, a criterion with no automated test, a finding the Verifier refuted, a medium-severity finding, a security tool not installed, a change of more than 400 lines, changes to sensitive paths (CI, Docker, migrations, authentication) or a verification that only passed because its failures already existed on the base.

This list is computed by code from the reports, not taken from an agent's opinion.

### The review tabs

| Tab | What it shows |
|---|---|
| **Code diff** | The differences between the code before and after (the **diff**), grouped into **Core logic**, **Wiring & API**, **Tests** and **Docs & Meta**. It has a file search, **Expand all**, **Collapse all** and each file's **Blast Radius**: how many other modules use it and whether they have tests. |
| **QA & tests** | Each verification step (passed, or its exit code), the test for each acceptance criterion (**tested**, **no automated test** or **missing**) and the verification output. |
| **Review and security** | **No blockers** or **Blocked**, each criterion (**met** or **not met**), the security tools and the **Findings**, with severity, file and confidence. A refuted finding shows struck through, with the reason. |
| **Timeline (trace)** | The waterfall of every phase with duration and tools. |

### Requesting an adjustment

1. Write what to change in **Need changes? Type the adjustment for the Implementer...**, or click **Ask for a fix** next to a finding to fill the request with it.
2. Click **Request adjustment**.

The adjustment goes through the same path as the build (gates, Tester, review). If it fails or is stopped, the code goes back to the reviewed point and the task stays at **waiting for review**.

### Delivering as an MR

1. Click **Create MR/PR**.
2. The Factory sends the branch to the Git server (a **push**) and opens the MR through the [Repositories](/repositorios) connection, with the description the Documenter wrote.
3. The MR opens in a new tab and the task becomes **done**. The worktree is removed; the branch stays on the server.

If no connection matches the repository, or the server refuses, the branch stays published and the window tells you to open the MR by hand.

### Merging locally

A **merge** joins the task's branch into the base branch. Use it when you do not want an MR, only the code on your machine.

1. Click **Local merge**.
2. The confirmation shows the command (`git merge --no-ff ...`): the Factory checks out the base branch in your repository, merges, and goes back to the branch you were on. It does not push.
3. Click **Merge**. The task's worktree and branch are removed.

> **Warning:** a local merge needs your repository with no pending changes. Commit or stash them first.

### Delivering despite blockers

With anything under **Blocks the delivery**, the MR and merge buttons are locked.

1. In **Deliver anyway: why?**, write the reason in at least 10 characters (for example, "the failing test fails on main too").
2. The buttons unlock. The reason and the list of blockers go into the MR description, for whoever reviews it.

### Other buttons

- **Open in editor** opens the worktree in VS Code or the default editor, to look at it or change it by hand.
- **Discard** discards the task, as on the card.
- **Open MR/PR** shows at the top once the MR is open.

## When something fails or has to stop

- **Stop.** The **Stop** button (on the card, on the timeline or in the window) interrupts the run and takes the task back to the last decision point: planning goes back to **in intake** (or to the previous plan, if there was one), a build goes back to **waiting for approval** and an adjustment goes back to **waiting for review**.
- **Try again.** With the task at **failed**, click **Try again** on the card (or in the window). If there was a plan, the build starts over from scratch with it; without a plan, planning runs again.
- **Switching the provider or the cap.** In the window of a failed task, use **Change provider:** and **Cap US$:** and click **Save** before trying again.
- **Cost cap.** It is checked before each agent, adding up every run of the task. When it is reached, the task stops with an error. One run can go a little over the cap, because the cost only arrives when it ends.

## Projects

A **project** is a folder that groups tasks and ideas. The Git repositories inside it (up to two levels down) are found by themselves. Ideas and tasks are kept in the panel's data, never inside the folder.

### Creating a project

1. Click **New project**.
2. Choose:
   - **Use an existing folder**: enter the **Project folder** (or **Choose**).
   - **Create a new folder**: enter the **Parent folder** and the **New folder name**. Leave **Start a git repository (git init + empty first commit)** ticked so the folder starts out as a repository.
3. If you want, give it a **Name (optional)**; without one, the folder name is used.
4. Click **Create project**. The project is selected in the chips.

### Filtering the board by project

Click a chip: **All** shows everything, a project's chip shows only its tasks and **Loose** shows the ones with no project. A task created with **New task** while a project is chosen goes into it.

### Bringing loose tasks in

With a project chosen, click **Bring loose tasks**. Tasks with no project whose repository is inside the project folder move into it, and a notice says how many.

### Removing a project

1. With the project chosen, click **Remove project**.
2. If the project has tasks, decide whether to tick **Also discard its N task(s)**. Unticked, they become loose, with worktrees and branches intact; ticked, they are discarded.
3. Type the project name to confirm and click **Remove project**.

The folder on disk is not touched. The project's ideas, with their conversations and plans, are lost.

## Ideas: from an idea to tasks

The **Ideas** tab lives inside a project. It takes a rough idea through five phases, always in this order: **Explore**, **Challenge**, **Refine**, **Plan** and **Break down**. At the end, the tasks go to the board. The ideation agents only read the project folder; nothing is written to it.

### Creating an idea

1. Pick the project in the chips and open the **Ideas** tab.
2. Click **New idea**.
3. Fill in **Title** and **The idea, in your words**: what you want, for whom, and why now. Rough is fine.
4. Click **Start**. The idea opens.

The idea list shows each idea's phase, a blinking dot while an agent is running and the date of the last change.

### The idea screen

- **Phases.** A numbered strip with the five phases and the current one highlighted. Hover a phase to see what it is for.
- **What to do now.** A blue box says what the current phase is for and what you do in it, step by step.
- **To move on.** Lists what is still missing before the phase can close, saying how to solve each item. When nothing is missing, **Everything this phase needs is there. Read the document on the right and, if it says what you mean, approve.** shows up and the **Approve and go to** button (followed by the next phase's name) unlocks. **Back one phase** reopens the previous phase.
- **Conversation.** The dialogue with the agents. Hover an agent's name to see its role.
- **Living document.** The summary of the idea, organized in sections (real problem, audience, assumptions and risks, refined version and others), which the conversation keeps filling in. It is what the plan is built from.

If you cannot answer yet something the phase asks for, tell the facilitator: it records that section as a guess to check later ("hipótese — verificar"), and the phase can move on.

### Talking to the facilitator

The **facilitator** is the agent that leads the conversation. In each round, it rewrites the idea as a problem and asks up to three questions, each with the answer it recommends.

1. Click **Start** (after the first time, the button becomes **Next round**).
2. Each question (Q1, Q2, Q3) comes with the answer the facilitator recommends, under **Recommended:**. Click **Use this answer** to copy it into your reply, or write your own.
3. Click **Send** (or Ctrl+Enter).
4. When you want to skip the remaining questions, click **Fill in the rest with the recommendations**: the facilitator fills in what is missing in the phase with the answers it recommended, marked as assumptions to confirm later.

While an agent runs, **Stop** interrupts it. Only one agent runs per idea at a time.

### Autopilot

For an idea you do not need to discuss question by question, click **Autopilot**, in the **To move on** box. It runs the phases by itself, from the current one up to the split into tasks, accepting the agents' recommendations:

- In Explore and Refine, the facilitator fills in what is missing with the answers it recommends, marked as assumptions to confirm later.
- In Challenge, it runs one round and decides each attack by the blue team's answer: **Defends** becomes discard, **Mitigates** becomes mitigate and **Concedes** becomes accepted risk. Each decision carries the note "decided by the autopilot".
- The plan and the split run next.

The autopilot stops and calls you when:

- a high-severity attack was not answered by the blue team: decide it in the attack card and run the autopilot again;
- the facilitator recommends changing course (pivot) or stopping (stop);
- a phase does not close even after the agent tried;
- the split is ready. It **never sends anything to the factory**: review the assumptions in the living document, the decided attacks and the tasks, then click **Send to the factory**.

The reason for the stop shows in the conversation and in a yellow box below **To move on**. **Stop** interrupts the autopilot, and **Back one phase** undoes what it assumed in a phase.

### Explore

Finds the real problem, who has it and what that person does today to work around it. The gate asks for the problem, audience, "job to be done" (the job the person wants to get done) and current workaround sections to be filled in.

### Challenge

The **red team** attacks the idea and the **blue team** defends against each attack. The two never talk to each other: you are the one who decides.

1. In the **Criticisms and defenses** panel, click **Run the challenge**.
2. Each attack shows a code (A1, A2...), its severity (high, medium or low), how much evidence backs it and what it is about; below it comes the blue team's answer (**Defends**, **Mitigates** or **Concedes**) and, when there is one, the proposed mitigation.
3. For each attack, write why you decided (optional) and choose:
   - **Adopt the mitigation**: the blue team's way to reduce the risk becomes a requirement of the idea.
   - **Accept the risk**: you go on knowing the risk, which is recorded in the document.
   - **Does not apply**: the criticism does not apply to this idea.
   - **Ends the idea**: the criticism is fatal; the idea is dropped with this attack as the reason.
4. If you want, once every attack is decided, click **Round 2: attack the mitigated version**. There are at most 2 rounds.

The decisions go into the document's "Challenge decisions" section. The gate asks for at least one round, no high-severity attack left undecided and the assumptions and pre-mortem sections filled in (a pre-mortem is the exercise of imagining the idea has already failed and asking why).

### Refine

The facilitator proposes three solution options (one of them without software), the smallest version that tests the riskiest assumption and a recommendation: **go** (carry on), **pivot** (change course) or **stop**. The button to move on follows the recommendation:

- **Approve and go to Plan**, with go: moves on to Plan.
- **Change course (pivot): back to Explore**: goes back to the first phase, with the document kept.
- **Stop: drop the idea**: the idea becomes **Dropped**.

A dropped idea can come back with **Reopen**, which takes it to Challenge (or to Refine, if it was never challenged), with everything kept.

### Plan

The **Planner** writes the **steps of the work**, called **master tasks**: large deliveries, in order (M1, M2...). The first one is the **walking skeleton**: the smallest version of the system that already works end to end, even if nearly empty, to prove the parts connect. Each step carries an objective, repositories, what is in and out of scope and, under **When it is done (acceptance scenarios)**, the scenarios in **Gherkin**: examples written as "Given... When... Then..." that say how to check it is done.

1. If you want, write instructions for the Planner (for example, "the admin comes later").
2. Click **Generate the plan** (later, **Redo the plan**).
3. To fix it by hand, click **Edit (YAML)**, change the text and click **Save**. YAML is a structured text format, with one line per field.

Code checks the plan: exactly one walking skeleton, not depending on another master; every master with a repository and a scenario; no circular dependency; and repositories that exist in the project (or are declared as new). If the Planner gets it wrong, it receives the errors and tries again, up to 3 times; whatever is still wrong shows under **Still to fix before going on**, so you can ask for the fix in the instructions or edit by hand.

> **Warning:** redoing or editing the plan erases the tasks that were broken down from it.

### Break down into tasks

The **Splitter** breaks each step into **tasks for the factory**, each in a single repository and a single stack. The **stack** is the kind of work: `backend`, `frontend`, `mobile`, `infra` or `docs`. A task that would touch both ends becomes two.

1. If you want, write instructions for the Splitter.
2. Click **Break the steps into tasks**. Later, **Break every step down again** redoes everything, and **Redo M1** redoes a single step.
3. Open each task to see its objective, scope, **Agreed with the other tasks (contracts)** (for example, the endpoint one creates and the other uses), scenarios and the suggested **Command that checks it**.
4. **Edit (YAML)** lets you fix it by hand.

Code checks that every scenario of each step landed in some task, that no step was left without tasks and that the dependencies exist and do not form a circle.

### Send to the factory

1. Once **To move on** lists nothing else in the Break down phase, click **Send to the factory**.
2. Each task becomes a task on the project's board, in the **Intake** column, titled `[M1.T1] ...`, with its Gherkin scenarios as acceptance criteria, which reach the Analyst as CA1, CA2... and stay first, unchanged.
3. The tasks are created in dependency order.
4. A task whose repository does not exist yet (because another task will create it) is held back, along with the ones that depend on it. They show under **Waiting for a later send:**. Click **Send to the factory** again once the repository exists; what was already sent is not sent twice.

Once everything is sent, the idea moves to **In the factory** and the **On the board** panel shows each task's state.

### Dependencies: the "waits for" badge

A task that depends on another shows the **waits for** badge on its card with the other's key (for example, **waits for M1.T1**). Its planning only starts once the other one is **done**; before that, **Plan** is refused with a message to finish (and merge) the earlier one first.

### Going back a phase

**Back one phase** reopens the previous phase without erasing what came after. The later phases get the ⟲ mark: what is in them is kept but may be out of date, and should be redone when you get there again.

### Exporting and deleting

- **Export** downloads the living document as a Markdown file (`.md`, plain text with light formatting).
- **Delete**, on the idea screen or through the trash icon in the list, stops any running agent and erases the conversation, the living document, the plan and the broken-down tasks. Tasks already sent stay on the board.

## Specialized agents

This tab calls one agent on its own, outside the pipeline, for a quick consultation. The agent always runs read-only, right in the folder you point to: nothing is changed.

### Consulting an agent

1. Click the agent's card: Analyst, Architect, Implementer, Tester, Reviewer, Security, Documenter, Red team or Planner.
2. Fill in **Target repository** (or **Choose**) and pick the **AI provider**.
3. Write the instruction in **Instruction for the <agent>**. The example in the box shows the kind of request it handles.
4. Click **Run <agent>**. The answer appears under **<agent> answer** as it is written. **Stop** interrupts it.

Here, the Implementer, the Tester and the Documenter describe in text what they would do, without touching the folder.

### Red team and Planner on their own

The two agents from the Ideas tab are here too, for when you just want an opinion without opening an idea:

- **Red team**: the devil's advocate. Describe the idea as you would to a colleague and it points out where it can fail, what cost it hides and what you are taking for granted.
- **Planner**: say what you want built and what stays out, and it returns a plan of large steps, in order, starting with the smallest version that already works.

### The agent's runbooks

Below the form, most agents carry **<agent> runbooks**: ready-made procedures for the moment where the agent helps (for example, **Repository pre-flight** before delegating, **Rebase conflicts** when a rebase stops). Click one to open it in a window. The commands run in the **Target repository** folder: reads run right away, and anything that changes the repository asks for confirmation. **All runbooks** opens the [Dev runbooks](/dev-runbooks).

## Good to know

- All code is written in worktrees under `~/.workstuff/worktrees`. Your working folder only changes if you choose **Local merge**.
- The agent that writes code and the verification run inside bwrap, because they execute code written by the AI. Only the worktree and the build cache folders are writable.
- Verification runs every step the project has, one at a time (lint, typecheck, test, check and build in a Node project; `mvn -q verify` in Maven; `go vet` and `go test` in Go), plus the smoke command. With none, nothing is verified and the delivery stays blocked until you give a reason.
- The review verdict is computed in code: it blocks a high or critical finding with confidence 75 or more, and an unmet acceptance criterion.
- Cost and tokens (the units of text the AI charges for) show when the provider reports them: Claude reports both, Codex only tokens and Antigravity neither.
- **Open the MR by itself** never merges locally on its own, it only opens an MR, and only when nothing blocks and nothing needs a look.
- When you click **Create MR/PR** or **Local merge**, if the base moved since the review, the Factory rebases and verifies again first. The click can take a few minutes.
- Restarting the panel's server in the middle of a run interrupts it: the task goes to **failed** and can be resumed with **Try again**.

## Common problems

- **The wizard will not get past Prerequisites.** bwrap is missing or the chosen provider is not installed. Install bubblewrap (the [Machine](/maquina) screen shows the command) or pick another provider.
- **QA shows as failed, saying bwrap is not installed.** Without bwrap, verification does not run. Install it and use **Try again**.
- **The delivery is blocked with "Nothing was verified".** The project has no verification command the panel recognizes. For this task, write in **Deliver anyway: why?** why it goes without one; for the next ones, fill in the **Verification command** when you create them.
- **The task stopped with "Cost cap reached".** Open **Details**, raise **Cap US$:**, click **Save** and then **Try again**.
- **"Provider authentication failed" shows up.** The AI CLI's session expired. Log in again in the terminal (for example, `claude login`) or switch the provider with **Change provider:**.
- **The branch was pushed, but the MR did not open.** No [Repositories](/repositorios) connection matches the repository, or GitLab/GitHub refused. The message gives the reason; open the MR by hand.
- **The local merge was refused.** Your repository has pending changes. Commit or stash them and try again.
- **Plan was refused with "this task waits for ...".** It depends on another task from the same idea. Finish (and merge) the task it names first.
- **The Ideas tab does not show up.** Ideas live in a project: pick a project in the chips or create one with **New project**.
- **Send to the factory left tasks under "Waiting for a later send".** Their repository does not exist yet. Finish the task that creates it and click **Send to the factory** again.
- **Discard says the run is still stopping.** Wait a few seconds and try again.
