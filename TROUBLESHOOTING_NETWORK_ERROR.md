# Fixing Network Error When Adding Products

## The Problem
"Network Error" means the frontend can't reach the backend API server.

## Quick Fixes

### 1. Make Sure Backend is Running

**Check if backend is running:**
```bash
# In a terminal, check if port 3001 is in use
# Windows PowerShell:
netstat -ano | findstr :3001

# WSL/Linux:
lsof -i :3001
```

**Start the backend:**
```bash
cd backend
npm run dev
```

You should see:
```
Server is running on http://localhost:3001
Connected to PostgreSQL database
```

### 2. Check Frontend .env.local File

Make sure `frontend/.env.local` exists with:
```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

**If it doesn't exist, create it:**
```bash
# Windows PowerShell
cd frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:3001/api" | Out-File -FilePath .env.local -Encoding utf8

# WSL/Linux
cd frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:3001/api" > .env.local
```

**After creating/updating .env.local, restart the frontend:**
- Stop the frontend (Ctrl+C)
- Start again: `npm run dev`

### 3. Test Backend Connection

Open in browser: http://localhost:3001/api/health

You should see:
```json
{
  "status": "ok",
  "message": "Server is running",
  "timestamp": "..."
}
```

If this doesn't work, the backend isn't running.

### 4. Check CORS Configuration

The backend already has CORS enabled, but if you're still having issues, verify the backend server.js has:
```javascript
app.use(cors());
```

### 5. If Using WSL

If your backend is in WSL and frontend is in Windows:
- Make sure backend is listening on `0.0.0.0` not just `localhost`
- Or use WSL IP address in frontend .env.local

## Step-by-Step Solution

1. **Terminal 1 - Start Backend:**
   ```bash
   cd backend
   npm run dev
   ```
   Wait for: "Server is running on http://localhost:3001"

2. **Terminal 2 - Start Frontend:**
   ```bash
   cd frontend
   npm run dev
   ```
   Wait for: "ready started server on 0.0.0.0:3000"

3. **Verify .env.local exists:**
   ```bash
   # Check if file exists
   cat frontend/.env.local
   ```
   Should show: `NEXT_PUBLIC_API_URL=http://localhost:3001/api`

4. **Test the connection:**
   - Open: http://localhost:3001/api/health (should work)
   - Open: http://localhost:3000 (frontend should load)
   - Try adding a product again

## Common Issues

### Issue: "Cannot GET /api/products"
- Backend routes are correct
- Make sure you're accessing `/api/products` not `/products`

### Issue: Port 3001 already in use
```bash
# Windows: Find and kill process
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# WSL: Find and kill
lsof -ti:3001 | xargs kill
```

### Issue: Backend starts but immediately crashes
- Check database connection in `backend/.env`
- Make sure PostgreSQL is running
- Verify database credentials

## Still Not Working?

1. Check browser console for detailed errors
2. Check backend terminal for error messages
3. Verify both servers are running on correct ports
4. Make sure no firewall is blocking localhost connections

