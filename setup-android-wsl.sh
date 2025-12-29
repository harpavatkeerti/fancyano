#!/bin/bash

# Android SDK Setup for WSL
# This script helps set up ANDROID_HOME to use Windows Android SDK

echo "🔧 Setting up Android SDK for WSL..."
echo ""

# Get Windows username (assuming it's the same or you can modify)
WINDOWS_USER=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r' || echo "User")

echo "Detected Windows user: $WINDOWS_USER"
echo ""
echo "Common Android SDK locations:"
echo "1. C:\\Users\\$WINDOWS_USER\\AppData\\Local\\Android\\Sdk"
echo "2. C:\\Android\\Sdk"
echo "3. Custom location"
echo ""

read -p "Enter your Android SDK path (Windows path, e.g., C:\\Users\\User\\AppData\\Local\\Android\\Sdk): " SDK_PATH

if [ -z "$SDK_PATH" ]; then
    SDK_PATH="C:\\Users\\$WINDOWS_USER\\AppData\\Local\\Android\\Sdk"
    echo "Using default: $SDK_PATH"
fi

# Convert Windows path to WSL path
WSL_SDK_PATH=$(echo "$SDK_PATH" | sed 's/C:/\/mnt\/c/g' | sed 's/\\/\//g')

echo ""
echo "WSL path will be: $WSL_SDK_PATH"
echo ""

# Check if path exists
if [ ! -d "$WSL_SDK_PATH" ]; then
    echo "⚠️  Warning: Path does not exist: $WSL_SDK_PATH"
    echo "Please verify the path or install Android Studio first."
    read -p "Continue anyway? (y/n): " CONTINUE
    if [ "$CONTINUE" != "y" ]; then
        exit 1
    fi
fi

# Determine shell config file
if [ -f "$HOME/.zshrc" ]; then
    SHELL_CONFIG="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_CONFIG="$HOME/.bashrc"
else
    SHELL_CONFIG="$HOME/.bashrc"
    touch "$SHELL_CONFIG"
fi

echo "Using shell config: $SHELL_CONFIG"
echo ""

# Remove old Android SDK entries
sed -i '/ANDROID_HOME/d' "$SHELL_CONFIG"
sed -i '/Android.*Sdk/d' "$SHELL_CONFIG"

# Add new entries
cat >> "$SHELL_CONFIG" << EOF

# Android SDK Configuration
export ANDROID_HOME=$WSL_SDK_PATH
export PATH=\$PATH:\$ANDROID_HOME/emulator
export PATH=\$PATH:\$ANDROID_HOME/platform-tools
export PATH=\$PATH:\$ANDROID_HOME/tools
export PATH=\$PATH:\$ANDROID_HOME/tools/bin
EOF

echo "✅ Added Android SDK configuration to $SHELL_CONFIG"
echo ""
echo "📝 To apply changes, run:"
echo "   source $SHELL_CONFIG"
echo ""
echo "Or restart your terminal."
echo ""
echo "🔍 To verify, run:"
echo "   adb version"
echo ""

