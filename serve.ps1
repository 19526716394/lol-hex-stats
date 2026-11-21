param(
  [int]$Port = 8765,
  [int]$RefreshMinutes = 30,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir = Join-Path $Root "data"
$LogDir = Join-Path $Root "logs"
foreach ($d in @($DataDir, $LogDir)) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
}
$LogFile = Join-Path $LogDir "serve.log"
$StatusFile = Join-Path $DataDir "status.json"
$Utf8 = New-Object Text.UTF8Encoding($false)
$StartedAt = [DateTimeOffset]::Now
$script:refreshProc = $null
$script:lastRefresh = (Get-Date).AddMinutes(-1 * $RefreshMinutes)

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f ([DateTimeOffset]::Now.ToString("yyyy-MM-dd HH:mm:ss")), $msg
  Write-Host $line
  try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch { }
}

function Read-Status {
  try {
    if (-not (Test-Path $StatusFile)) { return $null }
    $raw = [IO.File]::ReadAllText($StatusFile, $Utf8)
    if (-not $raw.Trim()) { return $null }
    return ($raw | ConvertFrom-Json)
  } catch { return $null }
}

function Write-QueuedStatus {
  $obj = [ordered]@{
    state = "running"
    stage = "queued"
    message = "刷新任务已排队"
    startedAt = [DateTimeOffset]::Now.ToString("yyyy-MM-dd HH:mm:ss")
    updatedAt = [DateTimeOffset]::Now.ToString("yyyy-MM-dd HH:mm:ss")
    error = ""
  }
  try { [IO.File]::WriteAllText($StatusFile, ($obj | ConvertTo-Json -Depth 4), $Utf8) } catch { }
}

function Get-RefreshProcesses {
  try {
    return @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction Stop |
      Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine -like "*-File*refresh.ps1*" })
  } catch { return @() }
}

function Test-RefreshRunning {
  if ($null -ne $script:refreshProc) {
    try { if (-not $script:refreshProc.HasExited) { return $true } } catch { }
  }
  # 状态文件可能残留 running；以实际 refresh.ps1 进程为准。
  if ((Get-RefreshProcesses).Count -gt 0) { return $true }
  return $false
}

function Start-Refresh {
  if (Test-RefreshRunning) { return $false }
  Write-QueuedStatus
  $refreshScript = Join-Path $Root "refresh.ps1"
  if (-not (Test-Path $refreshScript)) {
    Write-Log "ERROR 找不到 refresh.ps1"
    return $false
  }
  $argLine = '-NoProfile -ExecutionPolicy Bypass -File "' + $refreshScript + '" -ArenaTop 30'
  try {
    # 用 ShellExecute 启动，避免刷新子进程继承 server 的监听 socket；
    # 否则 serve 退出后 refresh 仍会占着 8765，导致下次启动报端口占用。
    $script:refreshProc = Start-Process -FilePath "powershell.exe" -ArgumentList $argLine -WorkingDirectory $Root -WindowStyle Hidden -PassThru
    $script:lastRefresh = Get-Date
    Write-Log "启动刷新进程 PID=$($script:refreshProc.Id)"
    return $true
  } catch {
    Write-Log "ERROR 启动刷新失败：$($_.Exception.Message)"
    $obj = [ordered]@{
      state = "error"; stage = "start"; message = "无法启动刷新进程"
      startedAt = [DateTimeOffset]::Now.ToString("yyyy-MM-dd HH:mm:ss")
      updatedAt = [DateTimeOffset]::Now.ToString("yyyy-MM-dd HH:mm:ss")
      error = $_.Exception.Message
    }
    try { [IO.File]::WriteAllText($StatusFile, ($obj | ConvertTo-Json -Depth 4), $Utf8) } catch { }
    return $false
  }
}

function Get-ContentType([string]$path) {
  switch ([IO.Path]::GetExtension($path).ToLowerInvariant()) {
    ".html" { return "text/html; charset=utf-8" }
    ".css"  { return "text/css; charset=utf-8" }
    ".js"   { return "application/javascript; charset=utf-8" }
    ".json" { return "application/json; charset=utf-8" }
    ".png"  { return "image/png" }
    ".jpg"  { return "image/jpeg" }
    ".jpeg" { return "image/jpeg" }
    ".webp" { return "image/webp" }
    ".svg"  { return "image/svg+xml" }
    ".ico"  { return "image/x-icon" }
    ".txt"  { return "text/plain; charset=utf-8" }
    default { return "application/octet-stream" }
  }
}

