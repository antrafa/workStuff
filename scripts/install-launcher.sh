#!/usr/bin/env bash
# install-launcher.sh - Instala o atalho de 1 clique para o workStuff (macOS e Linux).
# Uso:
#   ./scripts/install-launcher.sh             # Instala o atalho
#   ./scripts/install-launcher.sh --desktop   # Instala também na Área de Trabalho (Desktop)
#   ./scripts/install-launcher.sh --uninstall # Remove os atalhos instalados

set -e

SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
ROOT_DIR="$(cd -P "$(dirname "$SOURCE")/.." && pwd)"
LAUNCHER_SCRIPT="$ROOT_DIR/scripts/workstuff-launcher.sh"
FAVICON_SVG="$ROOT_DIR/public/favicon.svg"

# Garante permissão de execução no script principal
chmod +x "$LAUNCHER_SCRIPT"

INSTALL_DESKTOP=0
if [[ "$*" == *"--desktop"* ]]; then
  INSTALL_DESKTOP=1
fi

UNINSTALL=0
if [[ "$*" == *"--uninstall"* ]]; then
  UNINSTALL=1
fi

# ─── DESINSTALAÇÃO ─────────────────────────────────────────────────────────────
if [ $UNINSTALL -eq 1 ]; then
  echo "Removendo atalhos do workStuff..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    rm -rf "$HOME/Applications/workStuff.app"
    rm -rf "$HOME/Desktop/workStuff.app"
    echo "✓ workStuff.app removido de ~/Applications e ~/Desktop."
  else
    rm -f "$HOME/.local/share/applications/workstuff.desktop"
    rm -f "$HOME/Desktop/workstuff.desktop"
    command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
    echo "✓ workstuff.desktop removido."
  fi
  rm -f "$HOME/.local/bin/workstuff"
  echo "Desinstalação concluída."
  exit 0
fi

