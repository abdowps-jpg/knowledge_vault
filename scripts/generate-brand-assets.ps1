Add-Type -AssemblyName System.Drawing

function New-Bitmap([int]$w, [int]$h) {
  return New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
}

function Save-Png($bmp, [string]$path) {
  $dir = Split-Path -Parent $path
  if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

function Draw-RoundedRect($g, $brush, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $g.FillPath($brush, $path)
  $path.Dispose()
}

function Draw-VaultMark($g, [float]$size, [bool]$mono=$false) {
  $teal = [System.Drawing.ColorTranslator]::FromHtml('#0a7ea4')
  $bg = [System.Drawing.SolidBrush]::new($teal)
  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $dark = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(20,45,61))

  $pad = $size * 0.13
  $bodyX = $pad
  $bodyY = $pad
  $bodyW = $size - 2*$pad
  $bodyH = $size - 2*$pad

  if (-not $mono) {
    Draw-RoundedRect $g $bg $bodyX $bodyY $bodyW $bodyH ($size*0.18)
  }

  if ($mono) { $innerBrush = $dark } else { $innerBrush = $white }

  $pageW = $bodyW * 0.27
  $pageH = $bodyH * 0.48
  $pageY = $bodyY + $bodyH*0.22
  $leftX = $bodyX + $bodyW*0.20
  $rightX = $bodyX + $bodyW*0.53
  Draw-RoundedRect $g $innerBrush $leftX $pageY $pageW $pageH ($size*0.04)
  Draw-RoundedRect $g $innerBrush $rightX $pageY $pageW $pageH ($size*0.04)

  if ($mono) { $spineColor = [System.Drawing.Color]::FromArgb(20,45,61) } else { $spineColor = [System.Drawing.Color]::FromArgb(10,126,164) }
  $spinePen = New-Object System.Drawing.Pen($spineColor, ($size*0.02))
  $g.DrawLine($spinePen, $bodyX+$bodyW*0.50, $pageY+$size*0.02, $bodyX+$bodyW*0.50, $pageY+$pageH-$size*0.02)
  $spinePen.Dispose()

  if ($mono) { $lockBrush = $dark } else { $lockBrush = $bg }
  $lockR = $size*0.10
  $lockX = $bodyX + $bodyW*0.50 - $lockR
  $lockY = $bodyY + $bodyH*0.63
  $g.FillEllipse($lockBrush, $lockX, $lockY, $lockR*2, $lockR*2)

  $g.FillEllipse($white, $lockX + $lockR*0.68, $lockY + $lockR*0.48, $lockR*0.64, $lockR*0.64)
  $g.FillRectangle($white, $lockX + $lockR*0.91, $lockY + $lockR*0.95, $lockR*0.18, $lockR*0.65)

  $bg.Dispose(); $white.Dispose(); $dark.Dispose()
}

function New-Icon([string]$path, [int]$size) {
  $bmp = New-Bitmap $size $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  Draw-VaultMark $g $size $false
  $g.Dispose()
  Save-Png $bmp $path
}

function New-AndroidBackground([string]$path, [int]$size) {
  $bmp = New-Bitmap $size $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $teal = [System.Drawing.ColorTranslator]::FromHtml('#0a7ea4')
  $deep = [System.Drawing.ColorTranslator]::FromHtml('#075f7a')
  $rect = New-Object System.Drawing.Rectangle(0,0,$size,$size)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $teal, $deep, 45)
  $g.FillRectangle($brush, $rect)
  $ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(45,255,255,255), ($size*0.035))
  $g.DrawEllipse($ringPen, $size*0.1, $size*0.1, $size*0.8, $size*0.8)
  $g.Dispose(); $brush.Dispose(); $ringPen.Dispose()
  Save-Png $bmp $path
}

function New-AndroidForeground([string]$path, [int]$size) {
  $bmp = New-Bitmap $size $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $symbolSize = $size*0.78
  $offset = ($size-$symbolSize)/2
  $g.TranslateTransform($offset, $offset)
  Draw-VaultMark $g $symbolSize $false
  $g.Dispose()
  Save-Png $bmp $path
}

function New-AndroidMonochrome([string]$path, [int]$size) {
  $bmp = New-Bitmap $size $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $symbolSize = $size*0.78
  $offset = ($size-$symbolSize)/2
  $g.TranslateTransform($offset, $offset)
  Draw-VaultMark $g $symbolSize $true
  $g.Dispose()
  Save-Png $bmp $path
}

function New-Splash([string]$path, [int]$size, [bool]$dark=$false) {
  $bmp = New-Bitmap $size $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $logoSize = $size * 0.62
  $offsetX = ($size - $logoSize) / 2
  $offsetY = $size * 0.08
  $g.TranslateTransform($offsetX, $offsetY)
  Draw-VaultMark $g $logoSize $false
  $g.ResetTransform()

  if ($dark) { $textColor = [System.Drawing.Color]::FromArgb(230,240,249) } else { $textColor = [System.Drawing.Color]::FromArgb(16,24,40) }
  $brush = New-Object System.Drawing.SolidBrush($textColor)
  $font = New-Object System.Drawing.Font('Segoe UI', [float]($size*0.07), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $g.DrawString('Knowledge Vault', $font, $brush, $size/2, $size*0.78, $sf)

  $brush.Dispose(); $font.Dispose(); $sf.Dispose(); $g.Dispose()
  Save-Png $bmp $path
}

$base = 'assets/images'
New-Icon "$base/icon.png" 1024
New-Splash "$base/splash-icon.png" 1024 $false
New-Splash "$base/splash-icon-dark.png" 1024 $true
New-AndroidForeground "$base/android-icon-foreground.png" 432
New-AndroidBackground "$base/android-icon-background.png" 432
New-AndroidMonochrome "$base/android-icon-monochrome.png" 432
New-Icon "$base/favicon.png" 64

New-Icon "$base/icon-512.png" 512
New-Icon "$base/icon-256.png" 256
New-Icon "$base/icon-192.png" 192
New-Icon "$base/icon-180.png" 180
New-Icon "$base/icon-152.png" 152

Write-Output 'Generated branding assets successfully.'
