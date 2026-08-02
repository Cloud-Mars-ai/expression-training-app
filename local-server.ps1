param(
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$deliveryRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$appRoot = [System.IO.Path]::GetFullPath((Join-Path $deliveryRoot 'app'))
$appRootPrefix = $appRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$address = [System.Net.IPAddress]::Loopback
$port = 4173
$listener = $null

while ($port -le 4189) {
  try {
    $listener = [System.Net.Sockets.TcpListener]::new($address, $port)
    $listener.Start()
    break
  }
  catch {
    if ($listener) {
      $listener.Stop()
      $listener = $null
    }
    $port += 1
  }
}

if (-not $listener) {
  throw 'Ports 4173 through 4189 are unavailable.'
}

$mimeTypes = @{
  '.css'   = 'text/css; charset=utf-8'
  '.html'  = 'text/html; charset=utf-8'
  '.ico'   = 'image/x-icon'
  '.jpeg'  = 'image/jpeg'
  '.jpg'   = 'image/jpeg'
  '.js'    = 'text/javascript; charset=utf-8'
  '.json'  = 'application/json; charset=utf-8'
  '.png'   = 'image/png'
  '.svg'   = 'image/svg+xml'
  '.webp'  = 'image/webp'
  '.woff'  = 'font/woff'
  '.woff2' = 'font/woff2'
}

function Send-Response {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [string]$StatusText,
    [string]$ContentType,
    [byte[]]$Body,
    [string]$CacheControl = 'no-cache'
  )

  $header = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: $CacheControl`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($Body.Length -gt 0) {
    $Stream.Write($Body, 0, $Body.Length)
  }
  $Stream.Flush()
}

$url = "http://127.0.0.1:$port/home"
Write-Host ''
Write-Host "Expression Training APP is running: $url" -ForegroundColor Green
Write-Host 'Keep this window open. Press Ctrl+C to stop the local server.'
Write-Host ''

if (-not $NoOpen) {
  Start-Process $url
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()

      if ([string]::IsNullOrWhiteSpace($requestLine)) {
        continue
      }

      while ($true) {
        $line = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($line)) { break }
      }

      $parts = $requestLine.Split(' ')
      if ($parts.Length -lt 2 -or $parts[0] -ne 'GET') {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Only GET requests are supported.')
        Send-Response -Stream $stream -StatusCode 405 -StatusText 'Method Not Allowed' -ContentType 'text/plain; charset=utf-8' -Body $body
        continue
      }

      $requestUri = [System.Uri]::new("http://127.0.0.1$($parts[1])")
      $decodedPath = [System.Uri]::UnescapeDataString($requestUri.AbsolutePath).TrimStart('/')
      $relativePath = $decodedPath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
      $candidate = [System.IO.Path]::GetFullPath((Join-Path $appRoot $relativePath))

      if ($candidate -ne $appRoot -and -not $candidate.StartsWith($appRootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
        Send-Response -Stream $stream -StatusCode 403 -StatusText 'Forbidden' -ContentType 'text/plain; charset=utf-8' -Body $body
        continue
      }

      if (Test-Path -LiteralPath $candidate -PathType Container) {
        $candidate = Join-Path $candidate 'index.html'
      }

      if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        if ([System.IO.Path]::GetExtension($relativePath)) {
          $body = [System.Text.Encoding]::UTF8.GetBytes('File not found')
          Send-Response -Stream $stream -StatusCode 404 -StatusText 'Not Found' -ContentType 'text/plain; charset=utf-8' -Body $body
          continue
        }
        $candidate = Join-Path $appRoot 'index.html'
      }

      $extension = [System.IO.Path]::GetExtension($candidate).ToLowerInvariant()
      $contentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { 'application/octet-stream' }
      $cacheControl = if ($extension -eq '.html') { 'no-cache' } else { 'public, max-age=31536000, immutable' }
      $body = [System.IO.File]::ReadAllBytes($candidate)
      Send-Response -Stream $stream -StatusCode 200 -StatusText 'OK' -ContentType $contentType -Body $body -CacheControl $cacheControl
    }
    catch {
      if ($stream) {
        $body = [System.Text.Encoding]::UTF8.GetBytes('The local server failed to process the request.')
        try { Send-Response -Stream $stream -StatusCode 500 -StatusText 'Internal Server Error' -ContentType 'text/plain; charset=utf-8' -Body $body } catch {}
      }
    }
    finally {
      if ($reader) { $reader.Dispose() }
      if ($stream) { $stream.Dispose() }
      $client.Close()
    }
  }
}
finally {
  $listener.Stop()
}
