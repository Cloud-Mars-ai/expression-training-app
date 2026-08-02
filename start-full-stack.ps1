param([switch]$NoOpen)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeRoot = Join-Path $projectRoot '.runtime'
$logRoot = Join-Path $projectRoot 'logs'
$npmCache = Join-Path $projectRoot '.npm-cache'
New-Item -ItemType Directory -Force -Path $runtimeRoot, $logRoot, $npmCache | Out-Null

function Load-LocalEnvironment {
  $envFile = Join-Path $projectRoot '.env.local'
  if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) { return }
  foreach ($line in Get-Content -LiteralPath $envFile -Encoding utf8) {
    if ($line -match '^\s*(?<key>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?<value>.*)\s*$' -and -not $line.TrimStart().StartsWith('#')) {
      $value = $Matches.value.Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) { $value = $value.Substring(1, $value.Length - 2) }
      [Environment]::SetEnvironmentVariable($Matches.key, $value, 'Process')
    }
  }
}

Load-LocalEnvironment

function Find-NodeExecutable {
  $candidates = @(
    (Join-Path $projectRoot '.runtime\node\node.exe'),
    'D:\Node.js\node.exe',
    'D:\nodejs\node.exe',
    'E:\Node.js\node.exe',
    'C:\Program Files\nodejs\node.exe'
  )
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($command) { $candidates += $command.Source }
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { return $candidate }
  }
  return $null
}

function Test-HttpEndpoint([string]$Url) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch { return $false }
}

function Find-FreePort([int]$Start, [int]$End) {
  foreach ($port in $Start..$End) {
    $listener = $null
    try {
      $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
      $listener.Start()
      return $port
    } catch { } finally { if ($listener) { $listener.Stop() } }
  }
  throw "No free port is available between $Start and $End."
}

$node = Find-NodeExecutable
if (-not $node) {
  throw 'Node.js 20 or newer was not found. Put a portable Node runtime in .runtime\node or D:\Node.js.'
}
$nodeVersionText = & $node --version
$nodeMajor = [int](($nodeVersionText -replace '^v', '').Split('.')[0])
if ($nodeMajor -lt 20) { throw "Node.js 20 or newer is required. Found $nodeVersionText." }

$nodeDirectory = Split-Path -Parent $node
$env:Path = "$nodeDirectory;$env:Path"
$env:npm_config_cache = $npmCache
$npm = Join-Path $nodeDirectory 'npm.cmd'
$tsx = Join-Path $projectRoot 'node_modules\tsx\dist\cli.mjs'
$vite = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $tsx) -or -not (Test-Path -LiteralPath $vite)) {
  if (-not (Test-Path -LiteralPath $npm)) { throw "npm.cmd was not found next to $node." }
  Write-Host 'Installing project dependencies into the D-drive project...' -ForegroundColor Yellow
  & $npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$serverOut = Join-Path $logRoot "server-$stamp.out.log"
$serverErr = Join-Path $logRoot "server-$stamp.err.log"
$frontendOut = Join-Path $logRoot "frontend-$stamp.out.log"
$frontendErr = Join-Path $logRoot "frontend-$stamp.err.log"
$serverProcess = $null
$frontendProcess = $null
$asrProcess = $null

try {
  $asrPython = Join-Path $projectRoot '.runtime\asr-venv\Scripts\python.exe'
  $asrScript = Join-Path $projectRoot 'server\asr\local_asr_server.py'
  $asrProviderName = if ([string]::IsNullOrWhiteSpace($env:ASR_PROVIDER)) { 'local' } else { $env:ASR_PROVIDER.Trim().ToLowerInvariant() }
  $useCloudAsr = @('cloud', 'external', 'openai-compatible') -contains $asrProviderName
  if (-not $useCloudAsr -and -not $env:LOCAL_ASR_BASE_URL -and (Test-Path -LiteralPath $asrPython) -and (Test-Path -LiteralPath $asrScript)) {
    $asrPort = 9000
    $env:LOCAL_ASR_BASE_URL = "http://127.0.0.1:$asrPort/v1"
    $env:LOCAL_ASR_MODEL = 'small'
    $env:LOCAL_ASR_TIMEOUT_MS = '180000'
    $env:ASR_MODEL = 'small'
    $env:ASR_MODEL_ROOT = Join-Path $projectRoot '.runtime\asr-models'
    $asrReady = Test-HttpEndpoint "http://127.0.0.1:$asrPort/health"
    if (-not $asrReady) {
      $asrOut = Join-Path $logRoot "asr-$stamp.out.log"
      $asrErr = Join-Path $logRoot "asr-$stamp.err.log"
      $asrProcess = Start-Process -FilePath $asrPython -ArgumentList @('-m', 'uvicorn', 'server.asr.local_asr_server:app', '--host', '127.0.0.1', '--port', $asrPort) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $asrOut -RedirectStandardError $asrErr -PassThru
      Set-Content -LiteralPath (Join-Path $runtimeRoot 'asr.pid') -Value $asrProcess.Id -Encoding ascii
      foreach ($attempt in 1..360) {
        if ($asrProcess.HasExited) { break }
        if (Test-HttpEndpoint "http://127.0.0.1:$asrPort/health") { $asrReady = $true; break }
        Start-Sleep -Milliseconds 500
      }
    }
    if (-not $asrReady) { throw "Local ASR did not become ready. See $asrErr" }
  }

  $backendPort = Find-FreePort 8787 8797
  $backendUrl = "http://127.0.0.1:$backendPort"
  $env:PORT = [string]$backendPort
  $env:VITE_API_BASE_URL = $backendUrl
  $serverProcess = Start-Process -FilePath $node -ArgumentList @($tsx, 'server/src/index.ts') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr -PassThru
  Set-Content -LiteralPath (Join-Path $runtimeRoot 'server.pid') -Value $serverProcess.Id -Encoding ascii

  $frontendPort = Find-FreePort 5173 5183
  $frontendProcess = Start-Process -FilePath $node -ArgumentList @($vite, '--host', '127.0.0.1', '--port', $frontendPort, '--strictPort') -WorkingDirectory (Join-Path $projectRoot 'frontend') -WindowStyle Hidden -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr -PassThru
  Set-Content -LiteralPath (Join-Path $runtimeRoot 'frontend.pid') -Value $frontendProcess.Id -Encoding ascii

  $frontendUrl = "http://127.0.0.1:$frontendPort/home"
  $ready = $false
  foreach ($attempt in 1..60) {
    if (($serverProcess -and $serverProcess.HasExited) -or $frontendProcess.HasExited) { break }
    if ((Test-HttpEndpoint "$backendUrl/health") -and (Test-HttpEndpoint $frontendUrl)) { $ready = $true; break }
    Start-Sleep -Milliseconds 250
  }
  if (-not $ready) {
    Write-Host "Server log: $serverErr" -ForegroundColor Yellow
    Write-Host "Frontend log: $frontendErr" -ForegroundColor Yellow
    throw 'The local app did not become ready.'
  }

  Write-Host ''
  Write-Host "Expression Training is running: $frontendUrl" -ForegroundColor Green
  Write-Host "Local API: $backendUrl" -ForegroundColor DarkGray
  Write-Host 'Keep this window open. Press Ctrl+C to stop processes started here.'
  Write-Host ''
  if (-not $NoOpen) { Start-Process $frontendUrl }
  while (-not $frontendProcess.HasExited -and (-not $serverProcess -or -not $serverProcess.HasExited)) { Start-Sleep -Seconds 1 }
} finally {
  foreach ($process in @($frontendProcess, $serverProcess, $asrProcess)) {
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  }
}
