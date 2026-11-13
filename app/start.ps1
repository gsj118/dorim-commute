$ErrorActionPreference = 'Stop'
$appDirectory = $PSScriptRoot
$viteEntry = Join-Path $appDirectory 'node_modules/vite/bin/vite.js'
if (-not (Test-Path -LiteralPath $viteEntry)) {
    throw '의존성이 없습니다. app 디렉터리에서 pnpm install --frozen-lockfile을 먼저 실행하세요.'
}
$nodeCommand = Get-Command node -ErrorAction Stop
Push-Location -LiteralPath $appDirectory
try {
    & $nodeCommand.Source $viteEntry --host 127.0.0.1 --port 5173 --strictPort
} finally {
    Pop-Location
}
