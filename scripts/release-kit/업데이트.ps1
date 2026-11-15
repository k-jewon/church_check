# Replaces the installed binaries/assets with the latest release zip (or a local zip).
# config.json / data/ are untouched — the zip never contains them (build.mjs refuses).
# Messages are ASCII: Windows PowerShell 5.1 reads a BOM-less file as ANSI, so Korean
# would garble here. The bat wrapper prints Korean around this.
param([string]$Zip)
$ErrorActionPreference = 'Stop'
$repo = 'k-jewon/church_check'
$tmp = Join-Path $env:TEMP 'church_check_update'
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $tmp | Out-Null

try {
  $zipPath = Join-Path $tmp 'update.zip'
  if ($Zip) {
    Copy-Item $Zip $zipPath -Force
    $tag = $Zip
  } else {
    try {
      $rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest"
      $asset = $rel.assets | Where-Object { $_.name -like '*-win.zip' } | Select-Object -First 1
      if (-not $asset) { Write-Host 'Up to date: no zip in the latest release.'; exit 2 }
      Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -UseBasicParsing
      $tag = $rel.tag_name
    } catch {
      # 404 = 아직 릴리스가 없다는 뜻(실패가 아니다). 그 외 오류는 네트워크 문제다.
      if ($_.Exception.Response -and $_.Exception.Response.StatusCode -eq 'NotFound') {
        Write-Host 'Up to date: no release published yet.'
        exit 2
      }
      throw
    }
  }

  Expand-Archive -Path $zipPath -DestinationPath $tmp
  $src = (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName
  if (-not $src) { Write-Host 'Cannot read the zip layout.'; exit 1 }

  # Copy file-by-file: Copy-Item of a directory onto an existing directory nests it
  # (public\public), so public/ and template/ are copied as contents instead.
  foreach ($item in Get-ChildItem $src) {
    if ($item.PSIsContainer) {
      New-Item -ItemType Directory -Path (Join-Path '.' $item.Name) -Force | Out-Null
      Copy-Item (Join-Path $item.FullName '*') (Join-Path '.' $item.Name) -Recurse -Force
    } else {
      Copy-Item $item.FullName '.' -Force
    }
  }
  Write-Host "Update done: $tag (config.json and data preserved)"
} catch {
  Write-Host "Update failed: $($_.Exception.Message)"
  exit 1
} finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
