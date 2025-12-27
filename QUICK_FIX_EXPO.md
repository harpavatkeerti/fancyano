# Quick Fix: Expo Go Not Opening

## ⚠️ Issue Found: Missing Port Number!

Your API URL is missing the port `:3001`:

**Current (WRONG):**
```
http://172.18.12.236/api
```

**Should be:**
```
http://172.18.12.236:3001/api
```

## Quick Fixes

### Fix 1: Add Port to API URL

Update `mobile/src/lib/api.ts` line 19:
```typescript
return 'http://172.18.12.236:3001/api'; // Add :3001
```

### Fix 2: Test Backend from Phone

Open browser on your phone and go to:
```
http://172.18.12.236:3001/api/health
```

**If this doesn't work:**
- Backend isn't accessible from network
- Check firewall settings
- Make sure backend listens on `0.0.0.0` not just `localhost`

### Fix 3: Use Tunnel Mode (Bypasses Network Issues)

```bash
cd mobile
expo start --tunnel
```

Tunnel mode works even if devices aren't on same network!

### Fix 4: Verify Backend Configuration

Check `backend/src/server.js`:
```javascript
app.listen(PORT, '0.0.0.0', () => {  // Must be 0.0.0.0
  console.log(`Server is running on http://localhost:${PORT}`);
});
```

## Diagnostic Steps

1. **Fix API URL** - Add `:3001` port
2. **Test backend** - Open `http://172.18.12.236:3001/api/health` on phone browser
3. **Try tunnel mode** - `expo start --tunnel`
4. **Check firewall** - Allow Node.js through Windows Firewall

## Most Likely Issue

**Missing port `:3001` in API URL** - This is the most common issue!

Fix it and try again.

