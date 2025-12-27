# Quick Fix: Expo Update Error

## The Error
"Failed to download remote update" - Expo is trying to download updates but failing.

## Quick Fix (2 Steps)

### Step 1: Disable Updates in Development

I've updated `mobile/app.json` to disable updates. This is fine for local development.

### Step 2: Clear Cache and Restart

```bash
cd mobile
expo start -c
```

The `-c` flag clears cache and should fix the issue.

## Why This Happens

Expo tries to check for over-the-air (OTA) updates, but:
- Network issues
- Expo servers unreachable
- Cache corruption
- Not needed for local development anyway

## Solution Applied

I've disabled updates in `app.json`:
```json
"updates": {
  "enabled": false,
  "checkAutomatically": "NEVER"
}
```

This prevents Expo from trying to download updates during development.

## Restart Expo

```bash
cd mobile
expo start -c
```

Should work now without update errors!

## If Still Having Issues

1. **Delete .expo folder:**
   ```bash
   rm -rf mobile/.expo
   ```

2. **Restart:**
   ```bash
   expo start -c
   ```

3. **Use tunnel mode:**
   ```bash
   expo start --tunnel
   ```

