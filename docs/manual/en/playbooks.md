# Playbooks

Runs engineering procedures guided by the AI, step by step: you fill in the details of your case, and each step of the script becomes a request the AI answers on the spot, with the answer appearing as it is written.

## When to use

- You need to write an ADR and want a script that walks you through context, alternatives and decision.
- You want to triage an error or write an incident post-mortem always following the same stages.
- You want to review code, plan a refactoring, generate tests or model threats with a ready-made procedure.
- You have a procedure of your own that you repeat often and want to turn it into a script.

Some terms on this page:

- A **playbook** is a Markdown (`.md`) file with a procedure. The request blocks inside it become the steps the AI runs.
- A **prompt** is the request text sent to the AI in each step.
- A **variable** is a slot in the prompt, written as `{{projeto}}`, that you fill in before running.
- An **ADR** (architecture decision record) is a short document recording a technical decision, why it was made and what it costs.

See also [Concepts and terms](/documentacao/conceitos).

## Before you start

- An AI provider must be set up in [Settings](/configuracoes). See [Settings](/documentacao/configuracoes).
- The panel ships with ready-made playbooks, organized in the `arquitetura`, `engenharia`, `incidentes` and `seguranca` folders. You need nothing else to get started.

## Getting to know the screen

- **Side list**: the playbooks in the folder in use, with the title and the file path. At the top it shows **Project playbooks** (with the **project** tag) when they are the ones that ship with the panel, or the path of your own folder. The **Change** button switches the folder.
- **AI line**: shows the provider and model that will run. **Change model** takes you to [Settings](/configuracoes).
- **Run all in sequence**: shows up when the playbook has more than one step.
- **Run parameters**: one field per variable in the playbook. Variables with a folder-like name (such as `projeto`, `pasta`, `repo`) get a button to choose the folder on the computer.
- **Playbook body**: the explanatory text and, within it, the steps. Each step has its title, the **Run with AI** button and **See prompt**, which shows the exact request.

The bundled playbooks are written in Portuguese, so their variable names are too (`projeto` means project, `pasta` means folder).

## Step by step: run a playbook

1. In the side list, click the playbook, for example **Documentação de Decisão de Arquitetura (ADR)**.
2. Read the playbook text: it explains what each parameter expects.
3. Under **Run parameters**, fill in every field. For example, in `titulo`, write "Adopting Kafka for order messaging".
4. On the first step, click **Run with AI**. The answer appears bit by bit.
5. When the step ends, it gets the **done** tag and how long it took. Click **Copy answer** to take the result.
6. Move to the next step and click **Run with AI** again.

> **Tip:** steps that use `{{passo_anterior}}` get the answer of the step above automatically. Run the steps in order.

### Run all the steps at once

1. Fill in the parameters.
2. Click **Run all in sequence**. The steps run one after the other, and each one gets the previous answer.

### Stop or repeat a step

1. While a step runs, click **Stop**. Whatever already arrived stays on screen.
2. To run the step again, click **Run again**. The previous answer is replaced.

### Use your own playbooks folder

1. Click **Change**, at the top of the side list.
2. Type the folder path and click **Use folder**, or click **Choose…** to use the system picker.
3. The list now shows the `.md` files in that folder and its subfolders (up to 3 levels).
4. To go back to the playbooks that ship with the panel, click **Change** and then **Back to the project playbooks**.

### Write a playbook

1. Create a `.md` file in your folder. The first `# Title` line becomes its name in the list.
2. Write the explanatory text as usual, in Markdown.
3. For each step, open a code block marked `prompt` (or `ai`) and write the request inside. Use `{{name}}` for each piece of data the person must fill in.
4. To give the step a title, start the block with a `# Step title` line, or write `ai:Step title` where the block opens.
5. Use `{{passo_anterior}}` wherever you want the answer of the step above.

Example of a step:

````markdown
```prompt
# Analyze the error
Analyze the error below in the {{projeto}} project and list the likely causes:
{{erro}}
```
````

## Good to know

- The AI runs read-only: it can read files but changes nothing.
- If you fill a variable named `projeto`, `pasta`, `diretorio`, `repo` or `repositorio` with a folder that exists, the AI works inside that folder and can read its code.
- Answers are not saved: switching playbooks or leaving the screen discards them. Copy what you want to keep.
- Each step has a 15-minute limit and ends if the AI goes 3 minutes without any output.
- Files larger than 512 KB do not show up in the list.

## Common problems

- **"fill in the variable ...".** A **Run parameters** field was left empty. Fill it in and run the step again.
- **"step not found; the file may have changed".** The playbook file was edited while it was open. Click another playbook and come back to reload it.
- **"folder not found".** When changing the folder, check the path you typed.
- **"No .md in this folder".** The chosen folder has no Markdown files. Pick another folder or go back to the project playbooks.
