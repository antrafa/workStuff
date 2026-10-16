# Local services

Shows what is running on your computer right now: who holds each port, what Docker has kept around and the applications you registered. From here you free a stuck port, clean up Docker and start your projects without opening a terminal.

## When to use

- You try to start the API, get "port 8080 already in use", and do not know which program is on it.
- The disk is filling up and you suspect old Docker images and volumes.
- You want to stop or restart the database running in a container without remembering the command.
- You always start the same projects (for example, the front end with `npm run dev` and the API with `./run.sh`) and want to do it with one click, watching the log on screen.

## Before you start

- The Docker part only shows up if Docker is installed and responding. If it is not, the screen says so, and the [Machine](/maquina) screen shows what is missing.
- No setup is needed to see the ports.

## Getting to know the screen

The screen has three tabs at the top: **Ports and Docker**, **Applications** and **K8s Tunnels**.

Some terms you will see on it:

- **Port**: a number (such as `5432` or `8080`) through which a program receives connections. Only one program can hold each port at a time.
- **Process**: a running program. The **PID** is the number the system gives each process.
- **Container**: a program packaged by Docker, running isolated from the rest of the machine. It is born from an **image** (the package that was downloaded or built) and can keep data in a **volume** (a folder managed by Docker that keeps existing even if the container is deleted).
- **Compose**: a file that describes several containers together (for example, a database and a queue). Each one becomes a **compose project**.

More terms in [Concepts and terms](/documentacao/conceitos).

### Ports and Docker tab

| Part | What it shows |
|---|---|
| **Listening ports** | Each open port, the address, the owning process and the PID. The operating system shows next to the title. |
| **Docker** | Four tabs: **Containers**, **Images**, **Volumes** and **Compose**, each with its count in parentheses and a **Filter by name** field. |
| **Refresh** | Reads everything again. This tab does not refresh on its own. |

Marks you may see in the port list:

| Mark | Meaning |
|---|---|
| **ok** | A single process on the port. |
| **conflict** | More than one process listens on the same port: one of them may be answering in place of the other. |
| **network** | The port accepts connections from other machines on the network, not only from this computer. |
| **this panel** | The process belongs to workStuff itself. It cannot be stopped from here. |
| **another user** | A system or root (administrator) process. Your user cannot stop it, and the system does not even give its PID. |

### Applications tab

Lists the **Registered applications**: your projects that the panel starts from a folder and a command. Each row shows the state, the name, the folder, the command, the port and the PID.

| State | Meaning |
|---|---|
| **running** | The process the panel started is alive. |
| **starting** | The process is alive, but the registered port has not opened yet. |
| **port taken** | The application is stopped, but another process, which the panel did not start, is on its port. |
| **stopped** | Nothing running. |

This tab refreshes on its own every 3 seconds while it is visible.

### K8s Tunnels tab

Manages named `kubectl port-forward` tunnels grouped into **Tunnel profiles** (for example, starting a `DES` database and queue together). Shows the environment stamp (`DES`, `ITG`, `HML` or `PRO`), detects dropped connections (**dropped**), requires explicit confirmation before opening a tunnel to `HML` or `PRO` (or an unclassified cluster), whether you connect, restart or start a profile, and displays an indicator in the footer status bar while tunnels are active. The environment comes from the kubeconfig name and its contexts, never from the namespace. To edit a tunnel, stop it first. If a tunnel does not end with **Stop**, the button becomes **Force stop**, which ends the process at once.

## Step by step: free a taken port

1. On the **Ports and Docker** tab, type the port number in **Filter by port, process or PID**, for example `8080`.
2. Check on the row which process is on it.
3. Click **Stop**. A confirmation opens with the exact command that will run (`kill` on Linux and macOS, `taskkill` on Windows), the effect and what is lost.
4. Click **Stop** in the confirmation. A message says whether the process stopped and the port is free.
5. If the message says the process is still alive, do it again with **Force** checked in the confirmation. The button becomes **Force stop**.

> **Warning:** **Force** ends the process at once, without giving it a chance to close files and connections. Data it has not saved yet is lost. Use it only if the normal stop does not work.

### Clean up what Docker has piled up

1. In the **Docker** section, open the **Containers**, **Images** or **Volumes** tab.
2. Click **Delete** on the item's row.
3. Read the confirmation: it shows the command (`docker rm`, `docker image rm` or `docker volume rm`) and what is lost.
4. For a volume, type its name in the confirmation field. Then click **Delete**.

