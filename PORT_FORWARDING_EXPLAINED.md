# Port Forwarding Explained

## How It Works

```
Phone (192.168.29.x)
    ↓
Connects to Windows IP: 192.168.29.233:3001
    ↓
Windows Port Forwarding: 192.168.29.233:3001 → 172.18.12.236:3001
    ↓
WSL Backend: 172.18.12.236:3001
```

## Important: Use Windows IP in Mobile App!

**❌ WRONG (WSL IP):**
```typescript
return 'http://172.18.12.236:3001/api'; // Phone can't reach WSL directly!
```

**✅ CORRECT (Windows IP):**
```typescript
return 'http://192.168.29.233:3001/api'; // Phone connects to Windows, which forwards to WSL
```

## Why?

1. **Phone connects to Windows network** (192.168.29.x)
2. **WSL is on separate virtual network** (172.18.x.x)
3. **Phone can't directly reach WSL IP**
4. **Port forwarding bridges them:**
   - Phone → Windows IP:3001
   - Windows forwards → WSL IP:3001
   - Backend receives request

## Current Setup

- **Port forwarding:** ✅ Set up (Windows:3001 → WSL:3001)
- **Backend in WSL:** ✅ Running
- **Windows curl works:** ✅ Port forwarding works
- **Mobile API URL:** ❌ Using WSL IP (should use Windows IP)

## Fix

Update `mobile/src/lib/api.ts`:
```typescript
return 'http://192.168.29.233:3001/api'; // Windows IP
```

Then test from phone: `http://192.168.29.233:3001/api/health`

## Verification

1. **Port forwarding works:** ✅ (Windows curl works)
2. **Use Windows IP in mobile:** ✅ (192.168.29.233)
3. **Phone should connect now:** ✅

The phone connects to Windows IP, Windows forwards to WSL - that's how port forwarding works!

