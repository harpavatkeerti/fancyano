# WSL Port Forwarding Setup Script
# Run this as Administrator: Right-click PowerShell -> "Run as Administrator"
# Or use: powershell -ExecutionPolicy Bypass -File .\setup-wsl-port-forward.ps1
# Or use: .\setup-wsl-port-forward.cmd (batch file, no policy issues)

Write-Host "Setting up WSL port forwarding..." -ForegroundColor Green

# Get WSL IP address
Write-Host "Getting WSL IP address..." -ForegroundColor Yellow
$wslIp = (wsl hostname -I).Trim()

if (-not $wslIp) {
    Write-Host "Error: Could not get WSL IP address. Make sure WSL is running." -ForegroundColor Red
    exit 1
}

Write-Host "WSL IP: $wslIp" -ForegroundColor Cyan

# Remove existing rules if any
Write-Host "Removing existing port forwarding rules..." -ForegroundColor Yellow
netsh interface portproxy delete v4tov4 listenport=3001 listenaddress=0.0.0.0 2>$null
netsh interface portproxy delete v4tov4 listenport=8081 listenaddress=0.0.0.0 2>$null

# Add port forwarding rules
Write-Host "Adding port forwarding rules..." -ForegroundColor Yellow

# Port 3001 for backend API
netsh interface portproxy add v4tov4 listenport=3001 listenaddress=0.0.0.0 connectport=3001 connectaddress=$wslIp
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error setting up port forwarding for 3001" -ForegroundColor Red
    exit 1
}

# Port 8081 for Metro bundler (Expo dev server)
netsh interface portproxy add v4tov4 listenport=8081 listenaddress=0.0.0.0 connectport=8081 connectaddress=$wslIp
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error setting up port forwarding for 8081" -ForegroundColor Red
    exit 1
}

Write-Host "Port forwarding set up successfully!" -ForegroundColor Green
Write-Host "Windows:3001 -> WSL($wslIp):3001 (Backend API)" -ForegroundColor Cyan
Write-Host "Windows:8081 -> WSL($wslIp):8081 (Metro Bundler)" -ForegroundColor Cyan

# Set up firewall rules
Write-Host "Setting up firewall rules..." -ForegroundColor Yellow

# Firewall rule for port 3001
$firewallRule3001 = netsh advfirewall firewall show rule name="WSL Backend Port 3001" 2>$null
if (-not $firewallRule3001) {
    netsh advfirewall firewall add rule name="WSL Backend Port 3001" dir=in action=allow protocol=TCP localport=3001 profile=private,public | Out-Null
    Write-Host "Firewall rule created for port 3001" -ForegroundColor Green
} else {
    Write-Host "Firewall rule already exists for port 3001" -ForegroundColor Cyan
}

# Firewall rule for port 8081
$firewallRule8081 = netsh advfirewall firewall show rule name="WSL Metro Port 8081" 2>$null
if (-not $firewallRule8081) {
    netsh advfirewall firewall add rule name="WSL Metro Port 8081" dir=in action=allow protocol=TCP localport=8081 profile=private,public | Out-Null
    Write-Host "Firewall rule created for port 8081" -ForegroundColor Green
} else {
    Write-Host "Firewall rule already exists for port 8081" -ForegroundColor Cyan
}

# Show current rules
Write-Host ""
Write-Host "Current port forwarding rules:" -ForegroundColor Yellow
netsh interface portproxy show all

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host "Backend in WSL is now accessible via Windows IP on port 3001" -ForegroundColor Cyan

