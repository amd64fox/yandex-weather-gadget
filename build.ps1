$ErrorActionPreference = 'Stop'
$source = (Resolve-Path (Join-Path $PSScriptRoot 'src')).Path
$package = Join-Path $PSScriptRoot 'YandexWeather.gadget'
if (Test-Path -LiteralPath $package) { Remove-Item -LiteralPath $package -Force }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$required = @(
    'gadget.html','gadget.css','gadget.js','gadget.xml','weather-parser.js','weather-particles.js','weather-http.js','settings.html','settings.css','settings.js',
    'icon.png','sunrise-dashboard.png','sunset-dashboard.png','hourly-arrows.png','refresh-night.png','yandex-weather-logo.ico',
    'background-night-dashboard.png','background-night-dashboard-middle.png','background-night-dashboard-bottom.png','panels-night-dashboard.png'
)
$gaugeTones = '(neutral|none|low|moderate|average|strong|storm|extreme|uv-extreme)'
$assetPattern = "^(metric-(wind|humidity|pressure|uv|magnetic|pressure-${gaugeTones}-[012]|status-${gaugeTones})|yandex-weather-(icons-(32|64)|(base|precip)-64))\.png$"
$files = Get-ChildItem -LiteralPath $source -File | Where-Object {
    $_.Name -in $required -or $_.Name -match $assetPattern
}
foreach ($name in $required) { if (-not ($files.Name -contains $name)) { throw "Required gadget file missing: $name" } }
$archive = [System.IO.Compression.ZipFile]::Open($package, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $files) {
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $file.Name, [System.IO.Compression.CompressionLevel]::Optimal)
    }
} finally { $archive.Dispose() }
Get-Item -LiteralPath $package | Select-Object FullName, Length
