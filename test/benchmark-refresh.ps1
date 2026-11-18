[CmdletBinding()]
param(
    [ValidateRange(1, 20)][int]$Pairs = 5,
    [string]$Baseline
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.IO.Compression.FileSystem
if (-not ('WeatherBenchmarkDisplay' -as [type])) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WeatherBenchmarkDisplay {
    [DllImport("user32.dll", CharSet=CharSet.Unicode)]
    public static extern IntPtr FindWindow(string className, string title);
    [DllImport("user32.dll")]
    static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")]
    static extern bool RedrawWindow(IntPtr window, IntPtr rect, IntPtr region, uint flags);
    [DllImport("dwmapi.dll")]
    static extern int DwmFlush();
    public static void Paint(string title) {
        var window = FindWindow("BasicWindow", title);
        if (window == IntPtr.Zero || !IsWindowVisible(window))
            throw new InvalidOperationException("The test gadget is not visible");
        if (!RedrawWindow(window, IntPtr.Zero, IntPtr.Zero, 0x181))
            throw new InvalidOperationException("The gadget could not be repainted");
        DwmFlush();
    }
}
'@
}
$repo = Split-Path $PSScriptRoot
$gadgetRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows Sidebar\Gadgets'
$sidebar = Join-Path $env:ProgramFiles 'Windows Sidebar\sidebar.exe'
if (-not (Test-Path -LiteralPath $sidebar)) { throw 'GadgetPack is required' }
if ($Baseline) {
    $revision = git -C $repo rev-parse --verify --end-of-options ($Baseline + '^{commit}')
    if ($LASTEXITCODE -ne 0 -or $revision -notmatch '^[a-f0-9]{40}$') { throw 'Unknown baseline revision' }
}
$node = (Get-Command node.exe).Source
$runId = 'YandexWeatherBenchmark-' + [guid]::NewGuid().ToString('N')
$tempRoot = [IO.Path]::GetTempPath().TrimEnd('\')
$work = Join-Path $tempRoot $runId
$latitude = '59.9386'
$longitude = '30.3141'
$variants = @{}
$rows = [Collections.Generic.List[object]]::new()
$relayProcess = $null
$galleryCondition = [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ClassNameProperty, 'Sidebar_ManagePartDialog')
$tree = [Windows.Automation.TreeScope]::Descendants
$any = [Windows.Automation.Condition]::TrueCondition

function Find-Gallery {
    [Windows.Automation.AutomationElement]::RootElement.FindFirst([Windows.Automation.TreeScope]::Children, $galleryCondition)
}
function Close-Gallery($gallery) {
    if ($gallery) { $gallery.GetCurrentPattern([Windows.Automation.WindowPattern]::Pattern).Close() }
}
function Open-TestGadget($variant) {
    $gallery = Find-Gallery
    if (-not $gallery) { Start-Process -FilePath $sidebar -ArgumentList '/showGadgets' -WindowStyle Hidden }
    $wait = [Diagnostics.Stopwatch]::StartNew()
    do {
        $gallery = Find-Gallery
        if ($gallery) {
            $items = $gallery.FindAll($tree, $any)
            foreach ($item in $items) {
                if ($item.Current.Name -eq $variant.Title -and $item.Current.ControlType -eq [Windows.Automation.ControlType]::ListItem) {
                    $item.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
                    return
                }
            }
        }
        Start-Sleep -Milliseconds 80
    } while ($wait.Elapsed.TotalSeconds -lt 10)
    throw "Gadget gallery did not list $($variant.Title)"
}
function Write-Text($file, $value) { [IO.File]::WriteAllText($file, $value, [Text.UTF8Encoding]::new($false)) }

function Stage-Gadget($label) {
    $folder = Join-Path $gadgetRoot ($runId + '-' + $label + '.gadget')
    [void][IO.Directory]::CreateDirectory($folder)
    if ($label -eq 'Old') {
        $archive = Join-Path $PSScriptRoot 'fixtures\gadget-before-gzip.zip'
        if ($Baseline) {
            $archive = Join-Path $work 'baseline.zip'
            git -C $repo archive --format=zip "--output=$archive" ($revision + ':src')
            if ($LASTEXITCODE -ne 0) { throw 'Could not export the baseline gadget' }
        }
        [IO.Compression.ZipFile]::ExtractToDirectory($archive, $folder)
    } else {
        Get-ChildItem -LiteralPath (Join-Path $repo 'src') | Copy-Item -Destination $folder -Recurse
    }
    $title = $runId + '-' + $label
    $manifestFile = Join-Path $folder 'gadget.xml'
    [xml]$manifest = [IO.File]::ReadAllText($manifestFile)
    $manifest.gadget.name = $title
    $manifest.gadget.namespace = $title
    $manifest.Save($manifestFile)
    $pageFile = Join-Path $folder 'gadget.html'
    $page = [IO.File]::ReadAllText($pageFile)
    $page = [regex]::Replace($page, '<title>[^<]*</title>', "<title>$title</title>")
    Write-Text $pageFile ($page.Replace('</head>', '<script src="benchmark-gadget.js"></script></head>'))
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'benchmark-gadget.js') -Destination $folder
    $httpFile = Join-Path $folder 'weather-http.js'
    $http = [IO.File]::ReadAllText($httpFile)
    $send = [regex]'(?im)^([ \t]*)request\.send\(\);'
    if ($send.Matches($http).Count -ne 1) { throw 'Could not identify a unique HTTP send in the gadget' }
    Write-Text $httpFile ($send.Replace($http, '$1window.weatherBenchmarkSent = new Date().getTime();' + [Environment]::NewLine + '$0'))
    [pscustomobject]@{ Title = $title; Folder = $folder }
}

