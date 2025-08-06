#!/bin/bash

# Exit on error
set -e

echo "Starting Render build process..."

# Install root dependencies
echo "Installing root dependencies..."
npm install

# Build server
echo "Building server..."
cd server
npm install
npm run build || true # Continue if no build script

# Build client
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