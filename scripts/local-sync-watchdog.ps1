param(
  [string]$RepoPath = "C:\Users\PC\Documents\Codigos\Prode",
  [string]$Workflow = "sync_watchdog.yml",
  [string]$Branch = "main",
  [int]$RecentRunMinutes = 7
)

$ErrorActionPreference = "Stop"
$GitHubCli = (Get-Command gh -ErrorAction Stop).Source
$NodeCli = (Get-Command node -ErrorAction Stop).Source

function Test-SyncWindow {
  & $NodeCli "$RepoPath\scripts\sync-window.js" --quiet --scheduled-only
  return $LASTEXITCODE -eq 0
}

function Test-RecentRun {
  $json = & $GitHubCli run list --workflow $Workflow --limit 5 --json createdAt,status 2>$null
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($json)) {
    return $false
  }

  $runs = $json | ConvertFrom-Json
  $cutoff = (Get-Date).ToUniversalTime().AddMinutes(-1 * $RecentRunMinutes)
  foreach ($run in $runs) {
    $createdAt = ([DateTimeOffset]::Parse($run.createdAt)).UtcDateTime
    if ($createdAt -ge $cutoff -and @("queued", "in_progress", "completed") -contains $run.status) {
      return $true
    }
  }
  return $false
}

Set-Location $RepoPath

if (-not (Test-SyncWindow)) {
  Write-Output "Outside sync window."
  exit 0
}

if (Test-RecentRun) {
  Write-Output "Recent sync run found; skipping dispatch."
  exit 0
}

& $GitHubCli workflow run $Workflow --ref $Branch
exit $LASTEXITCODE