function Send-Bytes($stream, [int]$status, [string]$contentType, [byte[]]$body, [string]$cacheControl = "no-store", [bool]$headOnly = $false) {
  $reason = switch ($status) {
    200 { "OK" }
    202 { "Accepted" }
    204 { "No Content" }
    400 { "Bad Request" }
    404 { "Not Found" }
    405 { "Method Not Allowed" }
    409 { "Conflict" }
    500 { "Internal Server Error" }
    default { "OK" }
  }
  $headers = "HTTP/1.1 $status $reason`r`n" +
    "Content-Type: $contentType`r`n" +
    "Content-Length: $($body.Length)`r`n" +
    "Cache-Control: $cacheControl`r`n" +
    "X-Content-Type-Options: nosniff`r`n" +
    "Connection: close`r`n`r`n"
  $hb = $Utf8.GetBytes($headers)
  $stream.Write($hb, 0, $hb.Length)
  if (-not $headOnly -and $body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
  $stream.Flush()
}

function Send-Json($stream, [int]$status, $obj, [bool]$headOnly = $false) {
  $json = $obj | ConvertTo-Json -Depth 6 -Compress
  Send-Bytes $stream $status "application/json; charset=utf-8" ($Utf8.GetBytes($json)) "no-store" $headOnly
}

function Send-Text($stream, [int]$status, [string]$text, [bool]$headOnly = $false) {
  Send-Bytes $stream $status "text/plain; charset=utf-8" ($Utf8.GetBytes($text)) "no-store" $headOnly
}

function Resolve-StaticPath([string]$urlPath) {
  if ($urlPath -eq "/" -or $urlPath -eq "") { $urlPath = "/index.html" }
  $rel = $urlPath.TrimStart("/").Replace("/", [IO.Path]::DirectorySeparatorChar)
  if ($rel -match '\.\.' -or $rel -match '^[A-Za-z]:') { return $null }
  $full = [IO.Path]::GetFullPath((Join-Path $Root $rel))
  $rootFull = [IO.Path]::GetFullPath($Root)
  if (-not $full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) { return $null }
  return $full
}

try {
  $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Port)
  $listener.Start()
} catch {
  Write-Host "无法监听 127.0.0.1:$Port ：$($_.Exception.Message)"
  try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
      $ownerPid = [int]$c.OwningProcess
      $op = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
      if ($op) { Write-Host "端口被 PID $ownerPid（$($op.ProcessName)）占用。" }
      else { Write-Host "端口监听记录属于已退出的 PID $ownerPid，常见原因是旧的 refresh.ps1 子进程继承了监听句柄。" }
    }
  } catch { }
  Write-Host "请关闭旧的 serve.ps1 / refresh.ps1，或结束占用端口的进程后重试。"
  exit 1
}

Write-Log "===== HEXSTATS 服务启动：http://127.0.0.1:$Port/ （自动刷新间隔 $RefreshMinutes 分钟）====="
Write-Host ""
Write-Host "  海克斯数据榜已启动" -ForegroundColor Green
Write-Host "  地址：http://127.0.0.1:$Port/" -ForegroundColor Cyan
Write-Host "  关闭此窗口即可停止服务。" -ForegroundColor DarkGray
Write-Host ""

if (-not $NoBrowser) {
  try { Start-Process ("http://127.0.0.1:$Port/") | Out-Null } catch { }
}

# 启动时判断快照是否过期：过期则立即刷新，新鲜则从生成时间继续计时
try {
  $snapFile = Join-Path $DataDir "snapshot.json"
  if (Test-Path $snapFile) {
    $snapMeta = [IO.File]::ReadAllText($snapFile, $Utf8) | ConvertFrom-Json
    $genAt = [DateTimeOffset]::Parse([string]$snapMeta.generatedAt)
    $ageMin = ([DateTimeOffset]::Now - $genAt).TotalMinutes
    if ($ageMin -lt $RefreshMinutes) {
      $script:lastRefresh = $genAt.LocalDateTime
      Write-Log ("快照生成于 {0}，{1:N0} 分钟前，暂不立即刷新" -f $genAt.ToString("yyyy-MM-dd HH:mm:ss"), $ageMin)
    } else {
      Write-Log ("快照已过期（{0:N0} 分钟前），启动后立即刷新" -f $ageMin)
    }
  }
} catch {
  Write-Log "无法读取快照时间，启动后立即刷新：$($_.Exception.Message)"
}

