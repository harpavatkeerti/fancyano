#!/bin/bash

# Fix Expo ADB path issue - Creates symlink so Expo can find adb

echo "🔧 Fixing ADB path for Expo..."
echo ""

ANDROID_HOME="/mnt/c/Users/User/AppData/Local/Android/Sdk"
PLATFORM_TOOLS="$ANDROID_HOME/platform-tools"

if [ ! -d "$PLATFORM_TOOLS" ]; then
    echo "❌ Error: Platform tools directory not found: $PLATFORM_TOOLS"
    exit 1
fi

if [ ! -f "$PLATFORM_TOOLS/adb.exe" ]; then
    echo "❌ Error: adb.exe not found: $PLATFORM_TOOLS/adb.exe"
    exit 1
fi

# Create symlink from adb to adb.exe
# Note: WSL can create symlinks to Windows executables
if [ -L "$PLATFORM_TOOLS/adb" ]; then
    echo "⚠️  Symlink already exists, removing old one..."
    rm "$PLATFORM_TOOLS/adb"
fi

# Create symlink
ln -s "$PLATFORM_TOOLS/adb.exe" "$PLATFORM_TOOLS/adb"

if [ -L "$PLATFORM_TOOLS/adb" ]; then
    echo "✅ Created symlink: $PLATFORM_TOOLS/adb -> adb.exe"
    echo ""
    echo "🔍 Testing..."
    "$PLATFORM_TOOLS/adb" version
    echo ""
    echo "✅ Done! Expo should now be able to find adb."
else
    echo "❌ Failed to create symlink"
    exit 1
fi

