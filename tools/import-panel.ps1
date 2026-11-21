param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$dest = Join-Path $PSScriptRoot '../apps/bishal_garage/package/artwork'
New-Item -ItemType Directory -Force $dest | Out-Null
$source = [Drawing.Image]::FromFile((Resolve-Path $Path))
# Crop the black margin around the faceted M panel, then fit the renderer's 1024px image limit.
$crop = New-Object Drawing.Rectangle 40,40,($source.Width - 80),($source.Height - 80)
$width = 1024
$height = [int][Math]::Round($crop.Height * $width / $crop.Width)
$bitmap = New-Object Drawing.Bitmap $width,$height
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceCopy
$graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.DrawImage($source,(New-Object Drawing.Rectangle 0,0,$width,$height),$crop,[Drawing.GraphicsUnit]::Pixel)
$rgba = New-Object byte[] ($width*$height*4)
for ($y=0; $y -lt $height; $y++) {
    for ($x=0; $x -lt $width; $x++) {
        $c=$bitmap.GetPixel($x,$y); $i=($y*$width+$x)*4
        # Pure black background becomes transparent so the panel floats on the app backdrop.
        $a=[Math]::Min(255,[Math]::Max($c.R,[Math]::Max($c.G,$c.B))*6)
        $rgba[$i]=$c.R; $rgba[$i+1]=$c.G; $rgba[$i+2]=$c.B; $rgba[$i+3]=$a
        $bitmap.SetPixel($x,$y,[Drawing.Color]::FromArgb($a,$c.R,$c.G,$c.B))
    }
}
$bitmap.Save((Join-Path $dest 'm-panel.png'),[Drawing.Imaging.ImageFormat]::Png)
[IO.File]::WriteAllBytes((Join-Path $dest 'm-panel.rgba'),$rgba)
$json=@{width=$width;height=$height;format='unpremultiplied RGBA8';source='User-supplied export from the Figma Community file "BMW iDrive 8 fully customizable" (bg.png), black background keyed to alpha'} | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $dest 'm-panel.json'),$json,(New-Object Text.UTF8Encoding $false))
$graphics.Dispose(); $bitmap.Dispose(); $source.Dispose()
Write-Output "Imported M panel at ${width}x${height} with keyed alpha."
