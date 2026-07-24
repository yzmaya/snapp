# ============================================================
# SNAPP · Impresión de imagen en Windows (determinista, sin GUI)
# Usa System.Drawing.Printing (GDI+), incluido en Windows PowerShell 5.1.
# Reemplaza a "mspaint /pt" para una impresión consistente en la SELPHY.
#
# Uso:
#   powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass `
#     -File print-image.ps1 -ImagePath "C:\ruta\foto.png" -PrinterName "Canon SELPHY CP1500"
# ============================================================
param(
  [Parameter(Mandatory = $true)][string]$ImagePath,
  [Parameter(Mandatory = $true)][string]$PrinterName
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing | Out-Null

$img = $null
$pd = $null
try {
  if (-not (Test-Path -LiteralPath $ImagePath)) {
    throw "No existe la imagen: $ImagePath"
  }

  $img = [System.Drawing.Image]::FromFile($ImagePath)

  $pd = New-Object System.Drawing.Printing.PrintDocument
  $pd.PrinterSettings.PrinterName = $PrinterName
  if (-not $pd.PrinterSettings.IsValid) {
    throw "Impresora no válida: $PrinterName"
  }
  $pd.DocumentName = 'SNAPP'
  # Usar toda la superficie de la postal (sin márgenes).
  $pd.OriginAtMargins = $false

  $onPrintPage = {
    param($sender, $e)
    $page = $e.PageBounds  # tamaño total de la página (incluye borde)
    $iw = $img.Width
    $ih = $img.Height

    # Auto-rotar si la orientación de la imagen no coincide con la de la página,
    # para que la foto llene bien la postal (retrato vs paisaje).
    $imgLandscape = $iw -gt $ih
    $pageLandscape = $page.Width -gt $page.Height
    if ($imgLandscape -ne $pageLandscape) {
      $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone)
      $iw = $img.Width
      $ih = $img.Height
    }

    # Escalar preservando proporción (fit), centrado.
    $scale = [Math]::Min($page.Width / $iw, $page.Height / $ih)
    $w = [int]($iw * $scale)
    $h = [int]($ih * $scale)
    $x = $page.X + [int](($page.Width - $w) / 2)
    $y = $page.Y + [int](($page.Height - $h) / 2)

    $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $e.Graphics.DrawImage($img, (New-Object System.Drawing.Rectangle $x, $y, $w, $h))
  }

  $pd.add_PrintPage($onPrintPage)
  $pd.Print()

  Write-Output "OK: enviado a $PrinterName"
}
catch {
  Write-Error $_.Exception.Message
  exit 1
}
finally {
  if ($pd) { $pd.Dispose() }
  if ($img) { $img.Dispose() }
}
