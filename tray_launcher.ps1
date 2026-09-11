Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptDir

# Check if port 3000 is already in use
$portCheck = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($portCheck) {
    # If the server is already running, notify and offer to open the standalone app window
    $result = [System.Windows.Forms.MessageBox]::Show("Port 3000 is already in use. The LlamaLaunch server might already be running.`n`nWould you like to open LlamaLaunch?", "LlamaLaunch Tray", [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Question)
    if ($result -eq [System.Windows.Forms.DialogResult]::Yes) {
        Start-Process "msedge" -ArgumentList "--app=http://localhost:3000"
    }
    Exit
}

# Spawn LlamaLaunch server in a hidden window
$processInfo = New-Object System.Diagnostics.ProcessStartInfo
$exePath = Join-Path $scriptDir "LlamaLaunch_prod.exe"
if (-not (Test-Path $exePath)) {
    $exePath = Join-Path $scriptDir "LlamaLaunch.exe"
}
if (Test-Path $exePath) {
    $processInfo.FileName = $exePath
    $processInfo.Arguments = ""
} else {
    $processInfo.FileName = "node"
    $processInfo.Arguments = "server.js"
}
$processInfo.WorkingDirectory = $scriptDir
$processInfo.CreateNoWindow = $true
$processInfo.UseShellExecute = $false

$global:process = $null
try {
    $global:process = [System.Diagnostics.Process]::Start($processInfo)
} catch {
    [System.Windows.Forms.MessageBox]::Show("Failed to start the LlamaLaunch server. Please ensure Node.js is installed or LlamaLaunch.exe exists in the current directory.", "LlamaLaunch Tray Error", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error)
    Exit
}

# Create the tray icon
$trayIcon = New-Object System.Windows.Forms.NotifyIcon

# Load favicon from file if it exists, otherwise fall back to custom drawn icon
$faviconPath = Join-Path $scriptDir "favicon.png"
if (-not (Test-Path $faviconPath)) {
    $faviconPath = Join-Path $scriptDir "frontend\public\favicon.png"
}
$loadedIcon = $null

if (Test-Path $faviconPath) {
    try {
        $img = [System.Drawing.Image]::FromFile($faviconPath)
        # Create a 16x16 bitmap to make sure it scales nicely for the system tray
        $bmp = New-Object System.Drawing.Bitmap 16, 16
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.DrawImage($img, 0, 0, 16, 16)
        
        $iconHandle = $bmp.GetHicon()
        $loadedIcon = [System.Drawing.Icon]::FromHandle($iconHandle)
        
        $g.Dispose()
        # Note: Do not dispose $bmp immediately as the Icon handle is linked to its bitmap resources
    } catch {
        # Fallback to custom drawn below
    }
}

if ($loadedIcon) {
    $trayIcon.Icon = $loadedIcon
} else {
    # Draw a custom fallback tray icon (Green circle with a white 'L')
    $bmp = New-Object System.Drawing.Bitmap 16, 16
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    # Draw circle
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(46, 204, 113)) # Emerald Green
    $g.FillEllipse($brush, 0, 0, 15, 15)

    # Draw letter 'L'
    $font = New-Object System.Drawing.Font("Arial", 8, [System.Drawing.FontStyle]::Bold)
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    # Draw string centered slightly
    $g.DrawString("L", $font, $textBrush, 3, 1)

    $iconHandle = $bmp.GetHicon()
    $trayIcon.Icon = [System.Drawing.Icon]::FromHandle($iconHandle)
}
$trayIcon.Text = "LlamaLaunch Server"
$trayIcon.Visible = $true

# Define context menu
$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip

$menuOpen = New-Object System.Windows.Forms.ToolStripMenuItem("Open Web UI")
$menuOpen.Add_Click({
    Start-Process "msedge" -ArgumentList "--app=http://localhost:3000"
})

$menuRestart = New-Object System.Windows.Forms.ToolStripMenuItem("Restart Server")
$menuRestart.Add_Click({
    Stop-Server
    Start-Sleep -Seconds 1
    $global:process = [System.Diagnostics.Process]::Start($processInfo)
    $trayIcon.ShowBalloonTip(2000, "LlamaLaunch restarted", "The server process was successfully restarted.", [System.Windows.Forms.ToolTipIcon]::Info)
})

$menuSeparator = New-Object System.Windows.Forms.ToolStripSeparator

$menuExit = New-Object System.Windows.Forms.ToolStripMenuItem("Exit")
$menuExit.Add_Click({
    Stop-Server
    $trayIcon.Visible = $false
    [System.Windows.Forms.Application]::Exit()
})

$contextMenu.Items.AddRange(@($menuOpen, $menuRestart, $menuSeparator, $menuExit))
$trayIcon.ContextMenuStrip = $contextMenu

# Double click opens the web UI
$trayIcon.Add_DoubleClick({
    Start-Process "msedge" -ArgumentList "--app=http://localhost:3000"
})

# Show balloon tip on start
$trayIcon.ShowBalloonTip(3000, "LlamaLaunch Started", "Server is running in the system tray. Double-click to open Web UI.", [System.Windows.Forms.ToolTipIcon]::Info)

# Clean up helper
function Stop-Server {
    if ($global:process -and -not $global:process.HasExited) {
        $pidToKill = $global:process.Id
        Start-Process -FilePath "taskkill" -ArgumentList "/pid $pidToKill /T /F" -NoNewWindow -Wait -ErrorAction SilentlyContinue
    }
    # Double check and clean up any dangling llama-servers
    Start-Process -FilePath "taskkill" -ArgumentList "/IM llama-server.exe /T /F" -NoNewWindow -Wait -ErrorAction SilentlyContinue
}

# Hook process exit events to ensure we clean up if the script is terminated
[System.AppDomain]::CurrentDomain.add_ProcessExit({
    Stop-Server
})

# Run application message loop
[System.Windows.Forms.Application]::Run()
