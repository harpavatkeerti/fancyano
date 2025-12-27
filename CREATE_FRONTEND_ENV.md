# Create Frontend .env.local File

## Quick Create

Since `.env.local` files are gitignored, create it manually:

### Option 1: Create via Command Line

**Windows (PowerShell):**
```powershell
cd frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:3001/api" > .env.local
```

**Windows (CMD):**
```cmd
cd frontend
echo NEXT_PUBLIC_API_URL=http://localhost:3001/api > .env.local
```

**WSL/Linux:**
```bash
cd frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:3001/api" > .env.local
```

### Option 2: Create Manually

1. Navigate to `frontend/` folder
2. Create a new file named `.env.local`
3. Add this content:
```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

### Option 3: Copy from Example

If you have `env.local.example`:
```bash
cd frontend
cp env.local.example .env.local
```

---

## Verify It Was Created

Check if the file exists:
```bash
# Windows PowerShell
Test-Path frontend\.env.local

# WSL/Linux
ls -la frontend/.env.local
```

---

## File Content

The `.env.local` file should contain:
```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

This tells the frontend where to find the backend API.

---

## After Creating

Once the file is created, you can start the app:
```bash
npm run dev
```

Then open: http://localhost:3000

