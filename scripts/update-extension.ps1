# update-extension.ps1
# Downloads the latest AMO-signed Hashway .xpi from GitHub Releases and
# installs it into the configured Firefox profile.
#
# Requires:
#   - gh CLI authenticated (or GITHUB_TOKEN env var)
#   - .local.env with HASHWAY_FIREFOX_PROFILE=<full path to the profile dir>
# Usage:
#   npm run update:extension

$ErrorActionPreference = "Stop"
$repo = "lxfactorl/hashway"
$extensionId = "hashway@hashway.local"

function Load-LocalEnv {
    $envFile = Join-Path $PSScriptRoot "..\.local.env"
    if (-not (Test-Path $envFile)) {
        Write-Error "Missing .local.env. Copy .local.env.example to .local.env and set HASHWAY_FIREFOX_PROFILE."
    }
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $kv = $line -split "=", 2
            Set-Item -Path ("Env:" + $kv[0].Trim()) -Value $kv[1].Trim()
        }
    }
}

function Get-GhReleaseJson {
    param([string]$Arg)
    $headers = $null
    if ($env:GITHUB_TOKEN) {
        $headers = @{ Authorization = "Bearer $env:GITHUB_TOKEN" }
    }
    $uri = "https://api.github.com/repos/$repo/releases/$Arg"
    if ($headers) {
        return Invoke-RestMethod -Uri $uri -Headers $headers
    }
    $out = gh api "repos/$repo/releases/$Arg" 2>&1
    if ($LASTEXITCODE -ne 0) { throw "gh failed: $out" }
    return ($out | ConvertFrom-Json)
}

function Write-Result {
    param([string]$Message)
    Write-Output $Message
}

try {
    Load-LocalEnv

    $profile = $env:HASHWAY_FIREFOX_PROFILE
    if ([string]::IsNullOrWhiteSpace($profile)) {
        Write-Error "HASHWAY_FIREFOX_PROFILE is empty. Set it in .local.env to the Firefox profile directory."
    }
    if (-not (Test-Path $profile)) {
        Write-Error "Firefox profile directory not found: $profile"
    }

    $release = Get-GhReleaseJson "latest"
    if (-not $release) { throw "Could not fetch the latest release." }
    $xpiAsset = $release.assets | Where-Object { $_.name -like "*.xpi" } | Select-Object -First 1

    if (-not $xpiAsset) {
        Write-Result "Release $($release.tag_name) has no signed .xpi asset yet."
        Write-Result "CI signing skips until AMO_API_KEY and AMO_API_SECRET are set in GitHub Secrets."
        exit 0
    }

    $extensionsDir = Join-Path $profile "extensions"
    if (-not (Test-Path $extensionsDir)) {
        New-Item -ItemType Directory -Path $extensionsDir -Force | Out-Null
    }

    $versionFile = Join-Path $extensionsDir "$extensionId.version"
    $installedVersion = if (Test-Path $versionFile) { (Get-Content $versionFile -Raw).Trim() } else { "" }
    $latestVersion = $release.tag_name.TrimStart("v")

    if ($installedVersion -eq $latestVersion) {
        Write-Result "Already on latest version $latestVersion. Nothing to do."
        exit 0
    }

    $tempXpi = Join-Path $env:TEMP "hashway-$latestVersion.xpi"
    Invoke-WebRequest -Uri $xpiAsset.browser_download_url -OutFile $tempXpi

    $destXpi = Join-Path $extensionsDir "$extensionId.xpi"
    Copy-Item -Path $tempXpi -Destination $destXpi -Force
    Set-Content -Path $versionFile -Value $latestVersion
    Remove-Item -Path $tempXpi -Force

    Write-Result "Installed Hashway $latestVersion to $destXpi"
    Write-Result "Restart Firefox to load the new version."
} catch {
    Write-Error $_
    exit 1
}
