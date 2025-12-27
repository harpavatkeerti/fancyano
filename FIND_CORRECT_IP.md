# How to Find the Correct IP Address

## The Issue

`172.18.12.236` is likely WSL's internal IP, which is NOT accessible from your phone.

You need your **Windows network IP address** (on your WiFi network).

## Step-by-Step

### Step 1: Open Windows PowerShell

**NOT WSL terminal!** Use Windows PowerShell or CMD.

### Step 2: Run ipconfig

```powershell
ipconfig
```

### Step 3: Find Your WiFi Adapter

Look for something like:
```
Wireless LAN adapter Wi-Fi:

   Connection-specific DNS Suffix  . :
   IPv4 Address. . . . . . . . . . . : 192.168.1.100  ← THIS IS YOUR IP!
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 192.168.1.1
```

**Common IP ranges:**
- `192.168.1.x` or `192.168.0.x` - Most home WiFi
- `10.0.0.x` - Some networks
- `172.18.x.x` - Usually WSL (NOT what you want!)

### Step 4: Use This IP in Your Code

Update `mobile/src/lib/api.ts`:
```typescript
return 'http://192.168.1.100:3001/api'; // Replace with your actual IP
```

### Step 5: Test

1. Make sure backend is running
2. Open phone browser
3. Go to: `http://YOUR_IP:3001/api/health`
4. Should see JSON response

## Quick Command to Get IP

**Windows PowerShell:**
```powershell
ipconfig | findstr IPv4
```

This shows all IPv4 addresses. Use the one under "Wireless LAN adapter Wi-Fi".

## Still Not Working?

1. **Check firewall** - Allow Node.js through Windows Firewall
2. **Verify backend is running** - `cd backend && npm run dev`
3. **Check backend listens on 0.0.0.0** - Should be in server.js
4. **Try tunnel mode** - `expo start --tunnel` (bypasses all network issues)

