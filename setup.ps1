# PowerShell setup script for Rental Booking System
# To run this script, use: powershell -ExecutionPolicy Bypass -File .\setup.ps1
# Or run: .\setup.cmd (Windows batch file alternative)

Write-Host "Setting up Rental Booking System..." -ForegroundColor Green
Write-Host ""

# Check if npm is installed
try {
    $npmVersion = npm --version 2>$null
    if (-not $npmVersion) {
        throw "npm not found"
    }
    Write-Host "Node.js version: " -NoNewline
    node --version
    Write-Host "npm version: " -NoNewline
    npm --version
    Write-Host ""
} catch {
    Write-Host "[ERROR] npm is not installed or not in your PATH." -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Node.js from: https://nodejs.org/" -ForegroundColor Yellow
    Write-Host "Node.js includes npm automatically." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "After installing Node.js:" -ForegroundColor Cyan
    Write-Host "1. Close and reopen this terminal"
    Write-Host "2. Run this script again: .\setup.ps1"
    Write-Host ""
    exit 1
}

# Create storage directories
Write-Host "Creating storage directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "storage\uploads\products" | Out-Null
New-Item -ItemType Directory -Force -Path "storage\uploads\invoices" | Out-Null
New-Item -ItemType Directory -Force -Path "storage\uploads\profiles" | Out-Null

# Install root dependencies
Write-Host "Installing root dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to install root dependencies" -ForegroundColor Red
    exit 1
}

# Install frontend dependencies
Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location frontend
npm install
if ($LASTEXITCODE -ne 0) {
    Set-Location ..
    Write-Host "[ERROR] Failed to install frontend dependencies" -ForegroundColor Red
    exit 1
}
Set-Location ..

# Install backend dependencies
Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
Set-Location backend
npm install
if ($LASTEXITCODE -ne 0) {
    Set-Location ..
    Write-Host "[ERROR] Failed to install backend dependencies" -ForegroundColor Red
    exit 1
}
Set-Location ..

# Copy environment files
Write-Host "Setting up environment files..." -ForegroundColor Yellow
if (-not (Test-Path "backend\.env")) {
    Copy-Item "backend\.env.example" "backend\.env"
    Write-Host "Created backend\.env - Please update with your database credentials" -ForegroundColor Cyan
}

if (-not (Test-Path "frontend\.env.local")) {
    Copy-Item "frontend\.env.local.example" "frontend\.env.local"
    Write-Host "Created frontend\.env.local" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Update backend\.env with your PostgreSQL credentials"
Write-Host "2. Create PostgreSQL database: createdb rental_db"
Write-Host "3. Run database migration: cd backend; npm run db:migrate"
Write-Host "4. (Optional) Seed database: cd backend; npm run db:seed"
Write-Host "5. Start development: npm run dev"

