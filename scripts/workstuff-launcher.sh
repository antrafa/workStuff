#!/usr/bin/env bash
# workStuff launcher - Inicia, para e monitora o painel local (macOS e Linux).
# Funciona tanto no terminal quanto invocado por atalhos gráficos (.app / .desktop).

set -e

# 1. Localiza a raiz do projeto mesmo se chamado via symlink ou subdiretório
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
ROOT_DIR="$(cd -P "$(dirname "$SOURCE")/.." && pwd)"

DATA_DIR="${WORKSTUFF_HOME:-$HOME/.workstuff}"
LOGS_DIR="$DATA_DIR/logs"
PID_FILE="$DATA_DIR/workstuff.pid"
LOG_FILE="$LOGS_DIR/workstuff.log"

PORT_WEB=5180
PORT_API=3101
URL_WEB="http://localhost:$PORT_WEB"

mkdir -p "$LOGS_DIR"

# 2. Garante acesso ao Node.js mesmo em ambientes GUI onde o PATH é reduzido
ensure_node_env() {
  # Se node e npm já estão no PATH, tudo certo
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    return 0
  fi

  # Tenta caminhos comuns de gerenciadores de versão e Homebrew
  local candidate_paths=(
    "/opt/homebrew/bin"
    "/usr/local/bin"
    "$HOME/.local/bin"
    "$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)/bin"
    "$HOME/.local/share/fnm/current/bin"
    "$HOME/.fnm/current/bin"
    "$HOME/.asdf/shims"
    "$HOME/.local/share/mise/shims"
    "$HOME/.volta/bin"
  )

  for p in "${candidate_paths[@]}"; do
    if [ -d "$p" ] && [[ ":$PATH:" != *":$p:"* ]]; then
      export PATH="$p:$PATH"
    fi
  done

  # Tenta carregar NVM se existir
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    source "$HOME/.nvm/nvm.sh" 2>/dev/null || true
  fi

  # Última tentativa: se ainda não achou, avisa
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo "Erro: Node.js e npm não foram encontrados no PATH." >&2
    echo "Certifique-se de ter o Node.js 22.18+ instalado." >&2
    notify_desktop "Erro workStuff" "Node.js e npm não foram encontrados no PATH."
    exit 1
  fi
}

# 3. Notificação nativa na área de trabalho (macOS ou Linux)
notify_desktop() {
  local title="$1"
  local message="$2"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    osascript -e "display notification \"$message\" with title \"$title\"" 2>/dev/null || true
  elif command -v notify-send >/dev/null 2>&1; then
    notify-send "$title" "$message" 2>/dev/null || true
  fi
}

# 4. Abre o painel numa janela própria do Chrome (modo app: sem abas nem barra de endereço);
# sem Chrome, cai no navegador padrão. O perfil separado faz o Chrome abrir um processo novo, que
# respeita --class: é por essa classe que o GNOME liga a janela ao ícone do workstuff.desktop.
CHROME_PROFILE="$DATA_DIR/chrome-app"

find_chrome() {
  local bin
  for bin in google-chrome google-chrome-stable chromium chromium-browser; do
    command -v "$bin" >/dev/null 2>&1 && { echo "$bin"; return 0; }
  done
  return 1
}

# No GNOME em X11 a barra de título da janela em modo app vem do tema do sistema (clara no Yaru).
# Pedir a variante escura deixa a barra na cor do painel. Espera a janela aparecer, até 15 s.
# ponytail: sempre escura (o tema padrão do painel); o tema claro fica com a barra escura.
darken_title_bar() {
  [ "${XDG_SESSION_TYPE:-x11}" = "x11" ] && command -v xprop >/dev/null 2>&1 || return 0
  local i w found=0
  for i in $(seq 30); do
    for w in $(xprop -root _NET_CLIENT_LIST 2>/dev/null | grep -o '0x[0-9a-f]*'); do
      if xprop -id "$w" WM_CLASS 2>/dev/null | grep -q '"workstuff"'; then
        xprop -id "$w" -f _GTK_THEME_VARIANT 8u -set _GTK_THEME_VARIANT dark 2>/dev/null && found=1
      fi
    done
    [ $found -eq 1 ] && return 0
    sleep 0.5
  done
}

