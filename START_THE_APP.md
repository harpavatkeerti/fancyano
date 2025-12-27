# How to Start and View the App

## Quick Start (Easiest - One Command)

From the project root directory:

```bash
npm run dev
```

This starts both backend and frontend servers at the same time.

---

## Step-by-Step (If you prefer separate terminals)

### Step 1: Start Backend Server

**Terminal 1 (WSL or PowerShell):**
```bash
cd backend
npm run dev
```

You should see:
```
Server is running on http://localhost:3001
Connected to PostgreSQL database
```

### Step 2: Start Frontend Server

**Terminal 2 (WSL or PowerShell):**
```bash
cd frontend
npm run dev
```

You should see:
```
- ready started server on 0.0.0.0:3000, url: http://localhost:3000
```

---

## Access the App

Once both servers are running:

### Frontend (Web App)
🌐 **Open in browser:** http://localhost:3000

### Backend API
🔌 **API endpoint:** http://localhost:3001/api

### Test Backend Health
🔍 **Health check:** http://localhost:3001/api/health

---

## What You'll See

### Home Page (http://localhost:3000)
- A simple landing page with three cards:
  - Admin Portal
  - Customer Portal  
  - Salesman Portal

### API Endpoints Available
- `GET /api/health` - Health check
- `GET /api/products` - List products
- `GET /api/bookings` - List bookings
- `GET /api/users` - List users

---

## Troubleshooting

### Port Already in Use

**If port 3000 or 3001 is busy:**

**Windows:**
```powershell
# Find process using port 3001
netstat -ano | findstr :3001
# Kill it (replace PID with the number shown)
taskkill /PID <PID> /F
```

**WSL/Linux:**
```bash
# Find process
lsof -ti:3001
# Kill it
kill -9 $(lsof -ti:3001)
```

### Backend Can't Connect to Database

Make sure:
1. PostgreSQL is running:
   ```bash
   # In WSL
   sudo service postgresql status
   sudo service postgresql start
   ```

2. Database exists:
   ```bash
   psql -U postgres -d rental_db
   ```

3. `.env` file is correct in `backend/` directory

### Frontend Can't Connect to Backend

1. Check `frontend/.env.local` exists:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001/api
   ```

2. Make sure backend is running on port 3001

3. Check browser console for errors (F12)

---

## First Time Setup Checklist

- [ ] Dependencies installed (`npm run install:all`)
- [ ] Database created (`rental_db`)
- [ ] Database migrated (`cd backend && npm run db:migrate`)
- [ ] `backend/.env` file exists and configured
- [ ] `frontend/.env.local` file exists
- [ ] PostgreSQL is running

---

## Next Steps After Starting

1. **View the home page:** http://localhost:3000
2. **Test API:** http://localhost:3001/api/health
3. **View products:** http://localhost:3001/api/products
4. **Start building pages** based on your Figma designs!

---

## Development Tips

- **Hot Reload:** Both frontend and backend auto-reload on file changes
- **API Testing:** Use browser or Postman to test endpoints
- **Database Viewing:** Use pgAdmin to see your data
- **Logs:** Check terminal output for errors and debug info

Enjoy building your rental booking system! 🚀

