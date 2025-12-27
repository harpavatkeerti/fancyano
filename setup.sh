#!/bin/bash

# Setup script for Rental Booking System

echo "Setting up Rental Booking System..."
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm is not installed or not in your PATH."
    echo ""
    echo "Please install Node.js from: https://nodejs.org/"
    echo "Or use your package manager:"
    echo "  Ubuntu/Debian: sudo apt install nodejs npm"
    echo "  Fedora: sudo dnf install nodejs npm"
    echo "  Arch: sudo pacman -S nodejs npm"
    echo ""
    exit 1
fi

# Check Node.js version
echo "Checking Node.js installation..."
node --version
npm --version
echo ""

# Create storage directories
echo "Creating storage directories..."
mkdir -p storage/uploads/products
mkdir -p storage/uploads/invoices
mkdir -p storage/uploads/profiles

# Install root dependencies
echo "Installing root dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install root dependencies"
    exit 1
fi

# Install frontend dependencies
echo "Installing frontend dependencies..."
cd frontend
npm install
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install frontend dependencies"
    cd ..
    exit 1
fi
cd ..

# Install backend dependencies
echo "Installing backend dependencies..."
cd backend
npm install
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install backend dependencies"
    cd ..
    exit 1
fi
cd ..

# Copy environment files
echo "Setting up environment files..."
if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
    echo "Created backend/.env - Please update with your database credentials"
fi

if [ ! -f frontend/.env.local ]; then
    cp frontend/.env.local.example frontend/.env.local
    echo "Created frontend/.env.local"
fi

echo ""
echo "Setup complete!"
echo ""

# Check PostgreSQL
if ! command -v psql &> /dev/null; then
    echo "[WARNING] PostgreSQL is not installed."
    echo ""
    echo "To install PostgreSQL (Ubuntu/Debian):"
    echo "  sudo apt update"
    echo "  sudo apt install postgresql postgresql-contrib"
    echo "  sudo service postgresql start"
    echo ""
    echo "See WSL_SETUP.md for detailed instructions."
    echo ""
fi

echo "Next steps:"
echo "1. Install PostgreSQL if not already installed (see WSL_SETUP.md)"
echo "2. Create PostgreSQL database:"
echo "   sudo -u postgres createdb rental_db"
echo "   OR: createdb -U postgres rental_db"
echo "3. Update backend/.env with your PostgreSQL credentials"
echo "4. Run database migration: cd backend && npm run db:migrate"
echo "5. (Optional) Seed database: cd backend && npm run db:seed"
echo "6. Start development: npm run dev"

