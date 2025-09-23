#!/bin/bash
set -e

BRANCH="current" # Change to your branch if needed
REPO_URL="http://anonymous:12345678@192.168.1.48:10500/Tea/VPI_001.git"
APP_DIR="/app"

if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  echo "Attempting to fetch and reset to $BRANCH..."
  git fetch origin "$BRANCH" && git reset --hard "origin/$BRANCH" || {
    echo "Git reset failed, re-cloning..."
    cd /
    rm -rf "$APP_DIR"
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
  }
else
  echo "No git repo found, cloning..."
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# Install Node.js dependencies
npm install

rm -rf cmp
# Build TypeScript
echo "Building TypeScript..."
npx tsc --outDir cmp

# Start the app (compiled JS)
node cmp/index.js
