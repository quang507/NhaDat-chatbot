# Nén / thu nhỏ ảnh về tối đa 2560px (cạnh dài), GIỮ NGUYÊN tỉ lệ, ghi đè tên cũ.
# Chỉ thu nhỏ nếu ảnh lớn hơn 2K; ảnh nhỏ hơn -> để nguyên. Giữ trong suốt cho PNG.
# Dùng System.Drawing có sẵn trong Windows PowerShell 5.1 — không cần cài gì.
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Files)

Add-Type -AssemblyName System.Drawing
$MAX = 2560   # cạnh dài tối đa (2K). Muốn 2048 thì đổi số này.
$JPEG_QUALITY = 88

foreach ($f in $Files) {
  try {
    if ([string]::IsNullOrWhiteSpace($f) -or -not (Test-Path -LiteralPath $f)) { continue }
    $ext = [IO.Path]::GetExtension($f).ToLower()
    if ($ext -notin '.jpg', '.jpeg', '.png', '.bmp', '.gif', '.tif', '.tiff') { continue }

    # Đọc qua bộ nhớ để KHÔNG khoá file (cho phép ghi đè ngay sau đó)
    $bytes = [IO.File]::ReadAllBytes($f)
    $ms = New-Object IO.MemoryStream(, $bytes)
    $img = [System.Drawing.Image]::FromStream($ms)

    $w = $img.Width; $h = $img.Height
    $long = [Math]::Max($w, $h)
    if ($long -le $MAX) { $img.Dispose(); $ms.Dispose(); continue }  # đã đủ nhỏ

    $scale = $MAX / [double]$long
    $nw = [int][Math]::Round($w * $scale)
    $nh = [int][Math]::Round($h * $scale)

    $bmp = New-Object System.Drawing.Bitmap($nw, $nh, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($img, 0, 0, $nw, $nh)
    $g.Dispose(); $img.Dispose(); $ms.Dispose()

    if ($ext -eq '.jpg' -or $ext -eq '.jpeg') {
      $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
      $p = New-Object System.Drawing.Imaging.EncoderParameters(1)
      $p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$JPEG_QUALITY)
      $bmp.Save($f, $enc, $p)
    } elseif ($ext -eq '.png') {
      $bmp.Save($f, [System.Drawing.Imaging.ImageFormat]::Png)   # giữ trong suốt
    } else {
      $bmp.Save($f)
    }
    $bmp.Dispose()
  } catch {
    [System.Windows.Forms.MessageBox]::Show("Loi nen anh: $f`n$($_.Exception.Message)") 2>$null
  }
}
