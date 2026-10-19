# Machine

Checks what this computer is missing for you to work (programs, versions, credentials and network access) and shows, for each item, how to fix it, with the right command for your system: Linux, macOS or Windows.

## When to use

- You just got the computer and want to know what to install before your first day of work.
- A build failed with "wrong Java version" or "package not found" and you want to find out what is missing.
- A panel screen does not work (for example, the AI screens do not respond) and you want to know whether a tool is missing.
- You connected to the VPN and want to confirm that your team's internal addresses respond.

## Getting to know the screen

At the top there are four summary tiles:

| Tile | What it shows |
|---|---|
| **All good** | How many items are ok. |
| **Blockers** | How many items are missing and keep you from working. |
| **Warnings** | How many items work, but with limits. |
| **System** | The detected system. The suggested commands are for it. |

Right below, a switch picks what to list: **Blockers and warnings** (the default) or **All**. The items show in cards by group: **Base**, **Credentials**, **Java**, **Maven**, **Node**, **Docker**, **workStuff** (the panel itself), **Kubernetes**, **Security**, **AI**, **IDEs** (the code editors), **System** and **Network**.

Each item has a status tag:

| Tag | What it means |
|---|---|
| **ok** | It is installed or set up. |
| **missing** | It keeps you from working. Fix it first. |
| **warning** | It works, but something is limited. The description says what. |

Next to the name comes a detail (the version found, or the reason for the problem) and, underneath, the suggested fix. It can show up in four ways:

- **A command with the Run button**: the panel can run the fix for you, because it installs only into your home folder and needs no administrator password.
- **A command with the note "run in the terminal"**: it needs `sudo` (the administrator password) or an interactive terminal. Copy it and run it yourself.
- **The Open download page button**: the fix is to download an installer from the official site.
- **A written instruction**: something only you can do, such as "connect to the corporate network".

Every command and instruction has the copy icon next to it.

## Step by step: get the machine ready

1. Open the screen. The check runs on its own and lists what is pending first.
2. Start with the items tagged **missing**. Read the detail to understand why.
3. If the item has the **Run** button, click it. A window shows the command that will run. Check it and click **Run** to confirm.
4. Follow the command output, which shows right below the item. To interrupt it, click **Stop**.
5. When the fix finishes well, the panel checks everything again on its own and the item turns **ok**.
6. For items without the button, click the copy icon, paste into your terminal and run it. Then come back and click **Check again**.
7. When nothing is left pending, the screen shows **Machine ready: no required item missing.**

> **Tip:** some items depend on others. For example, the Java versions are only checked once SDKMAN (the installer for Java and Maven versions) is in place. Click **Check again** after each install.

### Register what belongs to your team

The panel does not know which private repositories, internal addresses or versions your team uses. You tell it once:

1. Click **Customize checks**.
2. Fill in the sections that apply to you:
   - **Private Maven repositories**: a **Name** (for example, `Company Nexus`) and the **Text in settings.xml**, usually the repository address (`nexus.example.com`). The panel checks whether the file `~/.m2/settings.xml`, where Maven keeps these settings, mentions that text.
   - **Private npm scopes**: the prefix of internal packages, such as `@my-company`. The panel checks whether the file `~/.npmrc` says where to download those packages from.
   - **Addresses that must respond**: VPN, proxy or internal services, with a name and URL (for example, `Intranet` and `https://intranet.example.com`).
   - **Required versions**: Java and Maven versions by their SDKMAN identifier (for example, `21.0.8-zulu`), and Node versions by the major number only (for example, `22`).
3. Use **Add** to add a line and the trash icon to remove one.
4. Click **Save**. The check runs again with the new items.

> **Tip:** the Git servers of every connection on the [Repositories](/repositorios) screen are added to the network check on their own. You do not need to register them here.

## Good to know

- In the **workStuff** group, **Audit trails** checks the Cluster Doctor and runbook logs: a warning there means someone deleted or edited a line after it was written.
- The check only reads. Nothing is installed until you click **Run** and confirm.
- The **Run** button exists only for what installs into your home folder without an administrator password: SDKMAN, NVM (the Node version installer), Java, Maven and Node versions, and the panel's own dependencies (`npm install`). On Windows, only `npm install` runs from the panel.
- The panel does not show the contents of `settings.xml` or `.npmrc`, because these files often hold passwords. It only checks whether the registered text is there.
- What you register under **Customize checks** is saved in `~/.workstuff/doctor-config.json`. To hand it to someone else, use the [Team profile](/perfil) screen.
- With nothing registered, the default versions are Java 17 and 21, Maven 3.9.6 and Node 20 and 22. The **Back to the default versions** button restores them.
- The panel needs Node 22.18 or newer on the terminal to work. The **Node on PATH** item checks this.
- Less than 20 GB free in your home folder raises a warning on **Disk space**.
- An address is only marked as down after two attempts with no answer.
- To undo a Java, Maven or Node install made by the panel, remove the version with the same manager (`sdk` or `nvm`).

## Common problems

- **An address shows "no answer after 2 attempts".** Check that you are on the VPN, that the address is right and whether a proxy is in the way. Then click **Check again**.
- **"key not accepted by ..." under Network.** Your SSH key (the file that identifies you to the Git server) is not registered there. Copy the contents of `~/.ssh/*.pub` and add it to the SSH settings of your GitLab or GitHub profile.
- **The fix failed.** Read the output under the item: it is usually no internet or a missing earlier program (for example, `curl` or `unzip`, in the **Base** group). Fix that first and try again.
- **Docker shows "the user is not in the docker group" (Linux).** Run the suggested command in the terminal, then log out and back in for the change to take effect.
- **A version was rejected on save.** Java and Maven use the SDKMAN identifier (see `sdk list java`), Node only accepts the major number, and an npm scope must start with `@`. Each list takes at most 30 items.
