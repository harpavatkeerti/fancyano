#!/bin/bash

# Fix Expo Go APK cache issue

echo "🔧 Fixing Expo Go APK cache..."
echo ""

CACHE_DIR="$HOME/.expo/android-apk-cache"

# Create cache directory
mkdir -p "$CACHE_DIR"

echo "✅ Created cache directory: $CACHE_DIR"
echo ""
echo "📥 Expo will now download the APK on first run."
echo ""
echo "Alternatively, you can:"
echo "1. Install Expo Go manually on emulator from Play Store"
echo "2. Or use: expo start (without --android flag) and connect manually"
echo ""

