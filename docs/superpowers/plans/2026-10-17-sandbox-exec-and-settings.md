# Suporte a sandbox-exec no macOS e Política de Sandbox Configurável

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar isolamento nativo com `sandbox-exec` no macOS para a Fábrica de Software e adicionar configuração de política de sandbox (`strict` vs `relaxed`) no menu de Configurações, destravando o uso do Antigravity e agentes no Mac com total segurança.

**Architecture:** 
Criar um módulo de abstração de sandbox (`server/lib/sandbox/sandbox.ts`) que detecta o driver de sandbox disponível (`bwrap` no Linux, `sandbox-exec` no macOS, ou nenhum). Unificar a geração de comandos enjaulados tanto para agentes quanto para gates de verificação. Estender o `settingsStore.ts` com a propriedade `sandboxPolicy: 'strict' | 'relaxed'`, permitindo que o usuário decida entre isolamento estrito obrigatório ou modo relaxado para desenvolvimento local. Atualizar as telas de Configurações e Fábrica para refletir o sandbox ativo e a política escolhida.

**Tech Stack:** TypeScript (Node.js nativo sem build no server), Apple Seatbelt (`/usr/bin/sandbox-exec`), Bubblewrap (`bwrap`), React 19, CSS tokens.

---

## Global Constraints
- Node type-stripping conventions: relative imports in `server/` must have `.ts` extension; no enums, namespaces or parameter properties.
- Bilingual UI text: all user-facing strings must be pairs using `tx({ en, pt })` in frontend and `say({ en, pt })` on the server.
- Tests are selfchecks run via `node <file> --selfcheck` using `node:assert/strict`. No writes to `~/.workstuff` or real repos during tests; use `mkdtempSync()`.
- "Done means green": `npm run check` and `npm run build` must pass.

---

### Task 1: Módulo de Abstração de Sandbox (`server/lib/sandbox/sandbox.ts`)

**Files:**
- Create: `server/lib/sandbox/sandbox.ts`
- Test: `server/lib/sandbox/sandbox.ts` (selfcheck no próprio módulo)

**Interfaces:**
- Produces:
  - `type SandboxDriver = 'bwrap' | 'sandbox-exec' | null`
  - `detectSandboxDriver(): Promise<SandboxDriver>`
  - `buildSeatbeltProfile(options: { writable: string[]; tmpDir: string; cwd?: string; protectGit?: boolean }): string`
  - `wrapCommand(driver: SandboxDriver, options: { writable: string[]; tmpDir: string; cwd?: string; env?: Record<string, string>; protectGit?: boolean }, bin: string, args: string[]): { bin: string; args: string[] }`

- [ ] **Step 1: Escrever teste falhando no selfcheck de `server/lib/sandbox/sandbox.ts`**
  - Criar o arquivo `server/lib/sandbox/sandbox.ts` com o bloco `if (import.meta.main && process.argv.includes('--selfcheck'))`.
  - Testar a geração do perfil Seatbelt:
    - Garante `(deny file-write*)`
    - Garante `(allow file-write* (regex #"^/dev/"))`
    - Garante permissão em caminhos graváveis e seus `realpath`
    - Garante negação de escrita em `.git` quando `protectGit: true`
  - Testar que `wrapCommand` com driver `'sandbox-exec'` gera chamada a `sandbox-exec -p <profile> bin ...args`.
  - Testar que `wrapCommand` com driver `'bwrap'` gera chamada a `bwrap --ro-bind / / ...`.

- [ ] **Step 2: Executar o teste para verificar que falha**
  Run: `node server/lib/sandbox/sandbox.ts --selfcheck`
  Expected: FAIL

- [ ] **Step 3: Implementar `server/lib/sandbox/sandbox.ts`**
  - Implementar detecção do driver com cache ou memoização:
    - Se `which('bwrap')` existe -> `'bwrap'`
    - Senão, se `process.platform === 'darwin'` e `which('sandbox-exec')` existe -> `'sandbox-exec'`
    - Senão -> `null`
  - Implementar gerador de perfil Seatbelt para macOS com tratamento de symlinks (`/tmp` -> `/private/tmp`, `/var` -> `/private/var`).
  - Implementar `wrapCommand` para ambos os drivers.

