#!/bin/bash

# Create a proper bash wrapper for adb that Expo can execute

echo "🔧 Creating ADB wrapper script for Expo..."
echo ""

ANDROID_HOME="/mnt/c/Users/User/AppData/Local/Android/Sdk"
PLATFORM_TOOLS="$ANDROID_HOME/platform-tools"

# Remove old symlink if it exists
if [ -L "$PLATFORM_TOOLS/adb" ]; then
    echo "Removing old symlink..."
    rm "$PLATFORM_TOOLS/adb"
fi

# Create bash wrapper script
cat > "$PLATFORM_TOOLS/adb" << 'EOF'
#!/bin/bash
exec /mnt/c/Users/User/AppData/Local/Android/Sdk/platform-tools/adb.exe "$@"
EOF

# Make it executable
chmod +x "$PLATFORM_TOOLS/adb"

echo "✅ Created wrapper script: $PLATFORM_TOOLS/adb"
echo ""
echo "🔍 Testing..."
"$PLATFORM_TOOLS/adb" version
echo ""
echo "✅ Done! Expo should now be able to execute adb."