open_browser() {
  local url="$1" chrome
  if [[ "$OSTYPE" == "darwin"* ]] && [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --user-data-dir="$CHROME_PROFILE" --no-first-run --app="$url"
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    open "$url"
  elif chrome=$(find_chrome); then
    nohup "$chrome" --user-data-dir="$CHROME_PROFILE" --no-first-run --no-default-browser-check --class=workstuff --app="$url" >/dev/null 2>&1 &
    darken_title_bar &
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 &
  elif command -v python3 >/dev/null 2>&1; then
    python3 -m webbrowser "$url" >/dev/null 2>&1 &
  fi
}

# 5. Verifica se uma porta local está ouvindo
is_port_open() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -i ":$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  elif command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$port" >/dev/null 2>&1
    return $?
  fi
  # Fallback: tentar conexão bash
  (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1
}

# Verdadeiro quando o PID lidera o próprio grupo de processos e é o npm iniciado pelo start
is_launcher_group() {
  local pid="$1" pgid command
  pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ') || return 1
  command=$(ps -o command= -p "$pid" 2>/dev/null) || return 1
  [ "$pgid" = "$pid" ] && [[ "$command" == *npm* ]]
}

# 6. Ação: START
start_app() {
  ensure_node_env

  if is_port_open "$PORT_WEB"; then
    echo "workStuff já está rodando em $URL_WEB."
    notify_desktop "workStuff" "Já em execução em $URL_WEB. Abrindo no navegador..."
    open_browser "$URL_WEB"
    exit 0
  fi

  echo "Iniciando workStuff em segundo plano..."
  echo "Logs em: $LOG_FILE"

  cd "$ROOT_DIR"

  # Executa npm run dev desacoplado com nohup, num grupo de processos próprio (set -m):
  # stop e o botão de encerrar do painel sinalizam o grupo inteiro, sem deixar o Vite órfão
  set -m
  nohup npm run dev > "$LOG_FILE" 2>&1 &
  local pid=$!
  set +m
  echo "$pid" > "$PID_FILE"

  # Aguarda a porta web responder (até 25 segundos)
  local max_wait=50
  local count=0
  local ready=0

  while [ $count -lt $max_wait ]; do
    if is_port_open "$PORT_WEB"; then
      ready=1
      break
    fi
    # Se o processo morreu antes de abrir porta, aborta
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "Falha ao iniciar: o processo encerrou prematuramente." >&2
      echo "Últimas linhas do log ($LOG_FILE):" >&2
      tail -n 15 "$LOG_FILE" >&2
      notify_desktop "workStuff" "Falha ao iniciar. Verifique $LOG_FILE"
      exit 1
    fi
    sleep 0.5
    count=$((count + 1))
  done

  if [ $ready -eq 1 ]; then
    echo "workStuff pronto em $URL_WEB (PID $pid)"
    notify_desktop "workStuff" "Pronto em $URL_WEB"
    open_browser "$URL_WEB"
  else
    echo "Aviso: Tempo limite aguardando inicialização da porta $PORT_WEB." >&2
    echo "Verifique os logs em $LOG_FILE" >&2
    open_browser "$URL_WEB"
  fi
}

# 7. Ação: STOP
stop_app() {
  echo "Parando workStuff..."
  local stopped=0

  # Se houver arquivo PID
  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null || true)
    # Só sinaliza se o PID ainda é o líder do grupo que o start criou rodando npm:
    # depois de um reboot o número pode ter sido reusado por outro processo
    if [ -n "$pid" ] && is_launcher_group "$pid"; then
      kill -TERM -- "-$pid" 2>/dev/null || true
      stopped=1
    fi
    rm -f "$PID_FILE"
  fi

  # Garante que portas 5180 e 3101 fiquem livres caso processos órfãos tenham ficado
  if command -v lsof >/dev/null 2>&1; then
    local pids_web
    pids_web=$(lsof -ti ":$PORT_WEB" 2>/dev/null || true)
    if [ -n "$pids_web" ]; then
      # shellcheck disable=SC2086
      kill -9 $pids_web 2>/dev/null || true
      stopped=1
    fi

    local pids_api
    pids_api=$(lsof -ti ":$PORT_API" 2>/dev/null || true)
    if [ -n "$pids_api" ]; then
      # shellcheck disable=SC2086
      kill -9 $pids_api 2>/dev/null || true
      stopped=1
    fi
  fi

  if [ $stopped -eq 1 ]; then
    echo "workStuff parado com sucesso."
    notify_desktop "workStuff" "Aplicação parada."
  else
    echo "Nenhuma instância ativa do workStuff encontrada."
  fi
}

# 8. Ação: STATUS
status_app() {
  echo "=== Status workStuff ==="
  local web_active=0
  local api_active=0

  if is_port_open "$PORT_WEB"; then
    web_active=1
  fi
  if is_port_open "$PORT_API"; then
    api_active=1
  fi

  if [ $web_active -eq 1 ] || [ $api_active -eq 1 ]; then
    echo "Estado: ATIVO"
    echo "Frontend Web (porta $PORT_WEB): $([ $web_active -eq 1 ] && echo "Online ($URL_WEB)" || echo "Inativo")"
    echo "Backend API  (porta $PORT_API): $([ $api_active -eq 1 ] && echo "Online (http://127.0.0.1:$PORT_API)" || echo "Inativo")"
    if [ -f "$PID_FILE" ]; then
      echo "PID registrado: $(cat "$PID_FILE")"
    fi
  else
    echo "Estado: PARADO"
  fi
  echo "Arquivo de logs: $LOG_FILE"
}

# 9. Ação: LOGS
logs_app() {
  if [ -f "$LOG_FILE" ]; then
    tail -f -n 50 "$LOG_FILE"
  else
    echo "Arquivo de logs ainda não criado ($LOG_FILE)."
  fi
}

case "${1:-start}" in
  start)
    start_app
    ;;
  stop)
    stop_app
    ;;
  restart)
    stop_app
    sleep 1
    start_app
    ;;
  status)
    status_app
    ;;
  logs)
    logs_app
    ;;
  *)
    echo "Uso: $0 [start|stop|restart|status|logs]"
    exit 1
    ;;
esac
