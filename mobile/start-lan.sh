#!/bin/bash
# Start Expo in LAN mode with Windows IP (not WSL IP)
# This ensures the phone connects to Windows IP which forwards to WSL

export EXPO_DEVTOOLS_LISTEN_ADDRESS=192.168.29.238
export REACT_NATIVE_PACKAGER_HOSTNAME=192.168.29.238

cd "$(dirname "$0")"
npx expo start --lan

