param(
  [switch]$SkipArena,
  [int]$ArenaTop = 30,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8

# 同一时间只允许一个刷新实例，避免 serve 重启或误触发导致并发写快照。
$refreshMutex = New-Object System.Threading.Mutex($false, "Local\LolHexStatsRefresh")
$mutexHeld = $false
try { $mutexHeld = $refreshMutex.WaitOne(0) }
catch [System.Threading.AbandonedMutexException] { $mutexHeld = $true }
if (-not $mutexHeld) {
  Write-Host "已有刷新任务正在运行，本次刷新退出。"
  exit 0
}

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir = Join-Path $Root "data"
$CacheDir = Join-Path $Root "cache"
$LogDir = Join-Path $Root "logs"
$RawCache = Join-Path $CacheDir "raw"
foreach ($d in @($DataDir, $CacheDir, $LogDir, $RawCache)) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
}
$LogFile = Join-Path $LogDir "refresh.log"
$StatusFile = Join-Path $DataDir "status.json"
$Utf8 = New-Object Text.UTF8Encoding($false)
$UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
$StartedAt = [DateTimeOffset]::Now

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f ([DateTimeOffset]::Now.ToString("yyyy-MM-dd HH:mm:ss")), $msg
  Write-Host $line
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Write-Status([string]$state, [string]$stage, [string]$message, [string]$errorText = "") {
  $obj = [ordered]@{
    state = $state
    stage = $stage
    message = $message
    startedAt = $StartedAt.ToString("yyyy-MM-dd HH:mm:ss")
    updatedAt = [DateTimeOffset]::Now.ToString("yyyy-MM-dd HH:mm:ss")
    error = $errorText
  }
  [IO.File]::WriteAllText($StatusFile, ($obj | ConvertTo-Json -Depth 4), $Utf8)
}

trap {
  $msg = $_.Exception.Message
  try { Write-Log "ERROR 刷新失败：$msg" } catch { }
  try { Write-Status "error" "failed" "刷新失败：$msg" $msg } catch { }
  exit 1
}

function Get-Bytes([string]$url, [int]$timeout = 60) {
  $last = $null
  for ($i = 0; $i -lt 3; $i++) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -Headers @{ "User-Agent" = $UA; "Accept-Language" = "zh-CN,zh;q=0.9" } -TimeoutSec $timeout
      if ($null -ne $r.RawContentStream) {
        $r.RawContentStream.Position = 0
        return $r.RawContentStream.ToArray()
      }
      if ($r.Content -is [byte[]]) { return $r.Content }
      return $Utf8.GetBytes([string]$r.Content)
    } catch {
      $last = $_.Exception.Message
      Start-Sleep -Seconds (2 + 3 * $i)
    }
  }
  throw "下载失败 $url : $last"
}

function Get-Utf8([string]$url, [int]$timeout = 60) {
  $b = Get-Bytes $url $timeout
  $t = $Utf8.GetString($b)
  return $t.TrimStart([char]0xFEFF)
}

function Read-Cache([string]$name) {
  $p = Join-Path $RawCache $name
  if (Test-Path $p) {
    $t = $Utf8.GetString([IO.File]::ReadAllBytes($p))
    return $t.TrimStart([char]0xFEFF)
  }
  return $null
}

function Save-Cache([string]$name, [byte[]]$bytes) {
  $p = Join-Path $RawCache $name
  [IO.File]::WriteAllBytes($p, $bytes)
}

function Get-CachedText([string]$url, [string]$cacheName, [int]$timeout = 60) {
  try {
    $b = Get-Bytes $url $timeout
    Save-Cache $cacheName $b
    $t = $Utf8.GetString($b)
    return @{ text = $t.TrimStart([char]0xFEFF); fromCache = $false }
  } catch {
    $c = Read-Cache $cacheName
    if ($null -ne $c) {
      Write-Log "WARN 使用缓存 $cacheName （远程失败：$($_.Exception.Message)）"
      return @{ text = $c; fromCache = $true }
    }
    throw
  }
}

function Get-CachedTextTtl([string]$url, [string]$cacheName, [int]$timeout, [double]$hours) {
  $p = Join-Path $RawCache $cacheName
  if (-not $Force -and (Test-Path $p)) {
    $age = ((Get-Date) - (Get-Item $p).LastWriteTime).TotalHours
    if ($age -lt $hours) {
      $t = $Utf8.GetString([IO.File]::ReadAllBytes($p))
      return @{ text = $t.TrimStart([char]0xFEFF); fromCache = $true }
    }
  }
  return Get-CachedText $url $cacheName $timeout
}

function HtmlText([string]$s) {
  if ($null -eq $s) { return "" }
  $t = [regex]::Replace($s, '<[^>]+>', ' ')
  $t = [Net.WebUtility]::HtmlDecode($t)
  return ([regex]::Replace($t, '\s+', ' ')).Trim()
}

function ToNum([string]$s) {
  if ($null -eq $s) { return 0.0 }
  $t = $s -replace '[^0-9\.\-]', ''
  if ($t -eq "" -or $t -eq "-" -or $t -eq ".") { return 0.0 }
  return [double]::Parse($t, [Globalization.CultureInfo]::InvariantCulture)
}

function R2([double]$v) { return [math]::Round($v, 2) }

function Get-Tier([int]$rank, [int]$total) {
  if ($total -le 0) { return "C" }
  $q = $rank / $total
  if ($q -le 0.10) { return "S" }
  if ($q -le 0.30) { return "A" }
  if ($q -le 0.70) { return "B" }
  if ($q -le 0.90) { return "C" }
  return "D"
}

function Get-Confidence([double]$games, [double]$maxDelta, [bool]$hasCross) {
  if (-not $hasCross) {
    if ($games -ge 100000) { return "A" }
    if ($games -ge 20000) { return "B" }
    return "C"
  }
  if ($games -ge 100000 -and $maxDelta -le 2.0) { return "A" }
  if ($games -ge 20000 -and $maxDelta -le 4.0) { return "B" }
  return "C"
}

function Cross-Status($maxDelta, [bool]$hasCross) {
  if (-not $hasCross) { return "single" }
  if ($maxDelta -le 1.5) { return "agree" }
  if ($maxDelta -le 3.0) { return "close" }
  return "diverge"
}

Write-Status "running" "init" "正在准备数据刷新"
Write-Log "===== 开始刷新 ====="

# ---------- 1. 版本发现 ----------
$Patch = "16.22"
$TreeMap = @{}
$PatchCacheFile = Join-Path $CacheDir "patch.txt"
$patchTrusted = $false
try {
  if (Test-Path $PatchCacheFile) {
    $cachedPatch = ([IO.File]::ReadAllText($PatchCacheFile, $Utf8)).Trim()
    $cacheAge = ([DateTimeOffset]::Now - [DateTimeOffset](Get-Item $PatchCacheFile).LastWriteTime).TotalHours
    if ($cachedPatch -match '^\d{2}\.\d+$' -and $cacheAge -lt 6) {
      $Patch = $cachedPatch
      $patchTrusted = $true
      Write-Log "使用 6 小时内缓存的版本号 $Patch（跳过 GitHub 版本发现）"
    }
  }
} catch { }
try {
  if (-not $patchTrusted) {
    # GitHub 网页目录比 API 更稳定（API 未登录容易 403）
    $dirHtml = Get-Utf8 "https://github.com/czgreat/aramhex-data/tree/main/patches" 20
    $vers = @([regex]::Matches($dirHtml, '"(\d{2}\.\d+)"') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -match '^\d{2}\.\d+$' } | Sort-Object -Unique)
    if ($vers.Count -gt 0) {
      $Patch = ($vers | Sort-Object { [version]$_ } | Select-Object -Last 1)
      [IO.File]::WriteAllText($PatchCacheFile, $Patch, $Utf8)
    }
    Write-Log "AramHex 可用版本：$($vers -join ', ')；选用 $Patch"
  }
} catch {
  Write-Log "WARN 版本发现失败，沿用 $Patch ：$($_.Exception.Message)"
}