The **Delete** button is turned off when deleting is not possible:

- Running container: stop the container first.
- Image or volume marked **in use**: some container, running or stopped, depends on it. Delete the container first.

### Start, stop and restart containers and compose projects

1. On the **Containers** tab, use **Start** on a stopped container, or **Restart** and **Stop** on a running one.
2. On the **Compose** tab, use **Up** (runs `docker compose up -d`) or **Stop** on the project.
3. Confirm. Whoever is using the service loses the connection until it comes back.

> **Tip:** a compose project only shows up on the tab after the first `docker compose up` run on it.

## Step by step: register and start a local application

1. Open the **Applications** tab and click **New application**.
2. Fill in the fields:

   | Field | What to enter | Example |
   |---|---|---|
   | **Name** | How the application shows in the list. | `Orders API` |
   | **Folder** | Where the command runs. Accepts `~` for your home folder. | `~/workspace/orders-api` |
   | **Command** | Just the program, without arguments. | `npm` |
   | **Arguments, one per line** | Each argument on its own line. An argument with spaces stays whole. | `run` and, on the next line, `dev` |
   | **Port** | Optional. The port the application answers on, from 1 to 65535. | `4000` |
   | **URL** | Optional. Must start with `http://` or `https://`. | `http://localhost:4000` |
   | **Environment variables, NAME=value per line** | Optional. Settings passed to the program. | `NODE_ENV=development` |

3. Click **Save**. The application joins the list as **stopped**.
4. Click **Start**. The log opens right below the row, and the state goes to **starting** and then **running**.
5. If you registered a URL, the **Open** button takes you to the application in the browser.
6. To turn it off, click **Stop**. To turn it off and on again, **Restart**.

> **Warning:** the command runs without a shell (the terminal's command interpreter). That is why `&&`, `|` and `>` do not work. To chain commands, write a script (for example `./run.sh`) and register the script as the command.

### Follow the log

1. Click **Logs** on the application's row. On start or restart it opens by itself.
2. Use **filter by text…** to see only the lines with a word, for example `error`.
3. Click **Wrap lines** if the lines are too long for the screen width.
4. Close it with the **X** in the corner.

Lines with `error`, `exception` or `fatal` are highlighted as errors, and lines with `warn` as warnings.

### Edit or delete an application

1. Click the pencil icon (**Edit**) to change any field. The change applies on the next start: what is already running keeps the old settings.
2. To delete, stop the application and click the trash icon (**Delete**). Confirm with **Delete**.

Deleting removes only the registration and the last log. The project's folder and code are not touched.

## Good to know

- On the **Ports and Docker** tab, every action that changes something (stopping a process, deleting, starting, stopping) asks for confirmation and shows the command first. On the **Applications** tab, only deleting asks for confirmation.
- The process shows without the arguments it was started with, because they may contain a password.
- Deleting a volume deletes its data for good (local database, uploads, cache). There is no undo.
- Deleting an image only removes it from the disk. If you need it again, Docker pulls or rebuilds it.
- **Stop** on an application also ends its child processes. For example, the server that `npm run dev` starts underneath goes down with it.
- An application's log starts over on each start. The screen shows up to the last 5,000 lines.
- Applications started here keep running even if you close the browser.

## Common problems

- **The Stop button is turned off.** The process belongs to the panel itself (**this panel**) or to another user (**another user**). The panel's cannot be stopped from here; another user's needs administrator rights, outside the panel.
- **"Process is still alive".** Open **Stop** again and check **Force**.
- **Docker refused to delete the image or volume.** Some container, even a stopped one, still uses it. Delete the container first.
- **"not found in the current list; refresh the screen".** The list changed since the last read. Click **Refresh** and try again.
- **The application shows port taken.** Another process is on its port, maybe a copy you started from the terminal. Free the port on the **Ports and Docker** tab and click **Start**.
- **"folder not found".** The registered folder no longer exists. Edit the application and fix the **Folder** field.
- **"could not start".** The command was not found. Check the **Command** field. On Windows, `npm` and `npx` do not work without a shell: register `node` as the command and the script as an argument.
- **"did not stop. Click Force stop…".** Some programs take a while to shut down or ignore the request. That application's **Stop** button becomes **Force stop**: click it to end the process at once. Anything it has not saved is lost.
