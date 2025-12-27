# Quick WSL Port Forwarding Setup

## 3 Steps to Make WSL Backend Accessible

### Step 1: Run Port Forwarding Script

**Open Windows PowerShell as Administrator:**
- Right-click PowerShell
- Select "Run as Administrator"

**Run the script:**
```powershell
cd C:\Users\User\Documents\app
.\setup-wsl-port-forward.ps1
```

This will:
- Get WSL IP automatically
- Set up port forwarding (Windows:3001 -> WSL:3001)
- Configure firewall

### Step 2: Find Windows IP

```powershell
ipconfig
```

Look for IPv4 Address under "Wireless LAN adapter Wi-Fi" (e.g., `192.168.29.233`)

### Step 3: Update Mobile API URL

Update `mobile/src/lib/api.ts`:
```typescript
return 'http://192.168.29.233:3001/api'; // Windows IP (forwards to WSL)
```

## Test

1. **Backend running in WSL:** `cd backend && npm run dev`
2. **Open phone browser:** `http://192.168.29.233:3001/api/health`
3. **Should work!** ✅

## How It Works

```
Phone → Windows IP:3001 → (port forward) → WSL IP:3001 → Backend
```

## If WSL IP Changes

WSL IP might change after restart. Just run the script again:
```powershell
.\setup-wsl-port-forward.ps1
```

## Manual Setup (If Script Doesn't Work)

**In PowerShell as Administrator:**
```powershell
# Get WSL IP
wsl hostname -I

# Forward port (replace with your WSL IP)
netsh interface portproxy add v4tov4 listenport=3001 listenaddress=0.0.0.0 connectport=3001 connectaddress=172.18.12.236

# Allow firewall
New-NetFirewallRule -DisplayName "WSL Backend" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
```

