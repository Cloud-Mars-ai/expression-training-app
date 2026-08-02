param(
  [string]$OutputPath = ".tmp\deploy\expression-training.tar.gz"
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$target = if ([System.IO.Path]::IsPathRooted($OutputPath)) { $OutputPath } else { Join-Path $projectRoot $OutputPath }
if (Test-Path -LiteralPath $target) { throw "Release bundle already exists: $target" }
$targetDirectory = Split-Path -Parent $target
New-Item -ItemType Directory -Force -Path $targetDirectory | Out-Null

Push-Location $projectRoot
try {
  & tar.exe -czf $target `
    --exclude=.git `
    --exclude=node_modules `
    --exclude=.runtime `
    --exclude=.tmp `
    --exclude=.npm-cache `
    --exclude=logs `
    '--exclude=.env' `
    '--exclude=.env.*' `
    --exclude=coverage `
    --exclude=__pycache__ `
    '--exclude=*.pyc' `
    '--exclude=*.sqlite*' `
    '--exclude=*.db' `
    '--exclude=*.pem' `
    '--exclude=*.key' `
    --exclude=frontend/dist `
    --exclude=frontend/test-results `
    --exclude=server/var `
    --exclude=server/storage `
    --exclude=server/uploads `
    .
  if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $target
[pscustomobject]@{
  Path = $target
  Bytes = (Get-Item -LiteralPath $target).Length
  Sha256 = $hash.Hash.ToLowerInvariant()
}
