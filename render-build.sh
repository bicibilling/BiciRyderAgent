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
# Install ALL dependencies including devDependencies for build
npm install --production=false
npm run build || echo "No server build script, continuing..."

# Build client with Vite
echo "Building client..."
cd ../client
# Install ALL dependencies including devDependencies for build
npm install --production=false
npm run build

# Copy client build to server public directory
echo "Copying client build to server..."
rm -rf ../server/public
mkdir -p ../server/public
cp -r dist/* ../server/public/

# Clean up dev dependencies to reduce slug size
echo "Cleaning up dev dependencies..."
cd ../server
npm prune --production
cd ../client
npm prune --production

# Return to root
cd ..

echo "Build complete!"