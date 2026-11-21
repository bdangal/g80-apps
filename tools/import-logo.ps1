param([Parameter(Mandatory=$true)][string]$Path, [int]$Width = 495)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$dest = Join-Path $PSScriptRoot '../apps/bishal_garage/package/artwork'
$source = New-Object Drawing.Bitmap ((Resolve-Path $Path).Path)
# Crop to the logo: every pixel noticeably darker than the white background.
$minX = $source.Width; $minY = $source.Height; $maxX = -1; $maxY = -1
for ($y=0; $y -lt $source.Height; $y++) { for ($x=0; $x -lt $source.Width; $x++) {
    $c = $source.GetPixel($x,$y)
    if ([Math]::Min($c.R,[Math]::Min($c.G,$c.B)) -lt 200) { $minX=[Math]::Min($minX,$x); $maxX=[Math]::Max($maxX,$x); $minY=[Math]::Min($minY,$y); $maxY=[Math]::Max($maxY,$y) }
} }
$crop = New-Object Drawing.Rectangle ($minX-2),($minY-2),($maxX-$minX+5),($maxY-$minY+5)
$height = [int][Math]::Round($crop.Height * $Width / $crop.Width)
$bitmap = New-Object Drawing.Bitmap $Width,$height
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.DrawImage($source,(New-Object Drawing.Rectangle 0,0,$Width,$height),$crop,[Drawing.GraphicsUnit]::Pixel)
$rgba = New-Object byte[] ($Width*$height*4)
for ($y=0; $y -lt $height; $y++) { for ($x=0; $x -lt $Width; $x++) {
    $c = $bitmap.GetPixel($x,$y); $i = ($y*$Width+$x)*4
    # Alpha is the distance from white; colour is un-mixed from the white background.
    $a = 255 - [Math]::Min($c.R,[Math]::Min($c.G,$c.B))
    $a = [Math]::Max(0,[Math]::Min(255,[int](($a - 18) * 255 / 200)))
    if ($a -eq 0) { $r=0; $g=0; $b=0 } else {
        $k = $a / 255.0
        $r = [Math]::Max(0,[Math]::Min(255,[int](($c.R - 255*(1-$k)) / $k)))
        $g = [Math]::Max(0,[Math]::Min(255,[int](($c.G - 255*(1-$k)) / $k)))
        $b = [Math]::Max(0,[Math]::Min(255,[int](($c.B - 255*(1-$k)) / $k)))
        # Black "Automotive" would vanish on the dark app background, so neutral ink becomes white.
        if ($r - [Math]::Min($g,$b) -lt 70) { $r=243; $g=246; $b=252 }
    }
    $rgba[$i]=$r; $rgba[$i+1]=$g; $rgba[$i+2]=$b; $rgba[$i+3]=$a
    $bitmap.SetPixel($x,$y,[Drawing.Color]::FromArgb($a,$r,$g,$b))
} }
$bitmap.Save((Join-Path $dest 'balkan-logo.png'),[Drawing.Imaging.ImageFormat]::Png)
[IO.File]::WriteAllBytes((Join-Path $dest 'balkan-logo.rgba'),$rgba)
$json=@{width=$Width;height=$height;format='unpremultiplied RGBA8';source="User-supplied Balkan Automotive logo ($($source.Width)x$($source.Height) JPEG), white keyed to alpha, black ink recoloured white"} | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $dest 'balkan-logo.json'),$json,(New-Object Text.UTF8Encoding $false))
$graphics.Dispose(); $bitmap.Dispose(); $source.Dispose()
Write-Output "Imported logo crop $($crop.Width)x$($crop.Height) -> ${Width}x${height}"
