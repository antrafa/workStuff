# Vulnerabilities

Shows the known security flaws and the outdated versions in the libraries a project uses, by reading `package.json` and `pom.xml` and querying the public OSV database.

## When to use

- Before a release, to find out whether any of the project's libraries has a known security flaw.
- A security alert mentioned a CVE and you want to know whether your project is affected.
- You want to see which libraries are far behind their latest version before planning an upgrade.

Some terms on this page:

- A **dependency** is a third-party library the project uses, declared in `package.json` (Node projects) or `pom.xml` (Java projects with Maven).
- A **lockfile** pins the exact installed version of each dependency. In Node projects it is `package-lock.json`.
- **OSV** is a free public database of known security flaws ([osv.dev](https://osv.dev)).
- A **CVE** is the public ID of a flaw, such as `CVE-2024-12345`.
- The **major version** is the first number of a version: going from `4.2.1` to `5.0.0` changes the major, which usually brings incompatible changes.
- A **transitive dependency** is a library that enters the project because another library needs it, without you declaring it.

See also [Concepts and terms](/documentacao/conceitos).

## Before you start

- The project must be in a folder on your machine, with a `package.json` or `pom.xml` up to 4 levels below it.
- The machine needs internet access to query OSV, the npm registry and Maven Central.
- Optional: with the `trivy` program installed, the screen gains a full scan. The [Machine](/maquina) screen shows how to install it; see [Machine](/documentacao/maquina).

## Getting to know the screen

- **Path field**: the project folder, for example `~/workspace/shop-web`. The **Choose** button opens the system folder picker and starts the check right away.
- **Recent**: buttons with the last projects checked (up to 8). The red number next to the name adds up the critical and high flaws.
- **Summary**: one tile per severity (critical, high, medium and low) with the number of known flaws, and an **Outdated** tile with how many dependencies are one or more major versions behind.
- **Dependency table**: one row per dependency, with the version in use, the latest published one and the flaws. Development-only or test-only dependencies carry a **dev** or **test** tag.
- **Full scan (trivy)**: shows up when trivy is installed; otherwise a note explains what it adds.

The table filters:

| Filter | What it shows |
|---|---|
| **With flaws** | Only dependencies with some known flaw. It is the starting filter when there are flaws. |
| **Outdated** | Those one or more major versions behind the latest published one. |
| **All** | Every dependency found. |

Next to the filters, the **Filter by name** field looks up a dependency by name.

## Step by step: check a project

1. Type the project folder path and click **Check**, or click **Choose** and pick the folder.
2. Wait for the lookup. Large projects make hundreds of queries and can take a few seconds.
3. Look at the summary at the top: the **critical** and **high** tiles in red need attention first.
4. In the table, dependencies are sorted from the most to the least serious flaw. Click a row with flaws to open the details.
5. For each flaw you see the severity, the summary, the ID (with the CVE, when there is one) and the version that fixes it, under "fixed in". The link icon opens the flaw on the OSV site.
6. Update the dependency in the project to the fixing version and click **Check again** to confirm.

### Reopen a project you already checked

1. Under **Recent**, click the project name.
2. The screen shows the saved result of the last check, without querying the internet again. To refresh it, click **Check again**.

### Run the full scan with trivy

1. Check a project first.
2. Under **Full scan (trivy)**, click **Scan the whole project**. Trivy also reads the transitive dependencies.
3. To examine a container image, type its name in the field (for example, `nginx:1.27`) and click **Scan image**.
4. The result comes in a table with severity, package, **Installed** version, the version it was **Fixed in** and the flaw.

> **Tip:** trivy's first run downloads its flaw database and can take a few minutes.

## Good to know

- The screen only reads files. Nothing is installed, upgraded or run in the project.
- Folders such as `node_modules`, `target`, `dist` and `build` are skipped when looking for the files.
- In Node, the exact version comes from `package-lock.json`. Without a lockfile, a lookup only happens when `package.json` declares a single version (like `^1.2.3`); a range like `>=1` stays **not queried**.
- In Maven, versions inherited from the parent or a BOM also stay **not queried**. The trivy scan resolves the real versions.
- Dependencies pointing to a local folder, git or a URL are not in a public registry and are not looked up.
- A dash in the **Latest** column means the library is not in the public registry (it is private) or the registry did not answer.
- The panel keeps the last check of up to 30 projects.

## Common problems

- **"no package.json or pom.xml found up to 4 levels below that folder".** Check that you chose the right folder; point to the project root or to a folder closer to the files.
- **Note about dependencies without an exact version.** Generate the lockfile in the project (`npm install`) or use the trivy scan to see the real versions.
- **"use the absolute folder path".** Type the full path, starting with `/` or `~`.
- **The trivy scan takes a long time.** The first time it downloads the flaw database. Let it finish; later runs are faster.
