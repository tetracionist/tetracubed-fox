#!/usr/bin/env bash
# Tetracubed Fox — no-sudo, per-user setup for a fresh box.
#
# Run as the unprivileged service user (the same user your CI/CD deploys as):
#   curl -fsSL https://raw.githubusercontent.com/tetracionist/tetracubed-fox/main/setup-user.sh | bash
#
# Installs Node via nvm and a systemd --user service. No root required for any
# step except (optionally) enabling linger — see the note at the end.
set -euo pipefail

REPO_URL="https://github.com/tetracionist/tetracubed-fox.git"
REPO_SLUG="tetracionist/tetracubed-fox"
REF="${REF:-main}"          # branch/tag to fetch when falling back to a tarball
APP_DIR="$HOME/tetracubed-fox"
SERVICE="tetracubed-fox"
NODE_MAJOR=20

echo "== Tetracubed Fox — per-user setup (no sudo) =="

# --- PATH for per-user binaries -------------------------------------------
mkdir -p "$HOME/.local/bin"
grep -q '.local/bin' "$HOME/.bashrc" 2>/dev/null \
  || echo 'export PATH="$HOME/.local/bin:$HOME/.pulumi/bin:$PATH"' >> "$HOME/.bashrc"

# --- Node via nvm ----------------------------------------------------------
export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "-> installing nvm"
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm install "$NODE_MAJOR"
nvm alias default "$NODE_MAJOR"

# --- Code (git if present, else a curl tarball — fresh boxes may lack git) --
if command -v git >/dev/null 2>&1; then
  if [ -d "$APP_DIR/.git" ]; then
    echo "-> updating $APP_DIR (git)"
    git -C "$APP_DIR" pull --ff-only
  else
    echo "-> cloning into $APP_DIR (git)"
    git clone "$REPO_URL" "$APP_DIR"
  fi
else
  echo "-> git not found; fetching '$REF' tarball into $APP_DIR (curl)"
  mkdir -p "$APP_DIR"
  curl -fsSL "https://github.com/$REPO_SLUG/archive/refs/heads/$REF.tar.gz" \
    | tar xz --strip-components=1 -C "$APP_DIR"
fi
cd "$APP_DIR"
chmod +x deploy/run.sh
npm install --omit=dev

# --- .env ------------------------------------------------------------------
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo "!! created $APP_DIR/.env from the example — edit it with your credentials"
fi

# --- systemd --user service ------------------------------------------------
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
mkdir -p "$HOME/.config/systemd/user"
cp "$APP_DIR/deploy/$SERVICE.service" "$HOME/.config/systemd/user/$SERVICE.service"
systemctl --user daemon-reload
systemctl --user enable "$SERVICE"

# --- keep running after logout / across reboot -----------------------------
if loginctl enable-linger "$USER" 2>/dev/null || sudo -n loginctl enable-linger "$USER" 2>/dev/null; then
  echo "-> linger enabled (service survives logout + reboot, and CI restarts work)"
else
  echo "!! could not enable linger without privileges."
  echo "   Ask an admin to run once:  sudo loginctl enable-linger $USER"
  echo "   Without it the service stops on logout and CI deploys cannot restart it."
fi

cat <<EOF

Done. Next:
  1) edit $APP_DIR/.env  (DISCORD_TOKEN, API_BASE_URL, API_USERNAME, API_PASSWORD, SERVER_HOSTNAME)
  2) systemctl --user start $SERVICE
  3) journalctl --user -u $SERVICE -f
EOF
