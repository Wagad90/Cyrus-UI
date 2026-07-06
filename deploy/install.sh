#!/usr/bin/env bash
# ── Cyrus Control UI install wizard ──────────────────────────────────────
# One command, no manual steps:   ./deploy/install.sh
# Run as the SAME user that runs the cyrus daemon. Safe to re-run any time
# to update: it rebuilds, keeps your password, and restarts the service.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_DIR="$(pwd)"
RUN_USER="$(id -un)"
SERVICE_NAME="cyrus-ui"
DATA_DIR="${CYRUS_UI_DATA_DIR:-$HOME/.cyrus-ui}"

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# ask "Question" "default" → sets $REPLY (default used when non-interactive)
ask() {
	local question="$1" default="${2-}" answer=""
	if [ -t 0 ]; then
		read -r -p "$question${default:+ [$default]}: " answer || true
	fi
	REPLY="${answer:-$default}"
}

printf '\033[1m🎛️  Cyrus Control UI — install wizard\033[0m\n'
echo "    Checkout: $REPO_DIR"
echo "    User:     $RUN_USER"

step "1/6 Checking prerequisites"
if ! command -v node >/dev/null 2>&1; then
	echo "node not found. Install Node.js 20 or newer first." >&2
	exit 1
fi
major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$major" -lt 20 ]; then
	echo "Node.js 20+ required (found $(node --version))." >&2
	exit 1
fi
echo "node $(node --version) ✓"

step "2/6 Installing dependencies & building"
npm install
npm run build

step "3/6 UI port"
ask "Port for the UI to listen on (loopback only)" "8899"
UI_PORT="$REPLY"

step "4/6 UI password"
if grep -q '"passwordHash"' "$DATA_DIR/ui-config.json" 2>/dev/null; then
	ask "A UI password is already set. Change it? (y/N)" "n"
	case "$REPLY" in
		[Yy]*) node server/dist/cli.js set-password ;;
		*) echo "Keeping the existing password." ;;
	esac
else
	echo "Choose the password you'll use to sign in to the web UI."
	node server/dist/cli.js set-password
fi

SERVICE_STARTED=0
step "5/6 Systemd service"
if command -v systemctl >/dev/null 2>&1 && [ -t 0 ]; then
	ask "Install and start the '$SERVICE_NAME' service now? Requires sudo. (Y/n)" "y"
	case "$REPLY" in
		[Nn]*)
			echo "Skipped. Re-run this wizard later, or start manually with: npm start"
			;;
		*)
			NODE_BIN="$(command -v node)"
			unit_tmp="$(mktemp)"
			{
				cat <<UNIT
[Unit]
Description=Cyrus Control UI
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$REPO_DIR
ExecStart=$NODE_BIN server/dist/index.js
Restart=always
RestartSec=3
UNIT
				[ "$UI_PORT" != "8899" ] && echo "Environment=CYRUS_UI_PORT=$UI_PORT"
				cat <<'UNIT'

[Install]
WantedBy=multi-user.target
UNIT
			} >"$unit_tmp"
			sudo cp "$unit_tmp" "/etc/systemd/system/$SERVICE_NAME.service"
			rm -f "$unit_tmp"
			sudo systemctl daemon-reload
			sudo systemctl enable "$SERVICE_NAME" >/dev/null 2>&1
			sudo systemctl restart "$SERVICE_NAME"
			sleep 1
			if systemctl is-active --quiet "$SERVICE_NAME"; then
				echo "Service running ✓  (logs: journalctl -u $SERVICE_NAME -f)"
				SERVICE_STARTED=1
			else
				echo "Service installed but not active — check: journalctl -u $SERVICE_NAME -e" >&2
				exit 1
			fi
			;;
	esac
else
	echo "No systemd or non-interactive shell — start manually with: npm start"
fi

step "6/6 Health check"
if [ "$SERVICE_STARTED" = "1" ]; then
	if node -e "fetch('http://127.0.0.1:$UI_PORT/api/auth/me').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; then
		echo "UI responding on http://127.0.0.1:$UI_PORT ✓"
	else
		echo "UI not responding on port $UI_PORT — check: journalctl -u $SERVICE_NAME -e" >&2
		exit 1
	fi
	CYRUS_PORT="${CYRUS_SERVER_PORT:-3456}"
	if node -e "fetch('http://127.0.0.1:$CYRUS_PORT/version').then(r=>r.json()).then(j=>console.log('Cyrus daemon detected ✓  (v'+(j.cyrus_cli_version??'?')+')')).catch(()=>process.exit(1))"; then
		:
	else
		echo "Note: no Cyrus daemon on port $CYRUS_PORT right now. The UI still works;"
		echo "the Overview page will show it as unreachable until cyrus is running."
	fi
else
	echo "Skipped (service not started by the wizard)."
fi

cat <<EOF

────────────────────────────────────────────────────────────────────
Done. Two final steps in the Cloudflare dashboard (can't be automated
from here — they live in your Cloudflare account):

  A. one.dash.cloudflare.com → Networks → Tunnels → your Cyrus tunnel
     → Public Hostname → Add a public hostname
        Subdomain: cyrus-ui     Domain: (your domain)
        Type: HTTP              URL: localhost:$UI_PORT

  B. Access → Applications → Add an application → Self-hosted
        Domain: cyrus-ui.yourdomain.com
        Policy: Allow → Include → Emails → your email

Then open https://cyrus-ui.yourdomain.com and sign in. To update later:
  cd $REPO_DIR && git pull && ./deploy/install.sh
────────────────────────────────────────────────────────────────────
EOF
