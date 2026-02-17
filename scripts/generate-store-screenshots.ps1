Add-Type -AssemblyName System.Drawing

function New-Shot([string]$path, [int]$w, [int]$h, [string]$title, [string]$subtitle) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $bg1 = [System.Drawing.ColorTranslator]::FromHtml('#0a7ea4')
  $bg2 = [System.Drawing.ColorTranslator]::FromHtml('#084b61')
  $rect = [System.Drawing.Rectangle]::new(0,0,$w,$h)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $bg1, $bg2, 120)
  $g.FillRectangle($brush, $rect)

  $panelBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235,255,255,255))
  $pad = [int]($w * 0.08)
  $panelX = $pad
  $panelY = [int]($h * 0.12)
  $panelW = [int]($w - (2 * $pad))
  $panelH = [int]($h * 0.76)
  $g.FillRectangle($panelBrush, $panelX, $panelY, $panelW, $panelH)

  $titleSize = [float]([Math]::Max(28, [int]($w * 0.04)))
  $subSize = [float]([Math]::Max(20, [int]($w * 0.022)))
  $smallSize = [float]([Math]::Max(14, [int]($w * 0.016)))
  $titleFont = New-Object System.Drawing.Font('Segoe UI', $titleSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $subFont = New-Object System.Drawing.Font('Segoe UI', $subSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $small = New-Object System.Drawing.Font('Segoe UI', $smallSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

  $ink = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(22,35,45))
  $muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(67,87,99))

  $g.DrawString('Knowledge Vault', $titleFont, $ink, [float]($pad*1.2), [float]($h*0.19))
  $g.DrawString($title, $subFont, $ink, [float]($pad*1.2), [float]($h*0.30))
  $g.DrawString($subtitle, $small, $muted, [float]($pad*1.2), [float]($h*0.36))

  $cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255,240,246,249))
  for ($i=0; $i -lt 4; $i++) {
    $cy = [int]($h*0.43 + $i*($h*0.1))
    $g.FillRectangle($cardBrush, [int]($pad*1.2), $cy, [int]($w*0.68), [int]($h*0.075))
  }

  $meta = "${w}x${h}"
  $g.DrawString($meta, $small, $muted, [float]($w-$pad*2.2), [float]($h*0.83))

  $dir = Split-Path -Parent $path
  if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

  $g.Dispose(); $bmp.Dispose(); $brush.Dispose(); $panelBrush.Dispose(); $titleFont.Dispose(); $subFont.Dispose(); $small.Dispose(); $ink.Dispose(); $muted.Dispose(); $cardBrush.Dispose()
}

New-Shot 'docs/app-store/screenshots/ios-6.7/01-inbox.png' 1290 2796 'Inbox' 'Capture notes quickly'
New-Shot 'docs/app-store/screenshots/ios-6.7/02-library.png' 1290 2796 'Library' 'Organized content by tags/categories'
New-Shot 'docs/app-store/screenshots/ios-6.7/03-journal.png' 1290 2796 'Journal' 'Daily reflections with mood tracking'

New-Shot 'docs/app-store/screenshots/ios-12.9/01-inbox.png' 2048 2732 'Inbox' 'iPad productivity workspace'
New-Shot 'docs/app-store/screenshots/ios-12.9/02-tasks.png' 2048 2732 'Tasks' 'Plan and complete priorities'
New-Shot 'docs/app-store/screenshots/ios-12.9/03-search.png' 2048 2732 'Search' 'Find notes fast'

New-Shot 'docs/app-store/screenshots/android-phone/01-inbox.png' 1080 1920 'Inbox' 'Android phone view'
New-Shot 'docs/app-store/screenshots/android-phone/02-library.png' 1080 1920 'Library' 'Knowledge at a glance'

New-Shot 'docs/app-store/screenshots/android-tablet-7/01-tasks.png' 1200 1920 'Tasks' 'Tablet workflow'
New-Shot 'docs/app-store/screenshots/android-tablet-7/02-journal.png' 1200 1920 'Journal' 'Daily writing'

New-Shot 'docs/app-store/screenshots/android-tablet-10/01-library.png' 1600 2560 'Library' 'Large-screen organization'
New-Shot 'docs/app-store/screenshots/android-tablet-10/02-search.png' 1600 2560 'Search' 'Semantic discovery'

Write-Output 'Generated screenshot placeholders.'