$PatchDir = "patches/$Patch/normal"
$CdnBase = "https://fastly.jsdelivr.net/gh/czgreat/aramhex-data@main/$PatchDir"

function Get-DataFile([string]$name, [int]$timeout = 120) {
  $cacheName = "aramhex-$Patch-$name"
  $url = "$CdnBase/$name"
  try {
    Write-Log "下载 $name"
    $b = Get-Bytes $url $timeout
    Save-Cache $cacheName $b
    return $Utf8.GetString($b)
  } catch {
    Write-Log "WARN CDN 失败 $name，尝试 GitHub API：$($_.Exception.Message)"
    try {
      $sha = $TreeMap["$PatchDir/$name"]
      if (-not $sha) { throw "缺少 blob SHA" }
      $blobText = Get-Utf8 "https://api.github.com/repos/czgreat/aramhex-data/git/blobs/$sha" 120
      $blob = $blobText | ConvertFrom-Json
      $b64 = $blob.content -replace '\s', ''
      $bytes = [Convert]::FromBase64String($b64)
      Save-Cache $cacheName $bytes
      return $Utf8.GetString($bytes)
    } catch {
      $c = Read-Cache $cacheName
      if ($null -ne $c) {
        Write-Log "WARN 使用缓存 $name"
        return $c
      }
      throw
    }
  }
}

Write-Status "running" "aram" "正在下载海克斯大乱斗数据（$Patch）"
$meta = (Get-DataFile "meta.json" 30 | ConvertFrom-Json)
$heroesRaw = (Get-DataFile "heroes.json" 30 | ConvertFrom-Json)
$augmentsRaw = (Get-DataFile "augments.json" 30 | ConvertFrom-Json)
$heroAugRaw = (Get-DataFile "hero_augments.json" 180 | ConvertFrom-Json)
$heroItemsRaw = (Get-DataFile "hero_items.json" 180 | ConvertFrom-Json)
$augmentItemsRaw = (Get-DataFile "hero_augment_items.json" 60 | ConvertFrom-Json)
$itemMetaRaw = (Get-DataFile "item_metadata.json" 60 | ConvertFrom-Json)

$HeroCount = @($heroesRaw.PSObject.Properties).Count
$AugCount = @($augmentsRaw.PSObject.Properties).Count
if ($HeroCount -lt 100 -or $AugCount -lt 100) { throw "海斗数据异常：英雄 $HeroCount，海克斯 $AugCount" }

# 英雄基础信息与 Data Dragon 映射
$DdragonVersion = "16.22.1"
$ChampMap = @{}
try {
  $verText = Get-Utf8 "https://ddragon.leagueoflegends.com/api/versions.json" 20
  $verList = $verText | ConvertFrom-Json
  if ($verList.Count -gt 0) { $DdragonVersion = $verList[0] }
} catch { Write-Log "WARN Data Dragon 版本获取失败，沿用 $DdragonVersion" }
try {
  $ddText = Get-Utf8 "https://ddragon.leagueoflegends.com/cdn/$DdragonVersion/data/zh_CN/champion.json" 40
  $dd = $ddText | ConvertFrom-Json
  foreach ($p in $dd.data.PSObject.Properties) {
    $c = $p.Value
    $ChampMap[[string]$c.key] = @{ key = $c.id; name = $c.name; title = $c.title }
  }
  Save-Cache "ddragon-champion-zh.json" $Utf8.GetBytes($ddText)
} catch {
  $c = Read-Cache "ddragon-champion-zh.json"
  if ($null -ne $c) {
    $dd = $c | ConvertFrom-Json
    foreach ($p in $dd.data.PSObject.Properties) {
      $c2 = $p.Value
      $ChampMap[[string]$c2.key] = @{ key = $c2.id; name = $c2.name; title = $c2.title }
    }
  }
  Write-Log "WARN 英雄中文映射失败：$($_.Exception.Message)"
}

$TotalHeroGames = 0.0
$HeroStats = @{}
foreach ($p in $heroesRaw.PSObject.Properties) {
  $id = [string]$p.Name
  $v = $p.Value
  $TotalHeroGames += [double]$v.games
  $cm = $ChampMap[$id]
  $key = $id
  $cname = [string]$v.name
  $ctitle = [string]$v.title
  if ($null -ne $cm) { $key = $cm.key }
  $HeroStats[$id] = [ordered]@{
    id = [int]$id
    key = $key
    name = $cname
    title = $ctitle
    wr = R2(([double]$v.win_rate) * 100)
    pick = R2(([double]$v.pick_rate) * 100)
    games = [int64]$v.games
    lowSample = [bool]$v.low_sample
    icon = "https://ddragon.leagueoflegends.com/cdn/$DdragonVersion/img/champion/$key.png"
  }
}

# ---------- 2. 海克斯聚合（按英雄基线校正） ----------
$AugAgg = @{}
foreach ($hp in $heroAugRaw.PSObject.Properties) {
  $hid = [string]$hp.Name
  $baseWr = 0.0
  if ($HeroStats.ContainsKey($hid)) { $baseWr = [double]$HeroStats[$hid].wr / 100.0 }
  foreach ($ap in $hp.Value.PSObject.Properties) {
    $aid = [string]$ap.Name
    $v = $ap.Value
    if (-not $AugAgg.ContainsKey($aid)) {
      $AugAgg[$aid] = @{ games = 0.0; wins = 0.0; expected = 0.0 }
    }
    $AugAgg[$aid].games += [double]$v.games
    $AugAgg[$aid].wins += [double]$v.wins
    $AugAgg[$aid].expected += ([double]$v.games * $baseWr)
  }
}
$AugmentStats = @()
foreach ($aid in $AugAgg.Keys) {
  $g = $AugAgg[$aid].games
  if ($g -le 0) { continue }
  $am = $augmentsRaw.PSObject.Properties[$aid]
  if ($null -eq $am) { continue }
  $wr = $AugAgg[$aid].wins / $g
  $delta = ($AugAgg[$aid].wins - $AugAgg[$aid].expected) / $g * 100
  $AugmentStats += [ordered]@{
    id = [int]$aid
    name = [string]$am.Value.name
    rarity = [string]$am.Value.rarity
    wr = R2($wr * 100)
    delta = R2($delta)
    pick = R2($g / $TotalHeroGames * 100)
    games = [int64]$g
  }
}
$AugmentStats = @($AugmentStats | Sort-Object { $_.wr } -Descending)
for ($i = 0; $i -lt $AugmentStats.Count; $i++) {
  $AugmentStats[$i].rank = $i + 1
  $AugmentStats[$i].tier = Get-Tier ($i + 1) $AugmentStats.Count
  $AugmentStats[$i].confidence = "B"
  $AugmentStats[$i].crossStatus = "single"
  $AugmentStats[$i].cross = @()
}
$AugMap = @{}
foreach ($a in $AugmentStats) { $AugMap[[string]$a.id] = $a }

# 英雄榜排序与梯队
$HeroList = @($HeroStats.Values | Sort-Object { $_.wr } -Descending)
for ($i = 0; $i -lt $HeroList.Count; $i++) {
  $HeroList[$i].rank = $i + 1
  $HeroList[$i].tier = Get-Tier ($i + 1) $HeroList.Count
  $HeroList[$i].confidence = "B"
  $HeroList[$i].crossStatus = "single"
  $HeroList[$i].cross = @()
}

# ---------- 3. 出装与搭配 ----------
function Get-ItemInfo([string]$iid) {
  $m = $itemMetaRaw.PSObject.Properties[$iid]
  if ($null -eq $m) { return $null }
  $icon = [string]$m.Value.icon
  if (-not $icon) { $icon = "https://game.gtimg.cn/images/lol/act/img/item/$iid.png" }
  return @{ id = [int]$iid; name = [string]$m.Value.name; icon = $icon }
}

