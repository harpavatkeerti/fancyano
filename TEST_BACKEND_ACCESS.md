# Test Backend Network Access

## Quick Test Commands

### Test 1: From Computer (Should Work)
```bash
# In WSL
curl http://localhost:3001/api/health

# Or in PowerShell
curl http://localhost:3001/api/health
```

**Expected:** JSON response with `{"status":"ok",...}`

### Test 2: From Computer Using Windows IP
```powershell
# In PowerShell, replace with your Windows IP
curl http://192.168.1.100:3001/api/health
```

**If this works:** Backend is accessible, just need correct IP in mobile app.
**If this doesn't work:** Firewall or network configuration issue.

### Test 3: From Phone Browser
1. Find your Windows IP (see FIND_CORRECT_IP.md)
2. Open phone browser
3. Go to: `http://YOUR_WINDOWS_IP:3001/api/health`

**Expected:** JSON response
**If not working:** Firewall blocking or wrong IP

## Fix Firewall

### Windows Firewall Settings

1. **Open Windows Defender Firewall**
2. **Click "Allow an app through firewall"**
3. **Find Node.js** and check both Private and Public
4. **Or create new rule:**
   - Inbound rule
   - Port 3001
   - Allow connection

### Quick Test: Temporarily Disable Firewall

1. Open Windows Defender Firewall
2. Turn off firewall temporarily
3. Test from phone
4. If it works, firewall was the issue
5. Re-enable and add proper rule

## Verify Backend Configuration

Check `backend/src/server.js` line 31:
```javascript
app.listen(PORT, '0.0.0.0', () => {  // Must be '0.0.0.0'
```

This makes backend listen on all network interfaces, not just localhost.

## Still Not Working? Use Tunnel Mode

```bash
cd mobile
expo start --tunnel
```

Tunnel mode bypasses all network/firewall issues!

