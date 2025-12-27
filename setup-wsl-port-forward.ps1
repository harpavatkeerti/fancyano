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

# Remove existing rule if any
Write-Host "Removing existing port forwarding rule..." -ForegroundColor Yellow
netsh interface portproxy delete v4tov4 listenport=3001 listenaddress=0.0.0.0 2>$null

# Add new port forwarding rule
Write-Host "Adding port forwarding rule..." -ForegroundColor Yellow
netsh interface portproxy add v4tov4 listenport=3001 listenaddress=0.0.0.0 connectport=3001 connectaddress=$wslIp

if ($LASTEXITCODE -eq 0) {
    Write-Host "Port forwarding set up successfully!" -ForegroundColor Green
    Write-Host "Windows:3001 -> WSL($wslIp):3001" -ForegroundColor Cyan
} else {
    Write-Host "Error setting up port forwarding" -ForegroundColor Red
    exit 1
}

# Set up firewall rule
Write-Host "Setting up firewall rule..." -ForegroundColor Yellow
$firewallRule = Get-NetFirewallRule -DisplayName "WSL Backend Port 3001" -ErrorAction SilentlyContinue
if (-not $firewallRule) {
    New-NetFirewallRule -DisplayName "WSL Backend Port 3001" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow | Out-Null
    Write-Host "Firewall rule created" -ForegroundColor Green
} else {
    Write-Host "Firewall rule already exists" -ForegroundColor Cyan
}

# Show current rules
Write-Host ""
Write-Host "Current port forwarding rules:" -ForegroundColor Yellow
netsh interface portproxy show all

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host "Backend in WSL is now accessible via Windows IP on port 3001" -ForegroundColor Cyan