$Builds = @{}
foreach ($hp in $heroItemsRaw.PSObject.Properties) {
  $hid = [string]$hp.Name
  if (-not $HeroStats.ContainsKey($hid)) { continue }
  $eq = $HeroStats[$hid].games
  $items = @()
  foreach ($ip in $hp.Value.PSObject.Properties) {
    $v = $ip.Value
    if ([bool]$v.low_sample) { continue }
    $info = Get-ItemInfo ([string]$ip.Name)
    if ($null -eq $info) { continue }
    $items += [ordered]@{
      id = $info.id
      name = $info.name
      icon = $info.icon
      wr = R2(([double]$v.win_rate) * 100)
      games = [int64]$v.games
      pick = R2(([double]$v.games / $eq) * 100)
    }
  }
  $items = @($items | Sort-Object { $_.games } -Descending | Select-Object -First 5)

  # 该英雄的高收益海克斯
  $augRows = @()
  $hAug = $heroAugRaw.PSObject.Properties[$hid]
  if ($null -ne $hAug) {
    $baseWr = [double]$HeroStats[$hid].wr / 100.0
    foreach ($ap in $hAug.Value.PSObject.Properties) {
      $aid = [string]$ap.Name
      $v = $ap.Value
      if ([double]$v.games -lt 2000) { continue }
      $am = $AugMap[$aid]
      if ($null -eq $am) { continue }
      $delta = (([double]$v.wins) - ([double]$v.games * $baseWr)) / [double]$v.games * 100
      $augRows += [ordered]@{
        id = [int]$aid
        name = $am.name
        rarity = $am.rarity
        wr = R2(([double]$v.win_rate) * 100)
        delta = R2($delta)
        games = [int64]$v.games
        lowSample = [bool]$v.low_sample
      }
    }
  }
  $augRows = @($augRows | Sort-Object { $_.delta } -Descending | Select-Object -First 6)

  # 海克斯 × 出装
  $combos = @()
  $ci = $augmentItemsRaw.PSObject.Properties[$hid]
  if ($null -ne $ci) {
    $tmp = @()
    foreach ($ap in $ci.Value.PSObject.Properties) {
      $aid = [string]$ap.Name
      $am = $AugMap[$aid]
      if ($null -eq $am) { continue }
      $its = @()
      foreach ($it in @($ap.Value.items | Select-Object -First 3)) {
        $info = Get-ItemInfo ([string]$it.item)
        if ($null -eq $info) { continue }
        $itWr = 0.0
        if ([double]$it.games -gt 0) { $itWr = [double]$it.wins / [double]$it.games }
        $its += [ordered]@{
          id = $info.id
          name = $info.name
          icon = $info.icon
          wr = R2($itWr * 100)
          games = [int64]$it.games
        }
      }
      if ($its.Count -eq 0) { continue }
      $tmp += [ordered]@{
        augmentId = [int]$aid
        augment = $am.name
        rarity = $am.rarity
        games = [int64]$ap.Value.total
        items = $its
      }
    }
    $combos = @($tmp | Sort-Object { $_.games } -Descending | Select-Object -First 3)
  }

  $Builds[$hid] = [ordered]@{ items = $items; augments = $augRows; combos = $combos }
}

# 每个海克斯的最佳英雄（用于详情）
$AugHeroes = @{}
foreach ($hp in $heroAugRaw.PSObject.Properties) {
  $hid = [string]$hp.Name
  if (-not $HeroStats.ContainsKey($hid)) { continue }
  $baseWr = [double]$HeroStats[$hid].wr / 100.0
  foreach ($ap in $hp.Value.PSObject.Properties) {
    $aid = [string]$ap.Name
    $v = $ap.Value
    if ([double]$v.games -lt 2000) { continue }
    if (-not $AugHeroes.ContainsKey($aid)) { $AugHeroes[$aid] = @() }
    $delta = (([double]$v.wins) - ([double]$v.games * $baseWr)) / [double]$v.games * 100
    $AugHeroes[$aid] += [ordered]@{
      id = [int]$hid
      name = $HeroStats[$hid].name
      key = $HeroStats[$hid].key
      icon = $HeroStats[$hid].icon
      wr = R2(([double]$v.win_rate) * 100)
      delta = R2($delta)
      games = [int64]$v.games
    }
  }
}
$AugHeroTop = @{}
foreach ($aid in $AugHeroes.Keys) {
  $AugHeroTop[$aid] = @($AugHeroes[$aid] | Sort-Object { $_.delta } -Descending | Select-Object -First 6)
}

Write-Log "海斗聚合完成：$($HeroList.Count) 英雄，$($AugmentStats.Count) 海克斯，$($Builds.Count) 套出装"

# ---------- 4. 交叉校验（ARAMKit / Hexdata） ----------
Write-Status "running" "cross" "正在交叉校验 ARAMKit 与 Hexdata"
$AramCross = @{
  aramkitHero = @{}
  aramkitAug = @{}
  hexHero = @{}
  hexAug = @{}
  meta = @{}
}
try {
  $ak = Get-CachedText "https://aramkit.cn/zh-CN/champions" "aramkit-champions.html" 40
  $html = $ak.text
  $rows = [regex]::Matches($html, '<a href="/zh-CN/champions/[^"]+" class="table-row champion-row">[\s\S]*?</a>')
  foreach ($m in $rows) {
    $r = $m.Value
    $rank = [int](ToNum ([regex]::Match($r, 'rank-cell[^>]*>[\s\S]*?#(\d+)').Groups[1].Value))
    $nm = HtmlText ([regex]::Match($r, '<small>([^<]+)</small>').Groups[1].Value)
    $wr = ToNum ([regex]::Match($r, '<strong[^>]*><!--\[-->([\d\.]+)%<!--\]-->').Groups[1].Value)
    if ($nm -and $wr -gt 0) { $AramCross.aramkitHero[$nm] = @{ rank = $rank; wr = $wr } }
  }
  $ver = [regex]::Match($html, '16\.\d+').Value
  $dateM = [regex]::Match($html, '数据更新于\s*(\d{4})年(\d{1,2})月(\d{1,2})日')
  $akDate = ""
  if ($dateM.Success) { $akDate = "{0}-{1:D2}-{2:D2}" -f $dateM.Groups[1].Value, [int]$dateM.Groups[2].Value, [int]$dateM.Groups[3].Value }
  $AramCross.meta["aramkit"] = @{
    patch = $ver
    date = $akDate
    rows = $AramCross.aramkitHero.Count
  }
  Write-Log "ARAMKit 英雄行：$($AramCross.aramkitHero.Count)（$ver）"
} catch { Write-Log "WARN ARAMKit 英雄校验失败：$($_.Exception.Message)" }

try {
  $ak = Get-CachedText "https://aramkit.cn/zh-CN/augments" "aramkit-augments.html" 40
  $html = $ak.text
  $rows = [regex]::Matches($html, '<a href="/zh-CN/augments/[^"]+" class="table-row augment-table-row">[\s\S]*?</a>')
  foreach ($m in $rows) {
    $r = $m.Value
    $rank = [int](ToNum ([regex]::Match($r, 'rank-cell[^>]*>[\s\S]*?#(\d+)').Groups[1].Value))
    $nm = HtmlText ([regex]::Match($r, '<strong>([^<]+)</strong>').Groups[1].Value)
    $wr = ToNum ([regex]::Match($r, '<strong[^>]*><!--\[-->([\d\.]+)%<!--\]-->').Groups[1].Value)
    if ($nm -and $wr -gt 0) { $AramCross.aramkitAug[$nm] = @{ rank = $rank; wr = $wr } }
  }
  $AramCross.meta["aramkitAug"] = @{ rows = $AramCross.aramkitAug.Count }
  Write-Log "ARAMKit 海克斯行：$($AramCross.aramkitAug.Count)"
} catch { Write-Log "WARN ARAMKit 海克斯校验失败：$($_.Exception.Message)" }