- [ ] **Step 4: Executar o selfcheck para verificar que passa**
  Run: `node server/lib/sandbox/sandbox.ts --selfcheck`
  Expected: `sandbox selfcheck: ok`

- [ ] **Step 5: Adicionar o selfcheck ao script `check` do `package.json`**
  - Adicionar `node server/lib/sandbox/sandbox.ts --selfcheck` na lista de checks.

---

### Task 2: Configuração de Política de Sandbox no `settingsStore.ts`

**Files:**
- Modify: `server/lib/settingsStore.ts`
- Modify: `src/features/settings/api.ts`
- Test: `server/lib/settingsStore.ts` (selfcheck)

**Interfaces:**
- Produces:
  - `type SandboxPolicy = 'strict' | 'relaxed'`
  - `Settings`: inclui `sandboxPolicy?: SandboxPolicy` (default `'strict'`)
  - `parseSettings`: valida `sandboxPolicy`

- [ ] **Step 1: Escrever teste falhando para `sandboxPolicy` no selfcheck de `server/lib/settingsStore.ts`**
  - Adicionar asserção testando que `parseSettings` aceita `'strict'` e `'relaxed'` e recusa valores inválidos.
  - Testar que o valor default é `'strict'`.

- [ ] **Step 2: Executar o teste para verificar que falha**
  Run: `node server/lib/settingsStore.ts --selfcheck`
  Expected: FAIL

- [ ] **Step 3: Implementar suporte a `sandboxPolicy` em `settingsStore.ts` e `src/features/settings/api.ts`**
  - Atualizar tipo `Settings` no server e no client.
  - Adicionar validação em `parseSettings(body)`.
  - Preservar retrocompatibilidade: se o JSON não tiver `sandboxPolicy`, assume `'strict'`.

- [ ] **Step 4: Executar o selfcheck para verificar que passa**
  Run: `node server/lib/settingsStore.ts --selfcheck`
  Expected: ok

---

### Task 3: Integrar Sandbox e Política no Factory Runner e Read Jail

**Files:**
- Modify: `server/lib/ai/jail.ts`
- Modify: `server/lib/factory/runner.ts`
- Modify: `server/lib/factory/gates.ts`
- Modify: `server/lib/ai/args.ts`

**Interfaces:**
- Consumes:
  - `detectSandboxDriver`, `wrapCommand` de `server/lib/sandbox/sandbox.ts`
  - `readSettings().sandboxPolicy`
- Produces:
  - `withSandbox` funciona com `bwrap` OU `sandbox-exec`
  - `prepareReadJail` suporta `bwrap` OU `sandbox-exec`
  - `buildFactoryArgs` e `buildArgs` permitem `agy` e modo escrita quando há sandbox (seja bwrap ou sandbox-exec) ou quando `sandboxPolicy === 'relaxed'`
  - `runJailed` em `gates.ts` executa testes dentro de `sandbox-exec` no Mac ou direto se `relaxed`

- [ ] **Step 1: Atualizar testes dos selfchecks para os novos cenários**
  - Em `server/lib/factory/runner.ts`:
    - Adicionar teste com driver `sandbox-exec`.
    - Adicionar teste com modo `relaxed` quando não há sandbox.
  - Em `server/lib/ai/args.ts`:
    - Adicionar teste de `agy` com `sandboxPolicy: 'relaxed'`.

- [ ] **Step 2: Executar testes para verificar que falham**
  Run: `node server/lib/factory/runner.ts --selfcheck && node server/lib/ai/args.ts --selfcheck`
  Expected: FAIL

