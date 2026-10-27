param(
    [switch]$SkipTests,
    [string]$OutputDirectory = 'dist/windows',
    [switch]$AllowMissingPetAssets,
    [string]$PetAssetsSource = ''
)
$ErrorActionPreference = 'Stop'
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceRoot = Join-Path $repositoryRoot 'apps/windows-companion'
$destination = if ([IO.Path]::IsPathRooted($OutputDirectory)) { [IO.Path]::GetFullPath($OutputDirectory) } else { [IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputDirectory)) }
$workspacePrefix = $repositoryRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $destination.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Native build output must remain inside this repository.' }
$petAssets = Join-Path $repositoryRoot 'packages/pet-assets/public/mochi'
if ($PetAssetsSource) {
    if (-not $AllowMissingPetAssets) { throw 'An alternate artwork folder is only allowed for an explicit development preview.' }
    $petAssets = if ([IO.Path]::IsPathRooted($PetAssetsSource)) { [IO.Path]::GetFullPath($PetAssetsSource) } else { [IO.Path]::GetFullPath((Join-Path $repositoryRoot $PetAssetsSource)) }
}
$petManifest = Join-Path $petAssets 'manifest.json'
if (-not (Test-Path -LiteralPath $petManifest) -and -not $AllowMissingPetAssets) { throw 'The complete shared credited sprite assets are required. Build them from the credited source sheets first. -AllowMissingPetAssets is only for a clearly marked static development preview.' }
$framework = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319'
if (-not (Test-Path -LiteralPath (Join-Path $framework 'csc.exe'))) { $framework = Join-Path $env:WINDIR 'Microsoft.NET/Framework/v4.0.30319' }
$compiler = Join-Path $framework 'csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The .NET Framework C# compiler is missing. Install .NET Framework 4.8 developer tools on Windows.' }
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$references = @('System.dll','System.Core.dll','System.Net.Http.dll','System.Security.dll','System.Web.Extensions.dll','System.Web.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Runtime.Serialization.dll','System.Xaml.dll') | ForEach-Object { '/reference:' + (Join-Path $framework $_) }
$references += @('PresentationCore.dll','PresentationFramework.dll','WindowsBase.dll','UIAutomationProvider.dll','UIAutomationTypes.dll') | ForEach-Object { '/reference:' + (Join-Path (Join-Path $framework 'WPF') $_) }
$sourceFiles = @(Get-ChildItem -LiteralPath $sourceRoot -Filter '*.cs' -File | Sort-Object Name | ForEach-Object { $_.FullName })
$arguments = @('/nologo','/target:winexe','/optimize+','/platform:anycpu','/warn:4',('/out:' + (Join-Path $destination 'Mochi.exe')),('/win32icon:' + (Join-Path $sourceRoot 'assets/mochi.ico')),('/win32manifest:' + (Join-Path $sourceRoot 'app.manifest')),('/resource:' + (Join-Path $sourceRoot 'assets/mochi.ico') + ',Mochi.Icon')) + $references + $sourceFiles
& $compiler @arguments
if ($LASTEXITCODE -ne 0) { throw 'Mochi Windows compilation failed. Quit a running copy if it holds the executable open.' }
Copy-Item -LiteralPath (Join-Path $sourceRoot 'Mochi.exe.config') -Destination $destination
Copy-Item -LiteralPath (Join-Path $sourceRoot 'README.md') -Destination (Join-Path $destination 'README.md')
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'LICENSE') -Destination $destination
$installedAssets = Join-Path $destination 'assets/mochi'
if (Test-Path -LiteralPath $petManifest) {
    $assetMetadata = Get-Content -Raw -LiteralPath $petManifest | ConvertFrom-Json
    if ($assetMetadata.version -ne 2 -or $assetMetadata.render -ne 'sprite-sheet-2d' -or $assetMetadata.tileSize -ne 256 -or $assetMetadata.columns -ne 8 -or $assetMetadata.rows -ne 4) { throw 'Invalid shared sprite artwork manifest.' }
    # Rebuild this generated asset folder so removed source clips cannot linger in the portable ZIP.
    $resolvedAssetOutput = [IO.Path]::GetFullPath($installedAssets)
    $destinationPrefix = $destination.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $resolvedAssetOutput.StartsWith($destinationPrefix, [StringComparison]::OrdinalIgnoreCase) -or -not $resolvedAssetOutput.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Generated asset cleanup escaped the selected build directory.' }
    $sourceAssetPath = [IO.Path]::GetFullPath($petAssets).TrimEnd([IO.Path]::DirectorySeparatorChar)
    if ($sourceAssetPath.Equals($resolvedAssetOutput, [StringComparison]::OrdinalIgnoreCase) -or $sourceAssetPath.StartsWith($resolvedAssetOutput + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Development artwork source must not be inside the generated asset output.' }
    if (Test-Path -LiteralPath $resolvedAssetOutput) { Remove-Item -LiteralPath $resolvedAssetOutput -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $installedAssets | Out-Null
    $atlasNames = @($assetMetadata.clips.PSObject.Properties | ForEach-Object { $_.Value.atlases } | Sort-Object -Unique)
    foreach ($relativeAtlas in $atlasNames) {
        if ($relativeAtlas -cnotmatch '\Aatlases/[A-Za-z0-9_/-]+\.png\z' -or $relativeAtlas.Contains('//')) { throw 'Unsafe atlas filename in the shared artwork manifest.' }
        $sourceAtlas = Join-Path $petAssets $relativeAtlas
        $targetAtlas = Join-Path $installedAssets $relativeAtlas
        if (-not (Test-Path -LiteralPath $sourceAtlas -PathType Leaf)) { throw ('Missing shared atlas: ' + $relativeAtlas) }
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $targetAtlas) | Out-Null
        Copy-Item -LiteralPath $sourceAtlas -Destination $targetAtlas -Force
    }
    foreach ($skin in @('eevee','vaporeon','jolteon','flareon','espeon','umbreon','leafeon','glaceon','sylveon')) {
        $poster = Join-Path $petAssets ('posters/' + $skin + '.png')
        if (Test-Path -LiteralPath $poster -PathType Leaf) {
            New-Item -ItemType Directory -Force -Path (Join-Path $installedAssets 'posters') | Out-Null
            Copy-Item -LiteralPath $poster -Destination (Join-Path $installedAssets ('posters/' + $skin + '.png')) -Force
        }
    }
    foreach ($creditName in @('CREDITS.md','LICENSE-SpriteCollab.md','SOURCE.json')) {
        $creditSource = Join-Path $petAssets $creditName
        if (Test-Path -LiteralPath $creditSource -PathType Leaf) { Copy-Item -LiteralPath $creditSource -Destination (Join-Path $installedAssets $creditName) -Force }
        elseif (-not $AllowMissingPetAssets) { throw ('Required sprite attribution is missing: ' + $creditName) }
    }
    Copy-Item -LiteralPath $petManifest -Destination (Join-Path $installedAssets 'manifest.json') -Force
} else {
    Write-Warning 'Static development placeholder only: no character sprites are present. This is not a finished sprite release.'
}
if (-not $SkipTests) {
    $testDirectory = Join-Path $repositoryRoot 'work/windows-self-test'
    New-Item -ItemType Directory -Force -Path $testDirectory | Out-Null
    $reportFile = Join-Path $testDirectory 'self-test-results.json'
    $testStartedAt = [DateTime]::UtcNow
    $testArguments = @('--self-test','--data-dir',('"' + $testDirectory + '"'))
    if (-not $AllowMissingPetAssets) { $testArguments += '--require-assets' }
    $testProcess = Start-Process -FilePath (Join-Path $destination 'Mochi.exe') -ArgumentList $testArguments -WindowStyle Hidden -Wait -PassThru
    if ($testProcess.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $reportFile)) { throw 'Mochi native self-tests failed or did not produce a report.' }
    if ((Get-Item -LiteralPath $reportFile).LastWriteTimeUtc -lt $testStartedAt) { throw 'Mochi native self-test report was not refreshed by this run.' }
    $report = Get-Content -Raw -LiteralPath $reportFile | ConvertFrom-Json
    if ($report.Passed -lt 50 -or $report.Failed -ne 0 -or $report.Tests.Count -ne $report.Passed) { throw 'Expected the native core and sprite asset/timing self-tests to pass. Inspect work/windows-self-test/self-test-results.json.' }
    Write-Output ('Mochi native self-tests: ' + $report.Passed + ' passed, 0 failed.')
} else {
    Write-Output 'Native self-tests skipped explicitly with -SkipTests.'
}
$outputLeaf = Split-Path -Leaf $destination
$zipName = if ($outputLeaf -eq 'windows') { 'mochi-windows-companion.zip' } else { 'mochi-windows-companion-' + $outputLeaf.Replace('windows-','') + '.zip' }
$zip = Join-Path $repositoryRoot ('dist/' + $zipName)
$zipFiles = @((Join-Path $destination 'Mochi.exe'),(Join-Path $destination 'Mochi.exe.config'),(Join-Path $destination 'README.md'),(Join-Path $destination 'LICENSE'))
if (Test-Path -LiteralPath $installedAssets) { $zipFiles += (Join-Path $destination 'assets') }
# ZipArchive uses forward-slash entry names on every PowerShell/.NET version.
Add-Type -AssemblyName System.IO.Compression
$zipStream = [IO.File]::Open($zip, [IO.FileMode]::Create)
$zipArchive = New-Object System.IO.Compression.ZipArchive($zipStream, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($zipInput in $zipFiles) {
        $inputItem = Get-Item -LiteralPath $zipInput
        $archiveInputs = if ($inputItem.PSIsContainer) { @(Get-ChildItem -LiteralPath $zipInput -File -Recurse) } else { @($inputItem) }
        foreach ($archiveInput in $archiveInputs) {
            $relativeName = $archiveInput.FullName.Substring($destination.Length).TrimStart([IO.Path]::DirectorySeparatorChar).Replace('\', '/')
            $entry = $zipArchive.CreateEntry($relativeName, [IO.Compression.CompressionLevel]::Optimal)
            $entryStream = $entry.Open()
            $inputStream = [IO.File]::OpenRead($archiveInput.FullName)
            try { $inputStream.CopyTo($entryStream) } finally { $inputStream.Dispose(); $entryStream.Dispose() }
        }
    }
} finally { $zipArchive.Dispose(); $zipStream.Dispose() }
Write-Output ('Windows companion built: ' + (Join-Path $destination 'Mochi.exe'))
Write-Output ('Portable release ZIP: ' + $zip)