try {
  $hx = Get-CachedText "https://hexdata.com.cn/heroes" "hexdata-heroes.html" 40
  $html = $hx.text
  $rows = [regex]::Matches($html, '<tr><td><a href="/hero/[^"]+">([^<]+)</a></td><td>([^<]+)</td>')
  foreach ($m in $rows) {
    $rawName = HtmlText $m.Groups[1].Value
    $info = HtmlText $m.Groups[2].Value
    $name = $rawName
    $mm = [regex]::Match($rawName, '（([^）]+)）')
    if ($mm.Success) { $name = $mm.Groups[1].Value }
    $wrM = [regex]::Match($info, '胜率\s*([\d\.]+)%')
    $gm = [regex]::Match($info, '样本\s*([\d,]+)')
    if ($name -and $wrM.Success) {
      $AramCross.hexHero[$name] = @{ wr = ToNum $wrM.Groups[1].Value; games = (ToNum $gm.Groups[1].Value) }
    }
  }
  $AramCross.meta["hexdata"] = @{ rows = $AramCross.hexHero.Count; date = ([regex]::Match($html, '数据日期\s*(\d{4}-\d{2}-\d{2})').Groups[1].Value); patch = ([regex]::Match($html, 'Patch\s*(16\.\d+)').Groups[1].Value) }
  Write-Log "Hexdata 英雄行：$($AramCross.hexHero.Count)"
} catch { Write-Log "WARN Hexdata 英雄校验失败：$($_.Exception.Message)" }

try {
  $hx = Get-CachedText "https://hexdata.com.cn/augments" "hexdata-augments.html" 40
  $html = $hx.text
  $rows = [regex]::Matches($html, '<tr><td><a href="/augment/[^"]+">([^<]+)</a></td><td>([^<]+)</td>')
  foreach ($m in $rows) {
    $nm = HtmlText $m.Groups[1].Value
    $info = HtmlText $m.Groups[2].Value
    $wrM = [regex]::Match($info, '胜率\s*([\d\.]+)%')
    $scM = [regex]::Match($info, '综合评分\s*([\d\.]+)')
    if ($nm -and $wrM.Success) {
      $AramCross.hexAug[$nm] = @{ wr = ToNum $wrM.Groups[1].Value; score = (ToNum $scM.Groups[1].Value) }
    }
  }
  $AramCross.meta["hexAug"] = @{ rows = $AramCross.hexAug.Count }
  Write-Log "Hexdata 海克斯行：$($AramCross.hexAug.Count)"
} catch { Write-Log "WARN Hexdata 海克斯校验失败：$($_.Exception.Message)" }

function Attach-Cross($row, [string]$name, $mapA, $mapB) {
  $cross = @()
  $maxDelta = 0.0
  if ($null -ne $mapA -and $mapA.ContainsKey($name)) {
    $d = [math]::Round([double]$row.wr - [double]$mapA[$name].wr, 2)
    $cross += [ordered]@{ src = "ARAMKit"; wr = [double]$mapA[$name].wr; delta = $d }
    if ([math]::Abs($d) -gt $maxDelta) { $maxDelta = [math]::Abs($d) }
  }
  if ($null -ne $mapB -and $mapB.ContainsKey($name)) {
    $d = [math]::Round([double]$row.wr - [double]$mapB[$name].wr, 2)
    $cross += [ordered]@{ src = "Hexdata"; wr = [double]$mapB[$name].wr; delta = $d }
    if ([math]::Abs($d) -gt $maxDelta) { $maxDelta = [math]::Abs($d) }
  }
  $has = $cross.Count -gt 0
  $row.cross = $cross
  $row.crossStatus = Cross-Status $maxDelta $has
  $row.confidence = Get-Confidence ([double]$row.games) $maxDelta $has
  if ($row.PSObject.Properties.Name -contains "maxDelta") { $row.maxDelta = [math]::Round($maxDelta, 2) }
  return $row
}

# 名称匹配：英雄用中文名；海克斯用中文名
foreach ($h in $HeroList) { $h = Attach-Cross $h $h.name $AramCross.aramkitHero $AramCross.hexHero }
foreach ($a in $AugmentStats) { $a = Attach-Cross $a $a.name $AramCross.aramkitAug $AramCross.hexAug }

$agreeHero = @($HeroList | Select-Object -First 50 | Where-Object { $_.crossStatus -eq "agree" }).Count
$agreeAug = @($AugmentStats | Select-Object -First 50 | Where-Object { $_.crossStatus -eq "agree" }).Count

# ---------- 4.5 海克斯搭配组合（ARAMKit 趣味榜单，真实联合样本） ----------
$AramCombos = @()
$AramComboMeta = $null
try {
  $fun = Get-CachedTextTtl "https://aramkit.cn/zh-CN/fun-stats" "aramkit-fun.html" 40 6
  $funHtml = $fun.text
  $titleIdx = $funHtml.IndexOf('id="augment-soulmates-title"')
  if ($titleIdx -ge 0) {
    $artStart = $funHtml.LastIndexOf('<article', $titleIdx)
    $artEnd = $funHtml.IndexOf('</article>', $titleIdx)
    if ($artStart -ge 0 -and $artEnd -gt $artStart) {
      $block = $funHtml.Substring($artStart, $artEnd - $artStart)
      $augByName = @{}
      foreach ($a in $AugmentStats) {
        if (-not $augByName.ContainsKey([string]$a.name)) { $augByName[[string]$a.name] = $a }
      }
      $rows = [regex]::Matches($block, '<li class="fun-stats-row">[\s\S]*?</li>')
      foreach ($r in $rows) {
        $rowHtml = $r.Value
        $rankM = [regex]::Match($rowHtml, 'fun-stats-rank[^>]*>(\d+)<')
        $ents = [regex]::Matches($rowHtml, '<a href="/zh-CN/augments/([^"]+)" class="fun-stats-entity"[^>]*data-rarity="([^"]*)"[^>]*title="([^"]*)"[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<span>([^<]+)</span></a>')
        $mets = [regex]::Matches($rowHtml, '<dt>([^<]+)</dt><dd>([^<]+)</dd>')
        if ($ents.Count -lt 2 -or $mets.Count -lt 3) { continue }
        $pair = @()
        for ($k = 0; $k -lt 2; $k++) {
          $e = $ents[$k]
          $aname = HtmlText $e.Groups[5].Value
          $matched = $null
          if ($augByName.ContainsKey($aname)) { $matched = $augByName[$aname] }
          $pair += [ordered]@{
            id = $(if ($null -ne $matched) { [int]$matched.id } else { 0 })
            name = $aname
            rarity = $(if ($null -ne $matched) { [string]$matched.rarity } else { [string]$e.Groups[2].Value })
            icon = $(if ($e.Groups[4].Value) { [string]$e.Groups[4].Value } elseif ($null -ne $matched) { [string]$matched.icon } else { "" })
            slug = [string]$e.Groups[1].Value
          }
        }
        $AramCombos += [ordered]@{
          rank = [int]$rankM.Groups[1].Value
          a = $pair[0]
          b = $pair[1]
          wr = R2 (ToNum $mets[0].Groups[2].Value)
          baseline = R2 (ToNum $mets[1].Groups[2].Value)
          delta = R2 (ToNum $mets[2].Groups[2].Value)
        }
      }
      $verM = [regex]::Match($funHtml, '数据版本\s*([\d\.]+)')
      $dateM = [regex]::Match($funHtml, '数据更新于\s*(\d{4})年(\d{1,2})月(\d{1,2})日')
      $sampM = [regex]::Match($funHtml, '基于\s*([\d,]+)\s*场对局')
      $comboDate = ""
      if ($dateM.Success) {
        $comboDate = "{0}-{1:D2}-{2:D2}" -f $dateM.Groups[1].Value, [int]$dateM.Groups[2].Value, [int]$dateM.Groups[3].Value
      }
      $AramComboMeta = [ordered]@{
        source = "ARAMKit 趣味榜单"
        sourceUrl = "https://aramkit.cn/zh-CN/fun-stats"
        patch = $(if ($verM.Success) { [string]$verM.Groups[1].Value } else { [string]$meta.patch })
        dataDate = $comboDate
        sampleMatches = $(if ($sampM.Success) { [int64](ToNum $sampM.Groups[1].Value) } else { 0 })
        count = $AramCombos.Count
        note = "真实双海克斯联合样本；仅 ARAMKit 单源，页面未公开每组样本量，组合属稀有事件，仅供参考。"
      }
      Write-Log "ARAMKit 海克斯组合：$($AramCombos.Count) 组（$comboDate）"
    } else {
      Write-Log "WARN 未定位到海克斯组合榜单区块"
    }
  } else {
    Write-Log "WARN ARAMKit 页面未找到海克斯组合榜单"
  }
} catch { Write-Log "WARN ARAMKit 海克斯组合抓取失败：$($_.Exception.Message)" }