# ─── INSTALAÇÃO: macOS ─────────────────────────────────────────────────────────
install_macos() {
  local app_dir="$HOME/Applications/workStuff.app"
  local contents="$app_dir/Contents"
  local macos_bin="$contents/MacOS"
  local resources="$contents/Resources"

  echo "Criando aplicativo macOS em $app_dir..."
  mkdir -p "$macos_bin" "$resources"

  # 1. Gera ícone .icns nativo a partir do SVG
  local icns_target="$resources/workstuff.icns"
  local temp_dir
  temp_dir=$(mktemp -d /tmp/workstuff-icon.XXXXXX)

  if command -v sips >/dev/null 2>&1 && command -v iconutil >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
    # Renderiza SVG em 1024x1024
    python3 -c '
svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="1024" height="1024">
  <rect width="32" height="32" rx="7" fill="#5b9dff"/>
  <path d="M8.5 10.5 14 16l-5.5 5.5" fill="none" stroke="#141511" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M16.5 22h7" stroke="#141511" stroke-width="3" stroke-linecap="round"/>
</svg>"""
import sys
open(sys.argv[1], "w").write(svg)
' "$temp_dir/icon_1024.svg"

    sips -s format png "$temp_dir/icon_1024.svg" --out "$temp_dir/icon_1024.png" >/dev/null 2>&1

    mkdir -p "$temp_dir/workstuff.iconset"
    for size in 16 32 128 256 512; do
      sips -z $size $size "$temp_dir/icon_1024.png" --out "$temp_dir/workstuff.iconset/icon_${size}x${size}.png" >/dev/null 2>&1
      double=$((size * 2))
      if [ $double -le 1024 ]; then
        sips -z $double $double "$temp_dir/icon_1024.png" --out "$temp_dir/workstuff.iconset/icon_${size}x${size}@2x.png" >/dev/null 2>&1
      fi
    done

    iconutil -c icns "$temp_dir/workstuff.iconset" -o "$icns_target" >/dev/null 2>&1
  fi
  rm -rf "$temp_dir"

  # 2. Cria Info.plist
  cat <<'EOF' > "$contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>workStuff</string>
    <key>CFBundleDisplayName</key>
    <string>workStuff</string>
    <key>CFBundleIdentifier</key>
    <string>com.antrafa.workstuff</string>
    <key>CFBundleVersion</key>
    <string>0.1.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleSignature</key>
    <string>????</string>
    <key>CFBundleExecutable</key>
    <string>workstuff-launcher</string>
    <key>CFBundleIconFile</key>
    <string>workstuff.icns</string>
    <key>LSMinimumSystemVersion</key>
    <string>12.0</string>
    <key>LSUIElement</key>
    <false/>
</dict>
</plist>
EOF

  # 3. Cria script de execução do bundle
  cat <<EOF > "$macos_bin/workstuff-launcher"
#!/usr/bin/env bash
exec /bin/bash "$LAUNCHER_SCRIPT" start "\$@"
EOF
  chmod +x "$macos_bin/workstuff-launcher"

  # 4. Opcional: cria atalho na Área de Trabalho
  if [ $INSTALL_DESKTOP -eq 1 ] && [ -d "$HOME/Desktop" ]; then
    rm -rf "$HOME/Desktop/workStuff.app"
    cp -R "$app_dir" "$HOME/Desktop/workStuff.app"
    echo "✓ Atalho criado no Desktop: $HOME/Desktop/workStuff.app"
  fi

  # 5. CLI helper em ~/.local/bin se existir
  if [ -d "$HOME/.local/bin" ]; then
    ln -sf "$LAUNCHER_SCRIPT" "$HOME/.local/bin/workstuff"
    echo "✓ Comando de terminal adicionado: ~/.local/bin/workstuff"
  fi

  echo ""
  echo "🎉 Instalação no macOS concluída com sucesso!"
  echo "• O aplicativo está em: $app_dir"
  echo "• Você pode buscá-lo no Spotlight (Cmd + Barra de espaço -> 'workStuff') ou arrastá-lo para o Dock."
  echo "• Para iniciar com 1 clique: basta abrir o workStuff.app."
  echo "• Para parar: execute './scripts/workstuff-launcher.sh stop' ou use 'workstuff stop'."
}

# ─── INSTALAÇÃO: Linux ─────────────────────────────────────────────────────────
install_linux() {
  local apps_dir="$HOME/.local/share/applications"
  local desktop_file="$apps_dir/workstuff.desktop"

  mkdir -p "$apps_dir"
  echo "Criando entrada de aplicativo Linux em $desktop_file..."

  cat <<EOF > "$desktop_file"
[Desktop Entry]
Version=1.0
Type=Application
Name=workStuff
GenericName=Painel Dev & DevOps
Comment=Painel local para desenvolvedores e DevOps
Exec=/bin/bash "$LAUNCHER_SCRIPT" start
Icon=$FAVICON_SVG
Terminal=false
Categories=Development;IDE;
StartupNotify=true
Keywords=kubernetes;k8s;docker;devops;ai;factory;
EOF

  chmod +x "$desktop_file"

  # Atualiza cache do ambiente gráfico se disponível
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$apps_dir" 2>/dev/null || true
  fi

  # Opcional: cria no Desktop do usuário
  if [ $INSTALL_DESKTOP -eq 1 ] && [ -d "$HOME/Desktop" ]; then
    cp "$desktop_file" "$HOME/Desktop/workstuff.desktop"
    chmod +x "$HOME/Desktop/workstuff.desktop"
    # Se o GNOME exigir marcar como confiável
    command -v gio >/dev/null 2>&1 && gio set "$HOME/Desktop/workstuff.desktop" metadata::trusted true 2>/dev/null || true
    echo "✓ Atalho criado no Desktop: $HOME/Desktop/workstuff.desktop"
  fi

  # CLI helper em ~/.local/bin se existir
  if [ -d "$HOME/.local/bin" ]; then
    ln -sf "$LAUNCHER_SCRIPT" "$HOME/.local/bin/workstuff"
    echo "✓ Comando de terminal adicionado: ~/.local/bin/workstuff"
  fi

  echo ""
  echo "🎉 Instalação no Linux concluída com sucesso!"
  echo "• A entrada foi instalada no seu lançador de aplicativos (menu/dashboard do sistema)."
  echo "• Ícone associado: $FAVICON_SVG"
  echo "• Para iniciar com 1 clique: basta clicar em workStuff no menu de aplicativos."
  echo "• Para parar: execute './scripts/workstuff-launcher.sh stop'."
}

if [[ "$OSTYPE" == "darwin"* ]]; then
  install_macos
else
  install_linux
fi
