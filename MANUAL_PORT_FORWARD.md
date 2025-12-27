# Manual WSL Port Forwarding (Copy-Paste)

## Quick Setup (Copy All and Paste)

**Open PowerShell as Administrator** and paste this entire block:

```powershell
# Get WSL IP
$wslIp = (wsl hostname -I).Trim()
Write-Host "WSL IP: $wslIp" -ForegroundColor Cyan

# Remove existing rule
Write-Host "Removing existing rule..." -ForegroundColor Yellow
netsh interface portproxy delete v4tov4 listenport=3001 listenaddress=0.0.0.0 2>$null

# Add port forwarding
Write-Host "Adding port forwarding..." -ForegroundColor Yellow
netsh interface portproxy add v4tov4 listenport=3001 listenaddress=0.0.0.0 connectport=3001 connectaddress=$wslIp

# Allow firewall
Write-Host "Setting up firewall..." -ForegroundColor Yellow
$firewallRule = Get-NetFirewallRule -DisplayName "WSL Backend Port 3001" -ErrorAction SilentlyContinue
if (-not $firewallRule) {
    New-NetFirewallRule -DisplayName "WSL Backend Port 3001" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow | Out-Null
    Write-Host "Firewall rule created" -ForegroundColor Green
}

# Show result
Write-Host ""
Write-Host "Port forwarding set up!" -ForegroundColor Green
Write-Host "Windows:3001 -> WSL($wslIp):3001" -ForegroundColor Cyan
Write-Host ""
netsh interface portproxy show all
```

## Step-by-Step (If You Prefer)

### Step 1: Get WSL IP
```powershell
wsl hostname -I
```
Copy the IP address (e.g., `172.18.12.236`)

### Step 2: Remove Old Rule (if exists)
```powershell
netsh interface portproxy delete v4tov4 listenport=3001 listenaddress=0.0.0.0
```

### Step 3: Add Port Forwarding
```powershell
# Replace 172.18.12.236 with your WSL IP from Step 1
netsh interface portproxy add v4tov4 listenport=3001 listenaddress=0.0.0.0 connectport=3001 connectaddress=172.18.12.236
```

### Step 4: Allow Firewall
```powershell
New-NetFirewallRule -DisplayName "WSL Backend Port 3001" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
```

### Step 5: Verify
```powershell
netsh interface portproxy show all
```

## Test

1. **Backend running in WSL:**
   ```bash
   cd backend
   npm run dev
   ```

2. **Test from Windows:**
   ```powershell
   curl http://localhost:3001/api/health
   ```

3. **Test from phone:**
   Open browser: `http://192.168.29.233:3001/api/health`

## If It Doesn't Work

1. **Check WSL is running:**
   ```powershell
   wsl hostname -I
   ```

2. **Verify backend is running:**
   ```bash
   # In WSL
   curl http://localhost:3001/api/health
   ```

3. **Check port forwarding:**
   ```powershell
   netsh interface portproxy show all
   ```

4. **Check firewall:**
   ```powershell
   Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*3001*"}
   ```