# ---------- 4.6 游戏内属性与效果（ARAMKit 资源，权威数值） ----------
$AramAugmentInfo = @{}
$AramItemInfo = @{}
try {
  $rpText = Get-CachedTextTtl "https://aramkit.cn/zh-CN/augments" "aramkit-augments.html" 40 6
  $rpM = [regex]::Match($rpText.text, 'resourcePath:"([^"]+)"')
  if (-not $rpM.Success) { throw "未找到 ARAMKit resourcePath" }
  $resBase = "https://data.aramkit.cn/" + $rpM.Groups[1].Value + "/zh-CN/resources"

  $augJsonRes = Get-CachedTextTtl ($resBase + "/augments.json") "aramkit-augments.json" 40 24
  $augJson = $augJsonRes.text | ConvertFrom-Json
  foreach ($prop in $augJson.PSObject.Properties) {
    $item = $prop.Value
    $blocks = @()
    foreach ($b in @($item.tooltip.blocks)) {
      $parts = @()
      foreach ($s in @($b.spans)) {
        if ($s.type -eq "text") { $parts += [string]$s.text }
      }
      $text = (($parts -join "") -replace '\s+', ' ').Trim()
      if ($text) { $blocks += [ordered]@{ role = [string]$b.role; text = $text } }
    }
    if ($blocks.Count -gt 0) {
      $AramAugmentInfo[[string]$prop.Name] = [ordered]@{
        id = [int]$prop.Name
        name = [string]$item.name
        rarity = [string]$item.rarity
        icon = [string]$item.icon
        effect = $blocks
      }
    }
  }
  Write-Log "ARAMKit 海克斯效果：$($AramAugmentInfo.Count) 个"

  # 只保留当前出装实际引用到的装备，控制快照体积
  $usedItemIds = @{}
  foreach ($bid in $Builds.Keys) {
    foreach ($it in @($Builds[$bid].items)) {
      if ($it.id) { $usedItemIds[[string]$it.id] = $true }
    }
  }
  $itemJsonRes = Get-CachedTextTtl ($resBase + "/items.json") "aramkit-items.json" 40 24
  $itemJson = $itemJsonRes.text | ConvertFrom-Json
  foreach ($iid in $usedItemIds.Keys) {
    $ip = $itemJson.PSObject.Properties[$iid]
    if ($null -eq $ip) { continue }
    $item = $ip.Value
    $stats = @()
    $effects = @()
    foreach ($b in @($item.tooltip.blocks)) {
      $parts = @()
      $hasPassive = $false
      foreach ($s in @($b.spans)) {
        if ($s.type -eq "text") { $parts += [string]$s.text }
        if ([string]$s.semantic -eq "passive") { $hasPassive = $true }
      }
      $text = (($parts -join "") -replace '\s+', ' ').Trim()
      if (-not $text) { continue }
      $isStat = (-not $hasPassive) -and ($text -match '^\s*\d+(\.\d+)?%?\s*(生命值|法力值|攻击力|法术强度|攻击速度|暴击几率|暴击伤害|护甲|魔法抗性|技能急速|生命偷取|移动速度|基础生命回复|法力回复|治疗和护盾强度|护甲穿透|法术穿透|全能吸血)')
      if ($isStat) {
        $statText = $text -replace '^([\d\.]+%?)(\D)', '$1 $2'
        $stats += $statText
      }
      else { $effects += [ordered]@{ role = [string]$b.role; text = $text } }
    }
    $AramItemInfo[$iid] = [ordered]@{
      id = [int]$iid
      name = [string]$item.name
      icon = [string]$item.icon
      price = [int]$item.priceTotal
      sell = [int]$item.sellPrice
      stats = $stats
      effects = $effects
    }
  }
  Write-Log "ARAMKit 装备属性：$($AramItemInfo.Count) 件（出装引用）"
} catch { Write-Log "WARN ARAMKit 属性资源抓取失败：$($_.Exception.Message)" }

# ---------- 5. 输出海斗 ----------
$AramMeta = [ordered]@{
  patch = [string]$meta.patch
  dataDate = ([DateTimeOffset]::Parse([string]$meta.snapshot_at)).ToString("yyyy-MM-dd")
  snapshotAt = [string]$meta.snapshot_at
  windowStart = [string]$meta.window.start
  validMatches = [int64]$meta.matches.valid
  collectedMatches = [int64]$meta.matches.collected
  heroParticipations = [int64]$meta.hero_participations
  heroCount = $HeroList.Count
  augmentCount = $AugmentStats.Count
  regions = @($meta.regions)
  license = "CC BY-NC 4.0"
  source = "AramHex 数据仓库（国服自采对局）"
  sourceUrl = "https://github.com/czgreat/aramhex-data"
}

$AramObj = [ordered]@{
  meta = $AramMeta
  heroes = $HeroList
  augments = $AugmentStats
  builds = $Builds
  augmentHeroes = $AugHeroTop
  combos = $AramCombos
  comboMeta = $AramComboMeta
  augmentInfo = $AramAugmentInfo
  itemInfo = $AramItemInfo
}

