#!/usr/bin/env bash
# workStuff — installer (macOS / Linux)
#
#   git clone https://github.com/antrafa/workStuff.git ~/.local/share/workstuff \
#     && bash ~/.local/share/workstuff/landing/install.sh
#
# Runs from inside a clone: updates the code, installs the dependencies and adds the
# one-click launcher with scripts/install-launcher.sh. Running it again updates,
# stopping the panel first. Arguments go to install-launcher (e.g. --desktop);
# --uninstall removes the launcher and says how to delete the rest.
#
# The body lives in functions and the last line ends with `exit`: `git pull` may
# rewrite this file while it runs, and bash reads scripts a chunk at a time.

set -euo pipefail

# Node's native type stripping, which the server relies on, landed in 22.18
NODE_MIN_MAJOR=22
NODE_MIN_MINOR=18

ok()   { printf '  [ok] %s\n' "$1"; }
warn() { printf '  [!]  %s\n' "$1"; }
fail() { printf '  [x]  %s\n' "$1" >&2; }

node_is_enough() {
  command -v node >/dev/null 2>&1 || return 1
  local major minor
  IFS=. read -r major minor _ <<< "$(node -v | sed 's/^v//')"
  [ "$major" -gt "$NODE_MIN_MAJOR" ] || { [ "$major" -eq "$NODE_MIN_MAJOR" ] && [ "$minor" -ge "$NODE_MIN_MINOR" ]; }
}

ensure_node() {
  # nvm is not on the PATH of a non-interactive shell; load it by hand. `nvm use`
  # only affects this process: the caller's shell keeps its Node.
  if ! node_is_enough && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    nvm use --lts >/dev/null 2>&1 || true
  fi
  if ! node_is_enough; then
    fail "Node $NODE_MIN_MAJOR.$NODE_MIN_MINOR or newer not found."
    printf '       Install it from https://nodejs.org/en/download and run this again.\n'
    exit 1
  fi
  ok "Node $(node -v) at $(command -v node)"
}

update_clone() {
  local root="$1"
  if ! git -C "$root" rev-parse --git-dir >/dev/null 2>&1; then
    warn "$root is not a git clone: skipping the code update."
    return 0
  fi
  if git -C "$root" pull --ff-only --quiet 2>/dev/null; then
    ok "code updated: $(git -C "$root" log -1 --format='%h %s' | cut -c1-70)"
  else
    warn "git pull did not move (local changes, no upstream or diverged branch); keeping the current code."
  fi
}

# Stops the panel before the code changes: left running, it keeps serving the old
# version until someone restarts it. The launcher's stop is used only when the
# launcher started the panel (a PID is recorded), because it also kills whatever
# listens on ports 5180 and 3101.
stop_panel() {
  local root="$1"
  if [ -f "${WORKSTUFF_HOME:-$HOME/.workstuff}/workstuff.pid" ]; then
    bash "$root/scripts/workstuff-launcher.sh" stop >/dev/null
    ok "panel stopped"
  elif (echo >/dev/tcp/127.0.0.1/5180) >/dev/null 2>&1; then
    warn "port 5180 is in use, but not by a workStuff started from the launcher. If it is one you started by hand, close it yourself."
  fi
}

uninstall() {
  local root="$1"
  printf '\nworkStuff — removing\n\n'
  stop_panel "$root"
  bash "$root/scripts/install-launcher.sh" --uninstall >/dev/null
  ok "launcher and workstuff command removed"
  printf '\n       The code is still in %s, and your data in ~/.workstuff.\n' "$root"
  printf '       To delete them too: rm -rf %s ~/.workstuff\n\n' "$root"
}

main() {
  local root
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

  if [ "${1:-}" = "--uninstall" ]; then
    uninstall "$root"
    return 0
  fi

  printf '\nworkStuff — installing in %s\n\n' "$root"
  ensure_node
  stop_panel "$root"
  update_clone "$root"

  (cd "$root" && npm install --no-fund --no-audit --loglevel=error)
  ok "dependencies installed"

  printf '\n'
  bash "$root/scripts/install-launcher.sh" "$@"

  printf '\n'
  ok "workStuff installed. Open it from the app menu (workStuff) or run: bash $root/scripts/workstuff-launcher.sh"
  printf '       Update: bash %s/landing/install.sh\n' "$root"
  printf '       Remove: bash %s/landing/install.sh --uninstall\n\n' "$root"
}

main "$@"; exit $?