function Measure-Sample($label, $sampleId, $probeUrl) {
    $variant = $variants[$label]
    $config = @{ id = $sampleId; lat = $latitude; lon = $longitude; relay = $probeUrl } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText((Join-Path $variant.Folder 'sample.json'), $config, [Text.Encoding]::Unicode)
    $resultFile = Join-Path $variant.Folder ($sampleId + '.json')
    try {
        Open-TestGadget $variant
        $wait = [Diagnostics.Stopwatch]::StartNew()
        while (-not [IO.File]::Exists($resultFile)) {
            if ($wait.Elapsed.TotalSeconds -gt 52) { throw "$label timed out before displaying the forecast" }
            [Threading.Thread]::Sleep(5)
        }
        $result = [IO.File]::ReadAllText($resultFile) | ConvertFrom-Json
        if ($result.error) { throw "$label failed to display the forecast: $($result.error)" }
        [WeatherBenchmarkDisplay]::Paint($variant.Title)
        $painted = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        if (-not $result.started -or $result.received -lt $result.started -or $result.layout -lt $result.received -or $painted -lt $result.layout) {
            throw 'Invalid timing sequence'
        }
        [pscustomobject]@{ Variant = $label; Sample = $sampleId; HttpMs = $result.received - $result.started; LayoutMs = $result.layout - $result.received;
            PaintMs = $painted - $result.layout; TotalMs = $painted - $result.started; Temperature = $result.temperature; Cards = $result.cards }
    } finally {
        Write-Text (Join-Path $variant.Folder ($sampleId + '.done')) ''
        $wait = [Diagnostics.Stopwatch]::StartNew()
        while ([WeatherBenchmarkDisplay]::FindWindow('BasicWindow', $variant.Title) -ne [IntPtr]::Zero -and $wait.Elapsed.TotalSeconds -lt 4) {
            Start-Sleep -Milliseconds 50
        }
    }
}

function Remove-TestDirectory($parent, $leaf) {
    $path = Join-Path $parent $leaf
    if (-not [IO.Directory]::Exists($path)) { return }
    $item = Get-Item -LiteralPath $path
    if (-not $leaf.StartsWith($runId, [StringComparison]::Ordinal) -or $item.Parent.FullName -ine $parent -or
        $item.Name -cne $leaf -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Unexpected test directory' }
    Remove-Item -LiteralPath $item.FullName -Recurse
}
function Median($values) {
    $sorted = @($values | Sort-Object)
    ($sorted[[int][Math]::Floor(($sorted.Count - 1) / 2)] + $sorted[[int][Math]::Floor($sorted.Count / 2)]) / 2
}

$originalGallery = Find-Gallery
try {
    [void][IO.Directory]::CreateDirectory($work)
    foreach ($label in 'Old', 'New') { $variants[$label] = Stage-Gadget $label }
    if ($originalGallery) { Close-Gallery $originalGallery; Start-Sleep -Milliseconds 200 }
    $relay = Join-Path $PSScriptRoot 'benchmark-transfer.js'
    $relayProcess = Start-Process -FilePath $node -ArgumentList ('"{0}" "{1}" {2} {3}' -f $relay, $work, $latitude, $longitude) -WindowStyle Hidden -PassThru
    $portFile = Join-Path $work 'port'
    $wait = [Diagnostics.Stopwatch]::StartNew()
    while (-not [IO.File]::Exists($portFile)) {
        if ($relayProcess.HasExited -or $wait.Elapsed.TotalSeconds -gt 5) { throw 'The loopback relay did not start' }
        Start-Sleep -Milliseconds 30
    }
    $port = [int][IO.File]::ReadAllText($portFile)
    foreach ($label in 'Old', 'New') {
        $null = Measure-Sample $label 'wire' "http://127.0.0.1:$port/$label"
        $wire = [IO.File]::ReadAllText((Join-Path $work ($label + '-wire.json'))) | ConvertFrom-Json
        $encoding = if ($label -eq 'New') { 'gzip' } else { 'identity' }
        if ($wire.status -ne 200 -or $wire.encoding -ne $encoding -or ($label -eq 'New' -and ($wire.offered -notmatch 'gzip' -or $wire.bytes -ge $wire.decoded))) {
            throw "Unexpected $label wire response $($wire | ConvertTo-Json -Compress)"
        }
        Write-Host "$label wire: $($wire.encoding), $($wire.bytes) bytes, $($wire.decoded) bytes decoded"
    }
    for ($pair = 1; $pair -le $Pairs; $pair++) {
        $order = if ($pair % 2) { 'Old', 'New' } else { 'New', 'Old' }
        foreach ($label in $order) {
            $row = Measure-Sample $label ("pair-$pair") ''
            $rows.Add($row)
            Write-Host "$label pair $pair took $($row.TotalMs) ms"
        }
    }
    foreach ($label in 'Old', 'New') {
        $trials = @($rows | Where-Object Variant -eq $label)
        Write-Host "$label median: $(Median $trials.TotalMs) ms"
    }
    $rows
} finally {
    if ($relayProcess) {
        if (-not $relayProcess.HasExited) { $relayProcess.Kill(); $relayProcess.WaitForExit() }
        $relayProcess.Dispose()
    }
    Close-Gallery (Find-Gallery)
    foreach ($label in 'Old', 'New') { Remove-TestDirectory $gadgetRoot ($runId + '-' + $label + '.gadget') }
    Remove-TestDirectory $tempRoot $runId
    if ($originalGallery) { Start-Process -FilePath $sidebar -ArgumentList '/showGadgets' -WindowStyle Hidden }
}