# ---------- 6. 斗魂竞技场（ggez.gg） ----------
$ArenaObj = $null
$ArenaMeta = $null
if (-not $SkipArena) {
  Write-Status "running" "arena" "正在抓取斗魂竞技场数据（ggez.gg）"
  try {
    $mainRes = Get-CachedText "https://ggez.gg/zh/tierlist/arena" "ggez-arena-main.html" 60
    $html = $mainRes.text
    $champs = @()
    $KeyToCn = @{}
    foreach ($hv in $HeroStats.Values) {
      if ($hv.key) { $KeyToCn[[string]$hv.key.ToLower()] = $hv.name }
    }
    $rows = [regex]::Matches($html, '<a class="row[^"]*" href="/zh/champion/([^/]+)/arena">[\s\S]*?</a>')
    foreach ($m in $rows) {
      $r = $m.Value
      $key = $m.Groups[1].Value
      $tier = HtmlText ([regex]::Match($r, 'c-tier[^>]*>([^<]+)<').Groups[1].Value)
      $wr = ToNum ([regex]::Match($r, 'c-win[\s\S]*?<b[^>]*>([\d\.]+)\s*%').Groups[1].Value)
      $first = ToNum ([regex]::Match($r, 'c-first[^>]*>([\d\.]+)\s*%').Groups[1].Value)
      $place = ToNum ([regex]::Match($r, 'c-place[^>]*>([\d\.]+)<').Groups[1].Value)
      $pick = ToNum ([regex]::Match($r, 'c-pick[^>]*>([\d\.]+)\s*%').Groups[1].Value)
      $ban = ToNum ([regex]::Match($r, 'c-ban[^>]*>([\d\.]+)\s*%').Groups[1].Value)
      $games = [int64](ToNum ([regex]::Match($r, 'c-games[^>]*>([\d,]+)<').Groups[1].Value))
      $cnName = $KeyToCn[$key.ToLower()]
      if (-not $cnName) {
        $cnName = HtmlText ([regex]::Match($r, '<span class="c-champ[\s\S]*?<b[^>]*>([^<]+)</b>').Groups[1].Value)
      }
      if (-not $cnName) { $cnName = $key }
      $rowIcon = [regex]::Match($r, '<span class="c-champ[\s\S]*?<img[^>]+src="([^"]+)"').Groups[1].Value
      if (-not $rowIcon) { $rowIcon = "https://ddragon.leagueoflegends.com/cdn/$DdragonVersion/img/champion/$key.png" }
      if ($key -and $place -gt 0) {
        $champs += [ordered]@{
          key = $key; name = $cnName; tier = $tier
          wr = R2 $wr; first = R2 $first; place = R2 $place
          pick = R2 $pick; ban = R2 $ban; games = $games
          icon = $rowIcon
        }
      }
    }
    $champs = @($champs | Sort-Object { $_.place })
    for ($i = 0; $i -lt $champs.Count; $i++) { $champs[$i].rank = $i + 1 }

    $augRes = Get-CachedText "https://ggez.gg/zh/tierlist/arena/augments" "ggez-arena-augments.html" 60
    $ahtml = $augRes.text
    $augs = @()
    $arows = [regex]::Matches($ahtml, '<tr><td class="c-name[\s\S]*?</tr>')
    foreach ($m in $arows) {
      $r = $m.Value
      $name = HtmlText ([regex]::Match($r, '<b[^>]*>([^<]+)</b>').Groups[1].Value)
      $rarity = HtmlText ([regex]::Match($r, 'class="rar [^"]*">([^<]+)</span>').Groups[1].Value)
      $augIcon = [regex]::Match($r, '<img[^>]+src="([^"]+)"').Groups[1].Value
      $nums = [regex]::Matches($r, '<td class="c-n[^"]*[^>]*>([^<]+)</td>')
      if (-not $name -or $nums.Count -lt 5) { continue }
      $picks = [int64](ToNum $nums[0].Groups[1].Value)
      $share = ToNum $nums[1].Groups[1].Value
      $top3 = ToNum $nums[2].Groups[1].Value
      $first = ToNum $nums[3].Groups[1].Value
      $place = ToNum $nums[4].Groups[1].Value
      if ($place -le 0) { continue }
      $augs += [ordered]@{
        name = $name; rarity = $rarity; picks = $picks
        share = R2 $share; top3 = R2 $top3; first = R2 $first
        place = R2 $place; icon = $augIcon
      }
    }
    $augs = @($augs | Sort-Object { $_.place })
    for ($i = 0; $i -lt $augs.Count; $i++) {
      $augs[$i].rank = $i + 1
      $augs[$i].tier = Get-Tier ($i + 1) $augs.Count
    }
    $ArenaAugMap = @{}
    foreach ($a in $augs) { $ArenaAugMap[[string]$a.name] = [string]$a.rarity }

    if ($champs.Count -lt 20 -or $augs.Count -lt 50) {
      throw "ggez 解析异常：英雄 $($champs.Count)，海克斯 $($augs.Count)"
    }

    # 英雄出装（Top N，缓存 24 小时）
    $buildCachePath = Join-Path $CacheDir "arena-builds.json"
    $buildCache = @{}
    if (Test-Path $buildCachePath) {
      try {
        $bc = Get-Content $buildCachePath -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($p in $bc.PSObject.Properties) { $buildCache[$p.Name] = $p.Value }
      } catch { }
    }
    $arenaBuilds = @{}
    $need = @($champs | Select-Object -First $ArenaTop)
    $idx = 0
    foreach ($c in $need) {
      $idx++
      $cacheKey = "$Patch-$($c.key)"
      $cached = $buildCache[$cacheKey]
      $fresh = $false
      if ($null -ne $cached) {
        try { $fresh = ((Get-Date) - [datetime]$cached.fetchedAt).TotalHours -lt 24 } catch { $fresh = $false }
      }
      if ($cached -and $fresh -and -not $Force) {
        $arenaBuilds[$c.key] = $cached.build
        continue
      }
      Write-Status "running" "arena-build" "正在抓取出装 $idx/$($need.Count)：$($c.name)"
      try {
        $res = Get-CachedText "https://ggez.gg/zh/champion/$($c.key)/arena" "ggez-champ-$($c.key).html" 45
        $h = $res.text
        $parsed = [ordered]@{ augments = @(); items = @() }
        $brows = [regex]::Matches($h, '<div class="brow[^"]*">[\s\S]*?(?=<div class="brow|</section>)')
        foreach ($bm in $brows) {
          $block = $bm.Value
          $label = HtmlText ([regex]::Match($block, '<span class="blbl[^"]*">([^<]+)</span>').Groups[1].Value)
          $chips = [regex]::Matches($block, '<span class="bchip[^>]*>[\s\S]*?</span></span>')
          $list = @()
          foreach ($cm in $chips) {
            $chip = $cm.Value
            $nm = HtmlText ([regex]::Match($chip, '<b[^>]*>([^<]+)</b>').Groups[1].Value)
            if (-not $nm) { continue }
            $small = HtmlText ([regex]::Match($chip, '<small[^>]*>([\s\S]*?)</small>').Groups[1].Value)
            $pcts = [regex]::Matches($small, '([\d\.]+)\s*%')
            $top3 = 0.0
            $pick = 0.0
            if ($pcts.Count -ge 1) { $top3 = ToNum $pcts[0].Groups[1].Value }
            if ($pcts.Count -ge 2) { $pick = ToNum $pcts[1].Groups[1].Value }
            $img = [regex]::Match($chip, 'src="([^"]+)"').Groups[1].Value
            $iid = 0
            $im = [regex]::Match($chip, 'data-tt-item="(\d+)"')
            if ($im.Success) { $iid = [int]$im.Groups[1].Value }
            $rarity = ""
            if ($label -match '强化|海克斯') { $rarity = [string]$ArenaAugMap[$nm] }
            $list += [ordered]@{
              name = $nm
              top3 = R2 $top3
              pick = R2 $pick
              rarity = $rarity
              icon = $img
              itemId = $iid
            }
          }
          if ($label -match '强化|海克斯') { $parsed.augments = $list }
          elseif ($label -match '装备|出装') { $parsed.items = $list }
        }
        $arenaBuilds[$c.key] = $parsed
        $buildCache[$cacheKey] = [ordered]@{ fetchedAt = (Get-Date).ToString("s"); build = $parsed }
      } catch {
        Write-Log "WARN 出装抓取失败 $($c.key)：$($_.Exception.Message)"
        if ($cached) { $arenaBuilds[$c.key] = $cached.build }
      }
    }
    try {
      [IO.File]::WriteAllText($buildCachePath, ($buildCache | ConvertTo-Json -Depth 10), $Utf8)
    } catch { Write-Log "WARN 写出装缓存失败：$($_.Exception.Message)" }

    # lum.gg 排序交叉校验（仅顺序，无胜率）
    $lumRankByKey = @{}
    $lumTopKeys = @()
    try {
      $lumRes = Get-CachedTextTtl "https://lum.gg/zh-cn/lol/arena" "lum-arena.html" 50 12
      $lumM = [regex]::Match($lumRes.text, 'id="lol-arena-tier">([\s\S]*?)</script>')
      if ($lumM.Success) {
        $lum = $lumM.Groups[1].Value | ConvertFrom-Json
        foreach ($el in @($lum.itemListElement)) {
          $km = [regex]::Match([string]$el.url, '/champions/([^/]+)/arena')
          if ($km.Success) {
            $lk = $km.Groups[1].Value.ToLower()
            $lumRankByKey[$lk] = [int]$el.position
            if ([int]$el.position -le 20) { $lumTopKeys += $lk }
          }
        }
        Write-Log "lum.gg 斗魂排序：$($lumRankByKey.Count) 位英雄"
      }
    } catch { Write-Log "WARN lum.gg 交叉校验失败：$($_.Exception.Message)" }

    foreach ($c in $champs) {
      $lk = ([string]$c.key).ToLower()
      $lr = 0
      if ($lumRankByKey.ContainsKey($lk)) { $lr = [int]$lumRankByKey[$lk] }
      if ($lr -gt 0) {
        $diff = [math]::Abs([int]$c.rank - $lr)
        $c.lumRank = $lr
        $c.rankDiff = $diff
        if ($diff -le 5) { $c.crossStatus = "agree" }
        elseif ($diff -le 15) { $c.crossStatus = "close" }
        else { $c.crossStatus = "diverge" }
        if ($c.games -ge 25000 -and $diff -le 8) { $c.confidence = "A" }
        elseif ($c.games -ge 8000 -and $diff -le 20) { $c.confidence = "B" }
        else { $c.confidence = "C" }
      } else {
        $c.lumRank = 0
        $c.rankDiff = 0
        $c.crossStatus = "single"
        if ($c.games -ge 25000) { $c.confidence = "A" }
        elseif ($c.games -ge 8000) { $c.confidence = "B" }
        else { $c.confidence = "C" }
      }
    }
    foreach ($a in $augs) {
      $a.crossStatus = "single"
      if ($a.picks -ge 200000) { $a.confidence = "A" }
      elseif ($a.picks -ge 50000) { $a.confidence = "B" }
      else { $a.confidence = "C" }
    }

    $gTop = @($champs | Select-Object -First 20 | ForEach-Object { ([string]$_.key).ToLower() })
    $common = 0
    foreach ($k in $gTop) { if ($lumTopKeys -contains $k) { $common++ } }
    $lumStatus = "diverge"
    if ($lumTopKeys.Count -lt 5) { $lumStatus = "single" }
    elseif ($common -ge 14) { $lumStatus = "agree" }
    elseif ($common -ge 9) { $lumStatus = "close" }

    $subM = [regex]::Match($html, '<p class="tl-sub num[^"]*">([\s\S]*?)</p>')
    $subText = HtmlText $subM.Groups[1].Value
    $nums = [regex]::Matches($subText, '([\d,]{4,})')
    $sampleMatches = 0
    $samplePicks = 0
    if ($nums.Count -ge 2) {
      $sampleMatches = [int64](ToNum $nums[0].Groups[1].Value)
      $samplePicks = [int64](ToNum $nums[1].Groups[1].Value)
    }

    # 斗魂海克斯效果（CommunityDragon，中文）
    $ArenaAugmentInfo = @{}
    try {
      $cdRes = Get-CachedTextTtl "https://raw.communitydragon.org/latest/cdragon/arena/zh_cn.json" "cdragon-arena-zh_cn.json" 50 24
      $cd = $cdRes.text | ConvertFrom-Json
      foreach ($a in @($cd.augments)) {
        $t = [string]$a.tooltip
        if (-not $t) { $t = [string]$a.desc }
        if (-not $t) { continue }
        $t = [regex]::Replace($t, '<br\s*/?>', "`n")
        $t = [regex]::Replace($t, '<[^>]+>', '')
        $t = [Net.WebUtility]::HtmlDecode($t)
        foreach ($m in [regex]::Matches($t, '@([A-Za-z0-9_]+)(?:\*([0-9.]+))?@')) {
          $key = $m.Groups[1].Value
          $prop = $null
          if ($null -ne $a.dataValues) { $prop = $a.dataValues.PSObject.Properties[$key] }
          if ($null -eq $prop) { $t = $t.Replace($m.Value, "§"); continue }
          $vals = @($prop.Value)
          if ($vals.Count -eq 0) { $t = $t.Replace($m.Value, "§"); continue }
          $num = [double]$vals[0]
          if ($m.Groups[2].Success) { $num = $num * [double]$m.Groups[2].Value }
          $t = $t.Replace($m.Value, $num.ToString("0.##"))
        }
        # 丢弃含缺失占位符的整句，避免出现“获得 暴击率”这类残句
        $before = $t
        $t = [regex]::Replace($t, '[^。！？\n]*§[^。！？\n]*[。！？]?', '')
        $t = $t.Replace("§", "").Trim()
        if (-not $t) { $t = $before.Replace("§", "").Trim() }
        $t = ([regex]::Replace($t, '[ \t]+', ' ')).Trim()
        $t = [regex]::Replace($t, '%i:[^%]+%', '')
        $t = [regex]::Replace($t, '@[A-Za-z0-9_]+(?:\*[0-9.]+)?@', '')
        $t = [regex]::Replace($t, '\s+([，。；：、])', '$1')
        $t = ($t -replace '[ \t]+', ' ').Trim()
        if ($t) {
          $ArenaAugmentInfo[[string]$a.name] = [ordered]@{
            name = [string]$a.name
            effect = $t
            source = "CommunityDragon Arena"
          }
        }
      }
      Write-Log "斗魂海克斯效果：$($ArenaAugmentInfo.Count) 个"
      # CommunityDragon 缺少的斗魂海克斯，回退到 ARAMKit 文本（来源会标注，数值可能与斗魂不同）
      $aramAugByName = @{}
      foreach ($ai in $AramAugmentInfo.Values) { $aramAugByName[[string]$ai.name] = $ai }
      $fallback = 0
      foreach ($a in @($augs)) {
        if ($ArenaAugmentInfo.ContainsKey([string]$a.name)) { continue }
        $ai = $aramAugByName[[string]$a.name]
        if ($null -eq $ai) { continue }
        $effText = (@($ai.effect) | ForEach-Object { [string]$_.text } | Where-Object { $_ }) -join "`n"
        if (-not $effText) { continue }
        $ArenaAugmentInfo[[string]$a.name] = [ordered]@{
          name = [string]$a.name
          effect = $effText
          source = "ARAMKit（海斗数值）"
        }
        $fallback++
      }
      Write-Log "斗魂海克斯效果回退 ARAMKit：$fallback 个"
    } catch { Write-Log "WARN 斗魂海克斯效果抓取失败：$($_.Exception.Message)" }

    # 斗魂装备属性（Data Dragon，含 223xxx 专属装备）
    $ArenaItemInfo = @{}
    try {
      $arenaItemIds = @{}
      foreach ($k in $arenaBuilds.Keys) {
        foreach ($it in @($arenaBuilds[$k].items)) {
          if ($it.itemId) { $arenaItemIds[[string]$it.itemId] = $true }
        }
      }
      $ddRes = Get-CachedTextTtl "https://ddragon.leagueoflegends.com/cdn/16.22.1/data/zh_CN/item.json" "ddragon-items-zh.json" 40 24
      $dd = $ddRes.text | ConvertFrom-Json
      foreach ($iid in $arenaItemIds.Keys) {
        $ip = $dd.data.PSObject.Properties[$iid]
        if ($null -eq $ip) { continue }
        $it = $ip.Value
        $desc = [string]$it.description
        $stats = @()
        $effects = @()
        $statsM = [regex]::Match($desc, '(?s)<stats>([\s\S]*?)</stats>')
        if ($statsM.Success) {
          $sh = [regex]::Replace($statsM.Groups[1].Value, '<br\s*/?>', "`n")
          $sh = [regex]::Replace($sh, '<[^>]+>', '')
          $sh = [Net.WebUtility]::HtmlDecode($sh)
          foreach ($ln in ($sh -split "`n")) {
            $ln = ($ln -replace '\s+', ' ').Trim()
            if ($ln) { $stats += $ln }
          }
          $eh = $desc.Substring($statsM.Index + $statsM.Length)
          $eh = [regex]::Replace($eh, '<br\s*/?>', "`n")
          $eh = [regex]::Replace($eh, '<[^>]+>', '')
          $eh = [Net.WebUtility]::HtmlDecode($eh)
          foreach ($ln in ($eh -split "`n")) {
            $ln = ($ln -replace '\s+', ' ').Trim()
            # Data Dragon 对部分斗魂装备的动态伤害显示为 0，直接去掉误导性的 0
            $ln = $ln -replace '0(魔法伤害|物理伤害|真实伤害)', '$1'
            if ($ln) { $effects += $ln }
          }
        } else {
          $plain = [regex]::Replace($desc, '<[^>]+>', ' ')
          $plain = [Net.WebUtility]::HtmlDecode($plain)
          $plain = ($plain -replace '\s+', ' ').Trim()
          if ($plain) { $effects += $plain }
        }
        $ArenaItemInfo[$iid] = [ordered]@{
          id = [int]$iid
          name = [string]$it.name
          icon = ""
          price = $(if ($null -ne $it.gold) { [int]$it.gold.total } else { 0 })
          stats = $stats
          effects = $effects
        }
      }
      Write-Log "斗魂装备属性：$($ArenaItemInfo.Count) 件（出装引用）"
    } catch { Write-Log "WARN 斗魂装备属性抓取失败：$($_.Exception.Message)" }

    $ArenaMeta = [ordered]@{
      patch = $Patch
      dataDate = (Get-Date).ToString("yyyy-MM-dd")
      window = "近 2–3 周（滚动）"
      sampleMatches = $sampleMatches
      samplePicks = $samplePicks
      championCount = $champs.Count
      augmentCount = $augs.Count
      buildCoverage = $arenaBuilds.Count
      buildTopN = $ArenaTop
      source = "ggez.gg（Riot Games API 对局 + CommunityDragon）"
      sourceUrl = "https://ggez.gg/zh/tierlist/arena"
      crossSource = "lum.gg"
      crossStatus = $lumStatus
      crossTopOverlap = $common
      crossNote = "lum.gg 仅提供强度排序、无胜率，用于前 20 排序一致性校验；数值以 ggez 为准。"
      license = "数据归 ggez.gg / Riot Games，个人非商用"
    }
    $ArenaObj = [ordered]@{
      meta = $ArenaMeta
      champions = $champs
      augments = $augs
      builds = $arenaBuilds
      augmentInfo = $ArenaAugmentInfo
      itemInfo = $ArenaItemInfo
    }
    Write-Log "斗魂完成：$($champs.Count) 英雄，$($augs.Count) 海克斯，$($arenaBuilds.Count) 套出装；lum 重叠 $common/20"
  } catch {
    Write-Log "ERROR 斗魂数据失败：$($_.Exception.Message)"
    $cp = Join-Path $DataDir "snapshot.json"
    if (Test-Path $cp) {
      try {
        $old = Get-Content $cp -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($null -ne $old.arena) {
          $ArenaObj = $old.arena
          if ($null -ne $old.arena.meta) { $ArenaMeta = $old.arena.meta }
          Write-Log "WARN 沿用上一版斗魂数据：$($ArenaMeta.championCount) 英雄 / $($ArenaMeta.augmentCount) 海克斯 / $($ArenaMeta.buildCoverage) 套出装"
        }
      } catch { }
    }
  }
}

