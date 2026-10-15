# workStuff — installer (Windows)
#
#   git clone https://github.com/antrafa/workStuff.git "$env:LOCALAPPDATA\workStuff"
#   powershell -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\workStuff\landing\install.ps1"
#
# Runs from inside a clone: stops the panel, updates the code, installs the
# dependencies and adds a Start menu shortcut. Running it again updates.
# -Uninstall stops the panel, removes the shortcut and says how to delete the rest.
# The bash launcher in scripts/ does not run on Windows, so the shortcut starts
# `npm run dev` itself.

param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'

# Node's native type stripping, which the server relies on, landed in 22.18
$NodeMin = [version]'22.18.0'
$Url = 'http://localhost:5180'
$Ports = 5180, 3101
$Root = Split-Path -Parent $PSScriptRoot
$ShortcutPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'workStuff.lnk'

function Ok($msg)   { Write-Host "  [ok] $msg" }
function Warn($msg) { Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "  [x]  $msg" -ForegroundColor Red; exit 1 }

# Left running, the panel keeps serving the old version until someone restarts it.
# Ports 5180 and 3101 are workStuff's own, the same ones the bash launcher frees.
function Stop-Panel {
  $owners = Get-NetTCPConnection -LocalPort $Ports -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  if (-not $owners) { return }
  $owners | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
  Ok 'panel stopped'
}

if ($Uninstall) {
  Write-Host "`nworkStuff - removing`n"
  Stop-Panel
  Remove-Item $ShortcutPath -ErrorAction SilentlyContinue
  Ok 'Start menu shortcut removed'
  Write-Host "`n       The code is still in $Root, and your data in ~\.workstuff."
  Write-Host "       To delete them too: Remove-Item -Recurse -Force `"$Root`", `"$HOME\.workstuff`"`n"
  exit 0
}

Write-Host "`nworkStuff - installing in $Root`n"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail "Node $NodeMin or newer not found. Install it with: winget install -e --id OpenJS.NodeJS.LTS"
}
$nodeVersion = [version]((node -v).TrimStart('v'))
if ($nodeVersion -lt $NodeMin) {
  Fail "Node $nodeVersion is too old; workStuff needs $NodeMin or newer. Update with: winget upgrade -e --id OpenJS.NodeJS.LTS"
}
Ok "Node $nodeVersion"

Stop-Panel

git -C $Root rev-parse --git-dir *> $null
if ($LASTEXITCODE -ne 0) {
  Warn "$Root is not a git clone: skipping the code update."
} else {
  git -C $Root pull --ff-only --quiet *> $null
  if ($LASTEXITCODE -eq 0) { Ok "code updated: $(git -C $Root log -1 --format='%h %s')" }
  else { Warn 'git pull did not move (local changes, no upstream or diverged branch); keeping the current code.' }
}

Push-Location $Root
try {
  npm install --no-fund --no-audit --loglevel=error
  if ($LASTEXITCODE -ne 0) { Fail 'npm install failed; see the messages above.' }
} finally { Pop-Location }
Ok 'dependencies installed'

# The browser opens a few seconds after the server starts, from a hidden cmd.
# ponytail: fixed delay instead of polling the port; raise it if the page opens too early.
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($ShortcutPath)
$shortcut.TargetPath = (Get-Command powershell).Source
$shortcut.Arguments = "-NoExit -Command `"Start-Process cmd -ArgumentList '/c timeout /t 6 >nul & start $Url' -WindowStyle Hidden; npm run dev`""
$shortcut.WorkingDirectory = $Root
$shortcut.Description = "workStuff: starts the local panel at $Url"
$shortcut.Save()
Ok "Start menu shortcut: $ShortcutPath"

Write-Host ''
Ok 'workStuff installed. Open it from the Start menu (workStuff); close its window to stop it.'
Write-Host "       Update: powershell -ExecutionPolicy Bypass -File `"$Root\landing\install.ps1`""
Write-Host "       Remove: powershell -ExecutionPolicy Bypass -File `"$Root\landing\install.ps1`" -Uninstall`n"
