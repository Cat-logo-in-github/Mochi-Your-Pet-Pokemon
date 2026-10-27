param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('\A[A-Za-z0-9._-]+\.apps\.googleusercontent\.com\z')]
    [string]$ClientId,
    [string]$DestinationDirectory = ''
)
$ErrorActionPreference = 'Stop'
$mochiRepository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$mochiPublicExtension = Join-Path $mochiRepository 'Browser-Extension'
if (-not (Test-Path -LiteralPath (Join-Path $mochiPublicExtension 'manifest.json') -PathType Leaf)) {
    $mochiPublicExtension = Join-Path $mochiRepository 'apps/extension/dist'
}
$mochiManifestPath = Join-Path $mochiPublicExtension 'manifest.json'
if (-not (Test-Path -LiteralPath $mochiManifestPath -PathType Leaf)) { throw 'Use the complete ZIP, or build the public browser extension first.' }
$mochiManifest = Get-Content -Raw -LiteralPath $mochiManifestPath | ConvertFrom-Json
if ($mochiManifest.oauth2) { throw 'The source extension must be the public build without OAuth configuration.' }
if (-not $mochiManifest.key -or $mochiManifest.manifest_version -ne 3) { throw 'The extension needs its stable public identity before personal setup.' }
if (-not $DestinationDirectory) {
    $mochiLocalRoot = [Environment]::GetFolderPath('LocalApplicationData')
    $DestinationDirectory = Join-Path $mochiLocalRoot ('Mochi/Personal-Extension-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))
}
$mochiDestination = [IO.Path]::GetFullPath($DestinationDirectory)
$mochiRepositoryPrefix = $mochiRepository.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if ($mochiDestination.Equals($mochiRepository, [StringComparison]::OrdinalIgnoreCase) -or $mochiDestination.StartsWith($mochiRepositoryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The personal extension must be outside this public project so your Google project cannot be accidentally published.'
}
if (Test-Path -LiteralPath $mochiDestination) { throw 'Choose a new personal folder; existing data will not be overwritten.' }
$mochiSourceFiles = Get-ChildItem -LiteralPath $mochiPublicExtension -Recurse -Force
if (@($mochiSourceFiles | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Extension files must not contain links to other folders.' }
if (@($mochiSourceFiles | Where-Object { $_.Name -match '\A(?:\.env(?:\..*)?|credentials.*|secrets.*|tokens?\..*)\z' }).Count) { throw 'Unexpected private file in the public extension.' }
New-Item -ItemType Directory -Path $mochiDestination -Force | Out-Null
Get-ChildItem -LiteralPath $mochiPublicExtension -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $mochiDestination -Recurse -Force }
$mochiManifest | Add-Member -MemberType NoteProperty -Name oauth2 -Value ([ordered]@{client_id = $ClientId; scopes = @()})
$mochiPersonalManifest = Join-Path $mochiDestination 'manifest.json'
[IO.File]::WriteAllText($mochiPersonalManifest, ($mochiManifest | ConvertTo-Json -Depth 30) + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
Write-Output 'Personal Chrome extension prepared outside the public project. Do not redistribute this copy.'
Write-Output ('Load unpacked folder in Chrome: ' + $mochiDestination)
Write-Output 'Open Mochi settings, connect one Google service at a time, and review consent in Google.'