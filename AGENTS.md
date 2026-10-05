# AGENTS.md

Local, single-user panel for dev and DevOps work. `README.md` holds the feature list, the security model, scripts, the data directory and the project structure: read the **Security model** section before touching anything that spawns a process, calls an AI CLI or talks to a cluster. Before changing the software factory (`server/lib/factory/`, `src/features/factory/`), read `docs/fabrica.md`: pipeline, gates, envelopes, sandbox and how to add an agent.

## Running it

- The owner keeps their own instance on ports **5180** (web) and **3101** (API). Ask before starting anything on them. To try a change, use another `PORT` and point `WORKSTUFF_HOME`, `WORKSTUFF_KUBE_DIR` and `WORKSTUFF_AGENT_HOME` at temporary folders.
- Never test a write against a real cluster, and never write to `~/.workstuff` from a test.

## Done means green

A change is done when `npm run check` and `npm run build` pass (`build` runs the typecheck). Report the output, not an impression.

Tests are **selfchecks**: an `assert`-based block at the bottom of the module itself, run by `node <file> --selfcheck` and listed in the `check` script of `package.json`.

```ts
if (import.meta.main && process.argv.includes('--selfcheck')) {
  // asserts against a mkdtemp() folder, never real data
  console.log('<module> selfcheck: ok')
}
```

A new module with real logic adds its selfcheck to `check`. Flows that span modules get a script in `scripts/check-*.ts`; `scripts/check-factory-pipeline.ts` is the model, running the whole factory with a fake `claude` on `PATH`.

## Code conventions

- The server is TypeScript run directly by Node (type stripping, no build step): relative imports carry the `.ts` extension, and enums, namespaces and parameter properties are unavailable.
- The web app may import from `server/` only plain-value files such as `server/lib/factory/types.ts`. Anything that pulls a `node:` module into the bundle breaks the build.
- One route file per subject in `server/routes/`, registered in `server/index.ts`; the logic lives in `server/lib/<subject>/`, keeping the route to HTTP concerns.
- Processes start through `spawn`/`run` with an argument list, without a shell. The only shells are the Machine page's fixed fixes (see README) and the factory's verify command, which runs `sh -c` inside the `bwrap` jail.
- UI text is pt-BR with full accents; code, identifiers, comments and commit messages are English. Commits follow Conventional Commits.
- Screens are built from `@/ui` (`Page`, `Async`, `Empty`, `Modal`, `Markdown`, `Chips`, ...) and the classes and tokens in `src/styles/` (`card`, `btn`, `badge`, `callout`, `input`, `var(--ok)`...). A new color becomes a token in `tokens.css` or a `--fx-*` variable in `factory.css`.
- A new menu entry goes in `src/app/nav.ts` (the single source for sidebar, breadcrumb and palette) and needs its help text in `src/app/help.ts`; `check-help` fails without it.

## Safety rails that cost investigation

- `agy` (Antigravity) writes to disk even with `--mode plan`/`--sandbox`; it only runs inside `bwrap` with `/` read-only.
- Factory agents with write access and the factory verification suite run inside the same `bwrap` jail (`server/lib/factory/runner.ts`): the suite executes code the agent wrote. Keep any new execution of agent-written code inside it.
- Cluster Doctor runs only on Claude Code, through its own `PreToolUse` hook; cluster writes are executed by the server after the user confirms, never by the agent.
- The factory never writes to the user's checkout: all work happens in worktrees under `~/.workstuff/worktrees`.
