#!/bin/bash

# Fix ADB for WSL - Creates wrapper scripts for Windows executables

echo "🔧 Creating ADB wrapper for WSL..."
echo ""

ANDROID_HOME="/mnt/c/Users/User/AppData/Local/Android/Sdk"
LOCAL_BIN="$HOME/.local/bin"

# Create local bin directory if it doesn't exist
mkdir -p "$LOCAL_BIN"

# Create adb wrapper
cat > "$LOCAL_BIN/adb" << 'EOF'
#!/bin/bash
/mnt/c/Users/User/AppData/Local/Android/Sdk/platform-tools/adb.exe "$@"
EOF

chmod +x "$LOCAL_BIN/adb"

# Create emulator wrapper
if [ -f "$ANDROID_HOME/emulator/emulator.exe" ]; then
    cat > "$LOCAL_BIN/emulator" << 'EOF'
#!/bin/bash
/mnt/c/Users/User/AppData/Local/Android/Sdk/emulator/emulator.exe "$@"
EOF
    chmod +x "$LOCAL_BIN/emulator"
fi

# Add to PATH if not already there
if [[ ":$PATH:" != *":$LOCAL_BIN:"* ]]; then
    echo "" >> ~/.bashrc
    echo "# Add local bin to PATH for Android tools" >> ~/.bashrc
    echo "export PATH=\$PATH:\$HOME/.local/bin" >> ~/.bashrc
    echo "✅ Added ~/.local/bin to PATH in ~/.bashrc"
fi

echo "✅ Created wrapper scripts:"
echo "   - $LOCAL_BIN/adb"
if [ -f "$LOCAL_BIN/emulator" ]; then
    echo "   - $LOCAL_BIN/emulator"
fi
echo ""
echo "📝 To use immediately, run:"
echo "   export PATH=\$PATH:\$HOME/.local/bin"
echo "   source ~/.bashrc"
echo ""
echo "🔍 Test with:"
echo "   adb version"

