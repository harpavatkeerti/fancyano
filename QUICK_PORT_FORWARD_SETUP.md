# Quick WSL Port Forwarding Setup

## Option 1: Use Batch File (No Policy Issues) ✅

**Run as Administrator:**
1. Right-click `setup-wsl-port-forward.cmd`
2. Select "Run as Administrator"
3. Done!

## Option 2: Bypass Policy for PowerShell Script

**Run as Administrator:**
```powershell
powershell -ExecutionPolicy Bypass -File .\setup-wsl-port-forward.ps1
```

## Option 3: Manual Setup (Copy-Paste)

**Open PowerShell as Administrator and run:**

```powershell
# Get WSL IP
$wslIp = (wsl hostname -I).Trim()
Write-Host "WSL IP: $wslIp"

# Remove old rule
netsh interface portproxy delete v4tov4 listenport=3001 listenaddress=0.0.0.0

# Add port forwarding
netsh interface portproxy add v4tov4 listenport=3001 listenaddress=0.0.0.0 connectport=3001 connectaddress=$wslIp

# Allow firewall
New-NetFirewallRule -DisplayName "WSL Backend Port 3001" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow

# Verify
netsh interface portproxy show all
```

## Verify It Worked

```powershell
netsh interface portproxy show all
```

Should show:
```
Listen on ipv4:             Connect to ipv4:
Address         Port        Address         Port
--------------- ----------  --------------- ----------
0.0.0.0         3001        172.18.12.236   3001
```

## Test

1. **Backend running in WSL:** `cd backend && npm run dev`
2. **Test from Windows:** `curl http://localhost:3001/api/health`
3. **Test from phone:** `http://192.168.29.233:3001/api/health`

## Recommended: Use Batch File

Just right-click `setup-wsl-port-forward.cmd` → "Run as Administrator" - no policy issues!

