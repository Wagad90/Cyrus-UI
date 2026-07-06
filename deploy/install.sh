#!/usr/bin/env bash
# Builds Cyrus Control UI and walks through first-time setup.
# Run from the repository root on the same machine that runs the cyrus daemon.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
	echo "node not found. Install Node.js 20 or newer first." >&2
	exit 1
fi

major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$major" -lt 20 ]; then
	echo "Node.js 20+ required (found $(node --version))." >&2
	exit 1
fi

echo "==> Installing dependencies"
npm install

echo "==> Building"
npm run build

echo "==> Setting the UI password"
npm run set-password

cat <<EOF

Build complete. To run as a systemd service:

  1. Edit deploy/cyrus-ui.service — replace CHANGE_ME_USER with the user
     that runs the cyrus daemon (paths in the unit assume /opt/cyrus-ui;
     adjust WorkingDirectory if this checkout lives elsewhere).
  2. sudo cp deploy/cyrus-ui.service /etc/systemd/system/
  3. sudo systemctl daemon-reload
  4. sudo systemctl enable --now cyrus-ui
  5. journalctl -u cyrus-ui -f   # check it started

Then expose it through your existing Cloudflare tunnel:
add a public hostname (e.g. cyrus-ui.yourdomain.com) pointing at
http://localhost:8899 and protect it with Cloudflare Access.
See README.md for the step-by-step.
EOF
