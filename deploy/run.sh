#!/usr/bin/env bash
# Launcher for the systemd --user service.
# Sources nvm so the per-user node is on PATH, then runs the bot from the repo
# root so dotenv picks up ./.env. Lives inside the repo, so it travels with the
# rsync deploy — nothing to install separately.
set -euo pipefail

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
nvm use default >/dev/null 2>&1 || true

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

exec node src/index.js
