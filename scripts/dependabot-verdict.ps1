# scripts/dependabot-verdict.ps1
# Computes the merge verdict for a Dependabot PR.
#
# Usage:
#   pwsh -NoProfile -File scripts/dependabot-verdict.ps1 -InputJson '<json>'
#
# Input JSON:
#   {
#     "updateType": "version-update:semver-major|semver-minor|semver-patch",
#     "mergeableState": "clean|dirty|behind|...",
#     "auditExit": 0
#   }
#
# Output: writes exactly "auto-merge" or "needs-review" to stdout. Exit code 0.

param(
  [Parameter(Mandatory = $true)]
  [string]$InputJson
)

$ErrorActionPreference = "Stop"

$data = $InputJson | ConvertFrom-Json

$isMajor = $data.updateType -eq "version-update:semver-major"
$isDirty = $data.mergeableState -eq "dirty"
$auditFailed = $data.auditExit -ne 0

if ($isMajor -or $isDirty -or $auditFailed) {
  Write-Output "needs-review"
} else {
  Write-Output "auto-merge"
}

exit 0
