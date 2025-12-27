# Fix: Backend Not Accessible from Phone

## The Problem

If `http://172.18.12.236:3001/api/health` doesn't open on phone, the backend isn't accessible from your network.

## Common Causes

### 1. Wrong IP Address (Most Likely!)

`172.18.12.236` might be WSL's internal IP, not your Windows network IP.

**WSL IP vs Windows IP:**
- WSL has its own IP (like 172.18.x.x) - **NOT accessible from phone**
- Windows has a different IP on your WiFi network (like 192.168.x.x) - **This is what you need**

### 2. Backend Not Listening on Network Interface

Backend might only be listening on localhost.

### 3. Firewall Blocking

Windows Firewall might be blocking port 3001.

## Step-by-Step Fix

### Step 1: Find Your Windows IP Address

**In Windows PowerShell (NOT WSL):**
```powershell
ipconfig
```

Look for your **WiFi adapter** (not WSL adapter):
```
Wireless LAN adapter Wi-Fi:
   IPv4 Address. . . . . . . . . . . : 192.168.1.100  ← Use this one!
```

**Common IP ranges:**
- `192.168.x.x` - Home WiFi
- `10.0.x.x` - Some networks
- `172.18.x.x` - Usually WSL (NOT what you want)

### Step 2: Update API URL with Windows IP

Update `mobile/src/lib/api.ts`:
```typescript
return 'http://192.168.1.100:3001/api'; // Use Windows IP, not WSL IP
```

Replace `192.168.1.100` with your actual Windows IP from Step 1.

### Step 3: Verify Backend is Listening Correctly

Check `backend/src/server.js` - it should have:
```javascript
app.listen(PORT, '0.0.0.0', () => {  // Must be '0.0.0.0'
```

This makes backend listen on all network interfaces.

### Step 4: Test from Computer First

**From Windows PowerShell:**
```powershell
# Test with Windows IP
curl http://192.168.1.100:3001/api/health
```

If this works, backend is accessible. If not, check firewall.

### Step 5: Allow Firewall Access

**Option A: Allow Node.js through Firewall**
1. Open Windows Defender Firewall
2. Click "Allow an app through firewall"
3. Find Node.js and check both Private and Public
4. Or add new rule for port 3001

**Option B: Temporarily Disable Firewall (for testing)**
1. Open Windows Defender Firewall
2. Turn off firewall temporarily
3. Test if backend is accessible
4. Re-enable after testing

### Step 6: Test from Phone

After fixing IP and firewall:
1. Open phone browser
2. Go to: `http://YOUR_WINDOWS_IP:3001/api/health`
3. Should see: `{"status":"ok",...}`

## Quick Diagnostic

### Test 1: Check if Backend is Running
```bash
# In WSL or PowerShell
curl http://localhost:3001/api/health
```
Should work from computer.

### Test 2: Check What Backend is Listening On
```bash
# In WSL
netstat -tlnp | grep 3001
# Should show: 0.0.0.0:3001 (not 127.0.0.1:3001)
```

### Test 3: Find Correct IP
```powershell
# In Windows PowerShell
ipconfig | findstr IPv4
# Use the IP under your WiFi adapter
```

## Alternative: Use Tunnel Mode (Bypasses Network Issues)

If network access is too complicated, use Expo tunnel:

```bash
cd mobile
expo start --tunnel
```

Tunnel mode:
- ✅ Works even if devices aren't on same network
- ✅ Bypasses firewall issues
- ✅ No IP configuration needed
- ⚠️ Slightly slower (goes through Expo servers)

## Summary

1. **Find Windows IP** (not WSL IP) using `ipconfig` in PowerShell
2. **Update API URL** in `mobile/src/lib/api.ts` with Windows IP
3. **Check firewall** - allow Node.js or port 3001
4. **Test from phone browser** - should work now
5. **Or use tunnel mode** - `expo start --tunnel` (easier!)

