#!/bin/bash
# One-click start for "Did You Hear That?".
# Double-click this file in Finder (macOS) to install what is missing,
# start the dev server and open the house in the browser.
# Close the Terminal window, or press Ctrl+C, to stop the server.

set -u
PORT=5180
URL="http://localhost:${PORT}/"

cd "$(dirname "$0")" || exit 1

# Finder starts .command files with a minimal PATH, so add the usual
# Homebrew and nvm locations before looking for node.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/$(cat .nvmrc 2>/dev/null)/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
  nvm use >/dev/null 2>&1 || true
fi

echo "== Did You Hear That? =="

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node 26 (see .nvmrc), then run this again."
  read -r -p "Press Return to close."
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
WANTED="$(cat .nvmrc 2>/dev/null || echo 26)"
if [ "$NODE_MAJOR" != "$WANTED" ]; then
  echo "Warning: Node $(node -v) is running, but the project wants Node $WANTED."
fi

# Free the port first. A dev server still running there holds files inside
# node_modules, and npm ci then fails with ENOTEMPTY.
OLD_PID="$(lsof -ti tcp:${PORT} -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$OLD_PID" ]; then
  echo "Stopping the old server on port ${PORT} (pid ${OLD_PID})..."
  kill $OLD_PID 2>/dev/null || true
  sleep 2
fi

# Install exact dependencies from the lockfile the first time, or when the lockfile changed.
STAMP="node_modules/.install-stamp"
if [ ! -d node_modules ] || [ package-lock.json -nt "$STAMP" ]; then
  echo "Installing dependencies (npm ci)..."
  if ! npm ci; then
    # A half-removed node_modules makes npm ci fail again. Clear it and retry once.
    echo "npm ci failed. Clearing node_modules and trying once more..."
    rm -rf node_modules
    if ! npm ci; then
      echo "npm ci failed again. See the messages above."
      read -r -p "Press Return to close."
      exit 1
    fi
  fi
  touch "$STAMP"
fi

# Open the browser once the server answers.
(
  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null "$URL" 2>/dev/null; then
      open "$URL"
      exit 0
    fi
    sleep 1
  done
) &

echo "Starting the dev server at ${URL}"
echo "Close this window or press Ctrl+C to stop."
exec npm run dev -- --port "$PORT" --strictPort
