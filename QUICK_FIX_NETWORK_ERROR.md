# Quick Fix: Network Error

## Most Likely Cause
**The backend server is not running!**

## Fix in 3 Steps

### Step 1: Start Backend Server
Open a new terminal and run:
```bash
cd backend
npm run dev
```

You should see:
```
Server is running on http://localhost:3001
Connected to PostgreSQL database
```

### Step 2: Verify Frontend .env.local
Make sure `frontend/.env.local` exists with:
```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

**If it doesn't exist, create it:**
```powershell
# PowerShell
cd frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:3001/api" | Out-File -FilePath .env.local -Encoding utf8
```

### Step 3: Restart Frontend
If you just created/updated `.env.local`, restart the frontend:
- Stop it (Ctrl+C)
- Start again: `npm run dev`

## Test It Works

1. Open: http://localhost:3001/api/health
   - Should show JSON with "status": "ok"

2. Try adding a product again
   - Should work now!

## Still Not Working?

Check:
- [ ] Backend terminal shows "Server is running"
- [ ] Frontend .env.local file exists
- [ ] Both servers are running (frontend on 3000, backend on 3001)
- [ ] No errors in backend terminal