while ($true) {
  try {
    if ($listener.Pending()) {
      $client = $listener.AcceptTcpClient()
      $client.ReceiveTimeout = 8000
      $client.SendTimeout = 8000
      $stream = $client.GetStream()
      try {
        # 读取请求头
        $headerBytes = New-Object System.Collections.Generic.List[byte]
        $one = New-Object byte[] 1
        $headerEnd = $false
        while ($headerBytes.Count -lt 32768) {
          $n = $stream.Read($one, 0, 1)
          if ($n -le 0) { break }
          $headerBytes.Add($one[0])
          $c = $headerBytes.Count
          if ($c -ge 4 -and $headerBytes[$c-4] -eq 13 -and $headerBytes[$c-3] -eq 10 -and $headerBytes[$c-2] -eq 13 -and $headerBytes[$c-1] -eq 10) {
            $headerEnd = $true
            break
          }
        }
        if (-not $headerEnd) { $client.Close(); continue }
        $headerText = $Utf8.GetString($headerBytes.ToArray())
        $lines = $headerText -split "`r`n"
        $requestLine = $lines[0]
        $parts = $requestLine -split ' '
        if ($parts.Count -lt 2) { Send-Text $stream 400 "Bad Request"; $client.Close(); continue }
        $method = $parts[0].ToUpperInvariant()
        $rawPath = $parts[1]
        $qIndex = $rawPath.IndexOf("?")
        if ($qIndex -ge 0) { $rawPath = $rawPath.Substring(0, $qIndex) }
        try { $path = [Uri]::UnescapeDataString($rawPath) } catch { $path = $rawPath }

        # 读取请求体（主要为 POST）
        $contentLength = 0
        foreach ($line in $lines) {
          if ($line -match '^(?i)Content-Length:\s*(\d+)') { $contentLength = [int]$Matches[1] }
        }
        if ($contentLength -gt 0 -and $contentLength -lt 1048576) {
          $bodyBuf = New-Object byte[] $contentLength
          $read = 0
          while ($read -lt $contentLength) {
            $n = $stream.Read($bodyBuf, $read, $contentLength - $read)
            if ($n -le 0) { break }
            $read += $n
          }
        }

        $headOnly = ($method -eq "HEAD")
        $cache = "no-store"

        if ($path -eq "/api/snapshot" -or $path -eq "/api/snapshot/") {
          $file = Join-Path $DataDir "snapshot.json"
          if (Test-Path $file) {
            $bytes = [IO.File]::ReadAllBytes($file)
            Send-Bytes $stream 200 "application/json; charset=utf-8" $bytes "no-store" $headOnly
          } else {
            Send-Json $stream 404 @{ error = "snapshot not ready" } $headOnly
          }
        }
        elseif ($path -eq "/api/status" -or $path -eq "/api/status/") {
          $st = Read-Status
          if ($null -eq $st) { $st = @{ state = "unknown"; stage = ""; message = "尚无刷新记录"; updatedAt = ""; error = "" } }
          Send-Json $stream 200 $st $headOnly
        }
        elseif ($path -eq "/api/config" -or $path -eq "/api/config/") {
          Send-Json $stream 200 @{
            port = $Port
            refreshMinutes = $RefreshMinutes
            autoRefresh = $true
            mode = "aram"
            startedAt = $StartedAt.ToString("yyyy-MM-dd HH:mm:ss")
          } $headOnly
        }
        elseif ($path -eq "/api/refresh" -or $path -eq "/api/refresh/") {
          if ($method -ne "POST") {
            Send-Json $stream 405 @{ error = "POST only" } $headOnly
          } elseif (Test-RefreshRunning) {
            Send-Json $stream 409 @{ started = $false; error = "refresh already running" } $headOnly
          } else {
            $ok = Start-Refresh
            if ($ok) { Send-Json $stream 202 @{ started = $true } $headOnly }
            else { Send-Json $stream 500 @{ started = $false; error = "failed to start" } $headOnly }
          }
        }
        elseif ($method -eq "GET" -or $method -eq "HEAD") {
          $file = Resolve-StaticPath $path
          if ($file -and (Test-Path $file -PathType Leaf)) {
            $bytes = [IO.File]::ReadAllBytes($file)
            if ($path -like "/assets/*") { $cache = "public, max-age=300" }
            Send-Bytes $stream 200 (Get-ContentType $file) $bytes $cache $headOnly
          } else {
            Send-Text $stream 404 "Not Found" $headOnly
          }
        }
        else {
          Send-Text $stream 405 "Method Not Allowed" $headOnly
        }
      } catch {
        Write-Log "请求处理失败：$($_.Exception.Message)"
        try { Send-Text $stream 500 "Internal Server Error" } catch { }
      } finally {
        try { $stream.Close() } catch { }
        try { $client.Close() } catch { }
      }
    }

    # 自动刷新
    if ((Test-Path (Join-Path $Root "refresh.ps1")) -and -not (Test-RefreshRunning)) {
      if (((Get-Date) - $script:lastRefresh).TotalMinutes -ge $RefreshMinutes) {
        Write-Log "到达自动刷新间隔（$RefreshMinutes 分钟），开始刷新"
        Start-Refresh | Out-Null
      }
    }

    Start-Sleep -Milliseconds 120
  } catch {
    Write-Log "主循环异常：$($_.Exception.Message)"
    Start-Sleep -Seconds 1
  }
}