# ---------- 7. 汇总输出 ----------
$Sources = @(
  [ordered]@{ id = "aramhex"; name = "AramHex 数据仓库"; url = "https://github.com/czgreat/aramhex-data"; patch = $Patch; date = $AramMeta.dataDate; sample = ("{0:N0} 场有效对局" -f $AramMeta.validMatches); role = "主源"; status = "ok"; note = "国服 7 大区自采，CC BY-NC 4.0，署名使用" }
)
if ($AramCross.meta.ContainsKey("aramkit") -and $AramCross.meta["aramkit"].rows -gt 50) {
  $Sources += [ordered]@{ id = "aramkit"; name = "ARAMKit"; url = "https://aramkit.cn/zh-CN/champions"; patch = $AramCross.meta["aramkit"].patch; date = $AramCross.meta["aramkit"].date; sample = "29,490,201 场"; role = "交叉校验"; status = "ok"; note = "仅用于核对英雄/海克斯胜率，不混算样本；趣味榜单另提供真实双海克斯组合样本（单源、未公开逐组样本量）" }
}
if ($AramCross.meta.ContainsKey("hexdata") -and $AramCross.meta["hexdata"].rows -gt 50) {
  $hexStatus = "warn"
  if ($AramCross.meta["hexdata"].patch -eq $Patch) { $hexStatus = "ok" }
  $Sources += [ordered]@{ id = "hexdata"; name = "Hexdata"; url = "https://hexdata.com.cn/heroes"; patch = $AramCross.meta["hexdata"].patch; date = $AramCross.meta["hexdata"].date; sample = "21,350,000 场"; role = "交叉校验"; status = $hexStatus; note = "独立样本，仅核对榜单方向与胜率" }
}
if ($null -ne $ArenaMeta) {
  $arenaSample = "{0:N0} 场 / {1:N0} 人次" -f $ArenaMeta.sampleMatches, $ArenaMeta.samplePicks
  $Sources += [ordered]@{ id = "ggez"; name = "ggez.gg"; url = "https://ggez.gg/zh/tierlist/arena"; patch = $ArenaMeta.patch; date = $ArenaMeta.dataDate; sample = $arenaSample; role = "主源（斗魂）"; status = "ok"; note = "Riot API 对局，近 2-3 周滚动样本" }
  $lumRole = "交叉校验（斗魂·排序）"
  $lumNote = "仅核对前 20 强度排序，重叠 $($ArenaMeta.crossTopOverlap)/20；无胜率，不参与数值计算"
  $Sources += [ordered]@{ id = "lum"; name = "lum.gg"; url = "https://lum.gg/zh-cn/lol/arena"; patch = $ArenaMeta.patch; date = $ArenaMeta.dataDate; sample = "6,382,278 人次"; role = $lumRole; status = "ok"; note = $lumNote }
}
$Excluded = @(
  [ordered]@{ name = "arammayhem.net"; reason = "版本停在 26.17 / 2026-08，已落后当前 16.22，整站排除"; url = "https://www.arammayhem.net/zh/augment-combos/" },
  [ordered]@{ name = "op.gg 单英雄旧页"; reason = "搜索快照显示 16.05 / 16.11 版本，未达到当前版本一致性要求；仅在其 16.22 页面可用时才采信"; url = "https://op.gg/zh-cn/lol/modes/arena" },
  [ordered]@{ name = "无版本号/无样本量的榜单"; reason = "无法确认时效与统计口径，全部不采信" }
)

