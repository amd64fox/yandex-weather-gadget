Add-Type -AssemblyName System.Drawing
$output = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\src')).Path 'icon.png'
$image = [System.Drawing.Bitmap]::new(64, 64)
$graphics = [System.Drawing.Graphics]::FromImage($image)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)
$sun = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 247, 180, 71))
$cloud = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 237, 246, 255))
$shadow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 155, 186, 215))
$ray = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 247, 180, 71), 3)
$ray.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$ray.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
foreach ($line in @(@(19, 3, 19, 8), @(19, 34, 19, 39), @(2, 21, 7, 21), @(31, 8, 35, 4), @(4, 7, 8, 11))) {
    $graphics.DrawLine($ray, $line[0], $line[1], $line[2], $line[3])
}
$graphics.FillEllipse($sun, 8, 10, 23, 23)
$graphics.FillEllipse($shadow, 10, 32, 28, 23)
$graphics.FillEllipse($shadow, 26, 25, 27, 29)
$graphics.FillEllipse($shadow, 41, 34, 18, 18)
$graphics.FillRectangle($shadow, 12, 40, 45, 14)
$graphics.FillEllipse($cloud, 10, 29, 28, 23)
$graphics.FillEllipse($cloud, 26, 22, 27, 29)
$graphics.FillEllipse($cloud, 41, 31, 18, 18)
$graphics.FillRectangle($cloud, 12, 38, 45, 14)
$image.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
$ray.Dispose()
$sun.Dispose()
$cloud.Dispose()
$shadow.Dispose()
$graphics.Dispose()
$image.Dispose()
