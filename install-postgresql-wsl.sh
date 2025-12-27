#!/bin/bash

# Quick PostgreSQL installation script for WSL

echo "=========================================="
echo "PostgreSQL Installation for WSL"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    echo "Please do not run this script as root/sudo"
    echo "The script will prompt for sudo when needed"
    exit 1
fi

# Update package list
echo "Step 1: Updating package list..."
sudo apt update

# Install PostgreSQL
echo ""
echo "Step 2: Installing PostgreSQL..."
sudo apt install -y postgresql postgresql-contrib

# Start PostgreSQL service
echo ""
echo "Step 3: Starting PostgreSQL service..."
sudo service postgresql start

# Enable PostgreSQL to start on boot
echo ""
echo "Step 4: Enabling PostgreSQL to start on boot..."
sudo systemctl enable postgresql

# Set up database
echo ""
echo "Step 5: Creating database 'rental_db'..."
sudo -u postgres createdb rental_db 2>/dev/null

if [ $? -eq 0 ]; then
    echo "Database 'rental_db' created successfully!"
else
    echo "Database might already exist, or there was an error."
    echo "You can create it manually with: sudo -u postgres createdb rental_db"
fi

# Set password for postgres user
echo ""
echo "Step 6: Setting password for postgres user..."
echo "Enter a password for the PostgreSQL 'postgres' user:"
read -s POSTGRES_PASSWORD

if [ -n "$POSTGRES_PASSWORD" ]; then
    sudo -u postgres psql -c "ALTER USER postgres PASSWORD '$POSTGRES_PASSWORD';" 2>/dev/null
    echo "Password set successfully!"
    echo ""
    echo "IMPORTANT: Save this password! You'll need it for backend/.env"
    echo "Password: $POSTGRES_PASSWORD"
else
    echo "No password provided. You can set it later with:"
    echo "  sudo -u postgres psql"
    echo "  ALTER USER postgres PASSWORD 'your_password';"
fi

# Verify installation
echo ""
echo "Step 7: Verifying installation..."
if command -v psql &> /dev/null; then
    echo "[OK] PostgreSQL client is installed"
    psql --version
else
    echo "[ERROR] PostgreSQL client not found in PATH"
fi

if sudo service postgresql status &> /dev/null; then
    echo "[OK] PostgreSQL service is running"
else
    echo "[WARNING] PostgreSQL service might not be running"
    echo "Start it with: sudo service postgresql start"
fi

echo ""
echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Update backend/.env with your PostgreSQL password"
echo "2. Run database migration: cd backend && npm run db:migrate"
echo "3. (Optional) Seed database: cd backend && npm run db:seed"
echo ""

