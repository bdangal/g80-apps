param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$dest = Join-Path $PSScriptRoot '../apps/bishal_garage/package/artwork'
$source = [Drawing.Image]::FromFile((Resolve-Path $Path))
$width = 1024
$height = [int][Math]::Round($source.Height * $width / $source.Width)
$bitmap = New-Object Drawing.Bitmap $width,$height
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceCopy
$graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.DrawImage($source,0,0,$width,$height)
$bitmap.Save((Join-Path $dest 'car.png'),[Drawing.Imaging.ImageFormat]::Png)
$rgba = New-Object byte[] ($width*$height*4)
for ($y=0; $y -lt $height; $y++) {
    for ($x=0; $x -lt $width; $x++) {
        $c=$bitmap.GetPixel($x,$y); $i=($y*$width+$x)*4
        $rgba[$i]=$c.R; $rgba[$i+1]=$c.G; $rgba[$i+2]=$c.B; $rgba[$i+3]=$c.A
    }
}
[IO.File]::WriteAllBytes((Join-Path $dest 'car.rgba'),$rgba)
$json=@{width=$width;height=$height;format='unpremultiplied RGBA8';source='User-provided purple G80 M3 front view'} | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $dest 'car.json'),$json,(New-Object Text.UTF8Encoding $false))
$graphics.Dispose(); $bitmap.Dispose(); $source.Dispose()
Write-Output "Imported user image at ${width}x${height}, preserving transparency."
