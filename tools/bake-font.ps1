$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$dest = Join-Path $PSScriptRoot '../apps/bishal_garage/package/artwork'
New-Item -ItemType Directory -Force $dest | Out-Null
$bitmap = New-Object Drawing.Bitmap 1024,512
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([Drawing.Color]::Transparent)
$graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$font = New-Object Drawing.Font 'Bahnschrift SemiCondensed',48,([Drawing.FontStyle]::Regular),([Drawing.GraphicsUnit]::Pixel)
$numericFont = New-Object Drawing.Font 'Bahnschrift SemiBold',48,([Drawing.FontStyle]::Regular),([Drawing.GraphicsUnit]::Pixel)
$baseline = 48 * $font.FontFamily.GetCellAscent($font.Style) / $font.FontFamily.GetEmHeight($font.Style)
$numericBaseline = 48 * $numericFont.FontFamily.GetCellAscent($numericFont.Style) / $numericFont.FontFamily.GetEmHeight($numericFont.Style)
$format = [Drawing.StringFormat]::GenericTypographic
$format.FormatFlags = $format.FormatFlags -bor [Drawing.StringFormatFlags]::MeasureTrailingSpaces
$glyphs = New-Object 'System.Collections.Generic.Dictionary[string,object]' ([StringComparer]::Ordinal)
$codes = @(32..126) + @(176)
for ($i = 0; $i -lt $codes.Length; $i++) {
    $x = ($i % 16) * 64
    $y = [Math]::Floor($i / 16) * 80
    $text = [string][char]$codes[$i]
    $numeric = $codes[$i] -ge 48 -and $codes[$i] -le 57
    $face = if ($numeric) { $numericFont } else { $font }
    $dy = if ($numeric) { $baseline - $numericBaseline } else { 0 }
    $size = $graphics.MeasureString($text,$face,100,$format)
    $graphics.DrawString($text,$face,[Drawing.Brushes]::White,[single]$x,[single]($y + $dy),$format)
    $glyphs[$text] = @{x=$x;y=$y;w=[Math]::Min(63,[Math]::Ceiling($size.Width)+3);h=76;advance=[Math]::Ceiling($size.Width)}
}
$digitAdvance = 0
foreach ($digit in '0123456789'.ToCharArray()) { $digitAdvance = [Math]::Max($digitAdvance, $glyphs[[string]$digit].advance) }
foreach ($digit in '0123456789'.ToCharArray()) { $glyphs[[string]$digit].advance = $digitAdvance }
$bitmap.Save((Join-Path $dest 'font.png'),[Drawing.Imaging.ImageFormat]::Png)
$alpha = New-Object byte[] (1024*512)
for ($y = 0; $y -lt 512; $y++) {
    for ($x = 0; $x -lt 1024; $x++) { $alpha[$y*1024+$x] = $bitmap.GetPixel($x,$y).A }
}
[IO.File]::WriteAllBytes((Join-Path $dest 'font.alpha'),$alpha)
$json = @{width=1024;height=512;size=48;family=$font.FontFamily.Name;numeralFamily=$numericFont.FontFamily.Name;numerals='tabular';glyphs=$glyphs} | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText((Join-Path $dest 'font.json'),$json,(New-Object Text.UTF8Encoding $false))
$numericFont.Dispose(); $font.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
Write-Output 'Baked Bahnschrift SemiCondensed labels and baseline-aligned Bahnschrift SemiBold tabular numerals at 48px; no font program copied.'
