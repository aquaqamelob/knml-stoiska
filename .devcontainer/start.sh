#!/bin/bash
set -e

echo "Building and starting KNML Kiosk..."

if ! command -v curl >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && [ "$(id -u)" -ne 0 ]; then
    sudo apt-get update
    sudo apt-get install -y curl python3
  else
    apt-get update
    apt-get install -y curl python3
  fi
fi

echo "Waiting for Docker..."
for i in {1..60}; do
  if docker info >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! docker info >/dev/null 2>&1; then
  echo "Docker did not become ready. Check the Codespace logs."
  exit 1
fi

docker compose up --build -d

echo "Waiting for kiosk to become healthy..."

for i in {1..60}; do
  if curl -fsS http://localhost:8080/api/health >/dev/null; then
    break
  fi
  sleep 5
done

if ! curl -fsS http://localhost:8080/api/health >/dev/null; then
  echo "Kiosk failed to start. Check Docker logs."
  docker compose logs --tail=50
  exit 1
fi

if [ -z "${CODESPACE_NAME:-}" ]; then
  echo ""
  echo "=================================="
  echo "KNML KIOSK IS READY!"
  echo "=================================="
  echo "http://localhost:8080"
  exit 0
fi

echo "Making port 8080 public..."

if [ -z "${GH_TOKEN:-}" ] && [ -n "${GITHUB_TOKEN:-}" ]; then
  export GH_TOKEN="$GITHUB_TOKEN"
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is not installed, so the port could not be made public."
  exit 1
fi

for i in {1..30}; do
  if gh codespace ports visibility 8080:public -c "$CODESPACE_NAME"; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Could not make port 8080 public."
    exit 1
  fi
  sleep 2
done

URL=""
for i in {1..30}; do
  URL=$(gh codespace ports --json sourcePort,browseUrl -c "$CODESPACE_NAME" \
    | python3 -c 'import json,sys; print(next((p["browseUrl"] for p in json.load(sys.stdin) if p.get("sourcePort") == 8080), ""))') || true
  if [ -n "$URL" ]; then
    break
  fi
  sleep 2
done

if [ -z "$URL" ]; then
  echo "Kiosk is healthy, but the public URL is not available yet."
  exit 1
fi

echo ""
echo "=================================="
echo "KNML KIOSK IS READY!"
echo "=================================="
echo "$URL"
