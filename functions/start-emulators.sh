#!/bin/bash

# emulate.sh: Script to set up and test Firebase Emulator Suite for audio processing system using TypeScript
# Usage: ./emulate.sh
# Prerequisites: Firebase CLI, Node.js, curl, uuidgen, npx, and a test audio file

# Exit on error
set -e
API_KEY="AIzaSyASsaw34Y5e8XF3gKnnJyqii5fqbT_YlZQ"
# Step 1: Check for required tools
echo "Killing previous emulators"
npx kill-port 4000 9199 5001 8080 9099 9199 8085 >/dev/null 2>&1

echo "Checking for required tools..."
command -v firebase >/dev/null 2>&1 || { echo "Firebase CLI not found. Install with: npm install -g firebase-tools"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm not found. Install Node.js and npm."; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl not found. Install curl."; exit 1; }
command -v uuidgen >/dev/null 2>&1 || { echo "uuidgen not found. Install uuid-runtime (e.g., sudo apt install uuid-runtime)."; exit 1; }

# Step 2: Install dependencies
echo "Installing dependencies..."
pnpm install

echo "Building TS..."
pnpm build

# Step 3: Set environment variables for emulation
echo "Setting environment variables..."
export FUNCTIONS_EMULATOR=true
firebase functions:config:set openai.key="mock-key"

# Step 4: Start Firebase Emulator Suite
firebase emulators:start --only functions,pubsub,firestore,storage,auth