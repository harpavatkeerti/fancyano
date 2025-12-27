# Complete WSL Backend Setup Guide

## Overview

Keep everything in WSL, but make it accessible from phone via Windows network using port forwarding.

## Architecture

```
┌─────────────────────────────────────────┐
│  Phone (192.168.29.x)                   │
│  Connects to Windows Network            │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│  Windows (192.168.29.233)               │
│  Port Forwarding: 3001 → WSL:3001       │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│  WSL (172.18.12.236)                    │
│  Backend running on port 3001           │
│  PostgreSQL database                     │
└─────────────────────────────────────────┘
```

## Setup Steps

### 1. Set Up Port Forwarding

**Run as Administrator:**
```powershell
cd C:\Users\User\Documents\app
.\setup-wsl-port-forward.ps1
```

Or manually:
```powershell
# Get WSL IP
$wslIp = (wsl hostname -I).Trim()

# Forward port
netsh interface portproxy add v4tov4 listenport=3001 listenaddress=0.0.0.0 connectport=3001 connectaddress=$wslIp

# Allow firewall
New-NetFirewallRule -DisplayName "WSL Backend Port 3001" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
```

### 2. Verify Backend in WSL

**In WSL:**
```bash
cd backend
npm run dev
```

Should see:
```
Server is running on http://localhost:3001
```

### 3. Test from Windows

**In PowerShell:**
```powershell
curl http://localhost:3001/api/health
```

Should return JSON. If this works, port forwarding is set up correctly.

### 4. Find Windows IP

```powershell
ipconfig
# Look for IPv4 Address under "Wireless LAN adapter Wi-Fi"
```

### 5. Update Mobile API URL

Update `mobile/src/lib/api.ts`:
```typescript
return 'http://192.168.29.233:3001/api'; // Your Windows IP
```

### 6. Test from Phone

1. Open phone browser
2. Go to: `http://192.168.29.233:3001/api/health`
3. Should see JSON response!

## Verify Port Forwarding

**Check if rule exists:**
```powershell
netsh interface portproxy show all
```

**Should show:**
```
Listen on ipv4:             Connect to ipv4:
Address         Port        Address         Port
--------------- ----------  --------------- ----------
0.0.0.0         3001        172.18.12.236   3001
```

## If WSL IP Changes

WSL IP might change after restart. Run the setup script again:
```powershell
.\setup-wsl-port-forward.ps1
```

Or update manually:
```powershell
# Get new WSL IP
$wslIp = (wsl hostname -I).Trim()

# Remove old rule
netsh interface portproxy delete v4tov4 listenport=3001 listenaddress=0.0.0.0

# Add new rule
netsh interface portproxy add v4tov4 listenport=3001 listenaddress=0.0.0.0 connectport=3001 connectaddress=$wslIp
```

## Troubleshooting

### Port Forwarding Not Working

1. **Check WSL is running:**
   ```bash
   wsl hostname -I
   ```

2. **Verify backend is running in WSL:**
   ```bash
   # In WSL
   curl http://localhost:3001/api/health
   ```

3. **Test from Windows:**
   ```powershell
   curl http://localhost:3001/api/health
   ```
   If this doesn't work, port forwarding isn't set up correctly.

4. **Check firewall:**
   ```powershell
   Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*3001*"}
   ```

### Remove Port Forwarding

```powershell
netsh interface portproxy delete v4tov4 listenport=3001 listenaddress=0.0.0.0
```

## Benefits

- ✅ Everything stays in WSL
- ✅ Backend accessible from phone
- ✅ No need to run backend on Windows
- ✅ Consistent development environment

## Workflow

1. **Start WSL**
2. **Run port forwarding script** (if WSL IP changed)
3. **Start backend in WSL:** `cd backend && npm run dev`
4. **Start mobile app:** `cd mobile && expo start`
5. **Use Windows IP in mobile app**

Everything works! 🎉