- [ ] **Step 3: Implementar a integração no Runner, Gates e Jail**
  - Conectar `withSandbox` e `jail` com a abstração de sandbox.
  - Em `buildFactoryArgs`: se sandbox disponível (`bwrap` ou `sandbox-exec`), enjaula. Se não disponível mas `sandboxPolicy === 'relaxed'`, permite rodar com aviso.
  - Em `server/lib/ai/jail.ts`: permitir `prepareReadJail` no macOS usando `sandbox-exec`.
  - Em `server/lib/factory/gates.ts`: permitir execução de verificação no macOS via `sandbox-exec` (e em modo `relaxed` se sem sandbox).

- [ ] **Step 4: Executar selfchecks para verificar que passam**
  Run: `node server/lib/factory/runner.ts --selfcheck && node server/lib/ai/args.ts --selfcheck && node server/lib/ai/jail.ts --selfcheck && node server/lib/factory/gates.ts --selfcheck`
  Expected: Todos ok

---

### Task 4: Atualizar Rotas e Verificações do Sistema

**Files:**
- Modify: `server/routes/factory.ts`
- Modify: `server/lib/doctor/checks.ts`
- Modify: `src/features/factory/FactoryWizard.tsx`
- Modify: `src/features/factory/NewTaskModal.tsx`

- [ ] **Step 1: Atualizar `/factory/preflight` e `checks.ts`**
  - No `server/routes/factory.ts`: retornar `{ bwrap, sandbox: boolean, sandboxDriver: string | null, sandboxPolicy, ... }`.
  - No `server/lib/doctor/checks.ts`: no macOS, checar `sandbox-exec` (ou `bwrap`); no Linux, checar `bwrap`.
  - Executar selfcheck do doctor: `node server/lib/doctor/checks.ts --selfcheck`.

- [ ] **Step 2: Atualizar frontend da Fábrica**
  - Em `FactoryWizard.tsx` e `NewTaskModal.tsx`:
    - `canWrite`: habilitado se `pre.sandbox || pre.bwrap || pre.settings.sandboxPolicy === 'relaxed'`.
    - Mostrar indicador visual adequado: "sandbox ativo (bwrap/sandbox-exec)" ou "modo relaxado (sem isolamento)".

---

### Task 5: UI de Configuração de Sandbox em `/configuracoes`

**Files:**
- Modify: `src/features/settings/AiSection.tsx` (ou nova seção de Sandbox / Segurança)
- Modify: `src/features/settings/SettingsPage.tsx`
- Modify: `src/features/settings/api.ts`

- [ ] **Step 1: Implementar o seletor de Sandbox em Configurações**
  - Exibir status da Sandbox do Sistema:
    - Chip ou badge mostrando o driver detectado (`bwrap (Linux)`, `sandbox-exec (macOS)` ou `Nenhum`).
  - Campo de configuração **Política de Sandbox / Isolamento**:
    - Segmented com duas opções:
      - **Estrito** (`strict`): Exige sandbox para escrita e testes. Recomendado e seguro.
      - **Relaxado** (`relaxed`): Permite execução sem sandbox caso o sistema não suporte.
    - Textos bilíngues completos com `tx({ en, pt })`.
  - Alerta explicativo claro quando `relaxed` for selecionado ou quando nenhum sandbox estiver disponível.

- [ ] **Step 2: Atualizar documentação do manual do usuário se aplicável**
  - Verificar `docs/manual/` se a tela de configurações precisa de menção à nova opção.
  - Executar `node scripts/check-manual.ts`.

---

### Task 6: Verificação Completa e Teste Ponta a Ponta

- [ ] **Step 1: Rodar o pipeline e2e da fábrica**
  Run: `node scripts/check-factory-pipeline.ts`
  Expected: ok

- [ ] **Step 2: Rodar o fluxo e2e da ideação**
  Run: `node scripts/check-ideation-flow.ts`
  Expected: ok

- [ ] **Step 3: Rodar a suíte completa de checagem do repositório**
  Run: `npm run check`
  Expected: Green (código 0)

- [ ] **Step 4: Rodar o build de produção**
  Run: `npm run build`
  Expected: Green (código 0)
