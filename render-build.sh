#!/bin/bash

# Exit on error
set -e

echo "Starting Render build process..."

# Clean any existing node_modules to avoid conflicts
echo "Cleaning existing node_modules..."
rm -rf node_modules
rm -rf server/node_modules
rm -rf client/node_modules

# Install root dependencies
echo "Installing root dependencies..."
npm install

# Build server
echo "Building server..."
cd server
npm install
npm run build || echo "No server build script, continuing..."

# Build client with Vite
echo "Building client..."
cd ../client
npm install
npm run build

# Copy client build to server public directory
echo "Copying client build to server..."
rm -rf ../server/public
mkdir -p ../server/public
cp -r dist/* ../server/public/

# Return to root
cd ..

echo "Build complete!"