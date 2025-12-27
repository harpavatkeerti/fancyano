# WSL Port Forwarding Setup

## Goal

Forward Windows port 3001 to WSL port 3001, so phone can access WSL backend using Windows IP.

## Step-by-Step Setup

### Step 1: Find WSL IP Address

**In WSL terminal:**
```bash
hostname -I
# Example output: 172.18.12.236
```

Save this IP - you'll need it.

### Step 2: Create Port Forwarding Rule

**Open Windows PowerShell as Administrator:**
```powershell
# Right-click PowerShell -> "Run as Administrator"
```

**Run this command (replace WSL_IP with your actual WSL IP):**
```powershell
netsh interface portproxy add v4tov4 listenport=3001 listenaddress=0.0.0.0 connectport=3001 connectaddress=172.18.12.236
```

**Replace `172.18.12.236` with your WSL IP from Step 1.**

### Step 3: Verify Port Forwarding

**Check if rule was created:**
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

### Step 4: Allow Firewall Rule

**Allow port 3001 through Windows Firewall:**
```powershell
# In PowerShell as Administrator
New-NetFirewallRule -DisplayName "WSL Backend Port 3001" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
```

### Step 5: Find Windows IP Address

**In PowerShell:**
```powershell
ipconfig
```

Look for IPv4 Address under "Wireless LAN adapter Wi-Fi" (e.g., `192.168.29.233`)

### Step 6: Update Mobile API URL

Update `mobile/src/lib/api.ts`:
```typescript
return 'http://192.168.29.233:3001/api'; // Windows IP (forwards to WSL)
```

### Step 7: Test from Phone

1. Make sure backend is running in WSL: `cd backend && npm run dev`
2. Open phone browser
3. Go to: `http://192.168.29.233:3001/api/health`
4. Should work now!

## How It Works

```
Phone (192.168.29.x)
    ↓
Windows Network (192.168.29.233:3001)
    ↓ (port forwarding)
WSL Network (172.18.12.236:3001)
    ↓
Backend running in WSL
```

## Make Port Forwarding Permanent

Port forwarding might reset after WSL restart. Create a script to reapply:

**Create `setup-wsl-port-forward.ps1` in project root:**
```powershell
# Run as Administrator
$wslIp = (wsl hostname -I).Trim()
netsh interface portproxy delete v4tov4 listenport=3001 listenaddress=0.0.0.0
netsh interface portproxy add v4tov4 listenport=3001 listenaddress=0.0.0.0 connectport=3001 connectaddress=$wslIp
Write-Host "Port forwarding set up: 0.0.0.0:3001 -> $wslIp:3001"
```

Run this script whenever WSL IP changes or after restart.

## Troubleshooting

### Port Forwarding Not Working

1. **Check WSL IP hasn't changed:**
   ```bash
   # In WSL
   hostname -I
   ```
   If different, update port forwarding rule.

2. **Verify rule exists:**
   ```powershell
   netsh interface portproxy show all
   ```

3. **Test connection from Windows:**
   ```powershell
   # Should work
   curl http://localhost:3001/api/health
   ```

4. **Check firewall:**
   ```powershell
   Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*3001*"}
   ```

### Remove Port Forwarding

If you need to remove it:
```powershell
netsh interface portproxy delete v4tov4 listenport=3001 listenaddress=0.0.0.0
```

## Alternative: Auto-Forward Script

Create a script that automatically sets up forwarding when WSL starts:

**`setup-wsl-port-forward.ps1`:**
```powershell
# Run as Administrator
$wslIp = (wsl hostname -I).Trim()
if ($wslIp) {
    netsh interface portproxy delete v4tov4 listenport=3001 listenaddress=0.0.0.0 2>$null
    netsh interface portproxy add v4tov4 listenport=3001 listenaddress=0.0.0.0 connectport=3001 connectaddress=$wslIp
    Write-Host "Port forwarding: Windows:3001 -> WSL($wslIp):3001"
} else {
    Write-Host "Error: Could not get WSL IP"
}
```

Run this script whenever you start WSL or after WSL restart.

