param(
  [string]$RepoPath = "C:\Users\PC\Documents\Codigos\Prode",
  [string]$Workflow = "sync_watchdog.yml",
  [string]$Branch = "main",
  [int]$RecentRunMinutes = 7
)

$ErrorActionPreference = "Stop"
$GitHubCli = (Get-Command gh -ErrorAction Stop).Source

function Test-SyncWindow {
  $now = (Get-Date).ToUniversalTime()
  $isUsefulHour = ($now.Hour -ge 0 -and $now.Hour -le 6) -or ($now.Hour -ge 16 -and $now.Hour -le 23)
  $isGroupStage = $now.Month -eq 6 -and $now.Day -ge 11 -and $now.Day -le 28
  $isKnockoutStage = ($now.Month -eq 6 -and $now.Day -ge 29 -and $now.Day -le 30) -or ($now.Month -eq 7 -and $now.Day -ge 1 -and $now.Day -le 19)
  return $isUsefulHour -and ($isGroupStage -or $isKnockoutStage)
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
