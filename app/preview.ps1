$ErrorActionPreference = 'Stop'
$appDirectory = $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $appDirectory 'dist/index.html'))) {
    throw '빌드 결과가 없습니다. app 폴더에서 pnpm build를 먼저 실행하세요.'
}
$nodeCommand = Get-Command node -ErrorAction Stop
Push-Location -LiteralPath $appDirectory
try {
    & $nodeCommand.Source 'node_modules/vite/bin/vite.js' preview --host 127.0.0.1 --port 5173 --strictPort
} finally {
    Pop-Location
}