$Audit = [ordered]@{
  sources = $Sources
  excluded = $Excluded
  checks = [ordered]@{
    aramHeroTop50Agree = $agreeHero
    aramAugTop50Agree = $agreeAug
    aramCombos = $AramCombos.Count
    aramkitHeroRows = $AramCross.aramkitHero.Count
    aramkitAugRows = $AramCross.aramkitAug.Count
    hexdataHeroRows = $AramCross.hexHero.Count
    hexdataAugRows = $AramCross.hexAug.Count
    ddragonVersion = $DdragonVersion
    arenaChampionCount = $(if ($null -ne $ArenaMeta) { $ArenaMeta.championCount } else { 0 })
    arenaAugmentCount = $(if ($null -ne $ArenaMeta) { $ArenaMeta.augmentCount } else { 0 })
    arenaBuilds = $(if ($null -ne $ArenaMeta) { $ArenaMeta.buildCoverage } else { 0 })
    arenaLumTop20Overlap = $(if ($null -ne $ArenaMeta) { $ArenaMeta.crossTopOverlap } else { 0 })
  }
  confidence = [ordered]@{
    A = "样本充足，且至少一个独立来源偏差 ≤ 2 个百分点"
    B = "样本中等，或偏差 ≤ 4 个百分点"
    C = "低样本或来源分歧较大，仅作参考"
    single = "仅主源覆盖，未能完成第二来源核对"
  }
}

$Snapshot = [ordered]@{
  generatedAt = [DateTimeOffset]::Now.ToString("yyyy-MM-dd HH:mm:ss zzz")
  patch = $Patch
  aram = $AramObj
  arena = $ArenaObj
  audit = $Audit
}

$json = $Snapshot | ConvertTo-Json -Depth 20 -Compress
[IO.File]::WriteAllText((Join-Path $DataDir "snapshot.json"), $json, $Utf8)
[IO.File]::WriteAllText((Join-Path $DataDir "snapshot.js"), ("window.__SNAPSHOT__ = " + ($Snapshot | ConvertTo-Json -Depth 20 -Compress) + ";"), $Utf8)
$doneMsg = "数据已更新：海斗 {0} 英雄 / {1} 海克斯" -f $AramMeta.heroCount, $AramMeta.augmentCount
if ($null -ne $ArenaMeta) {
  $doneMsg += "；斗魂 {0} 英雄 / {1} 海克斯 / {2} 套出装" -f $ArenaMeta.championCount, $ArenaMeta.augmentCount, $ArenaMeta.buildCoverage
}
Write-Status "ok" "done" $doneMsg
Write-Log ("===== 刷新完成，用时 {0:N1}s =====" -f ([DateTimeOffset]::Now - $StartedAt).TotalSeconds)
