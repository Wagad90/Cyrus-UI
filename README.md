# Cyrus Control UI

A self-hosted web control panel for a [Cyrus](https://github.com/cyrusagents/cyrus) agent instance. It runs beside the `cyrus` daemon on the same machine, gives you a visual editor for `~/.cyrus/config.json`, and shows live daemon status — all reachable from anywhere through your existing Cloudflare tunnel.

Because Cyrus hot-reloads its config file, every change you save here **applies to the running agent instantly — no restart needed**.

## What it does

- **Overview** — daemon state (idle/busy/unreachable), Cyrus version, configured repositories, connected Linear workspaces
- **Global Settings** — default runner (claude/gemini/codex/cursor), per-runner default models, prompt-mode tool defaults, behaviour toggles
- **Repositories** — per-repo issue routing (routing labels / project keys / team keys), model overrides, tool permissions, and the label → AI mode mapping (`debugger` / `builder` / `scoper` / `orchestrator` …)
- **Access Control** — allowed/blocked Linear users, block behaviour and message
- **Raw JSON** — full config with a red/green diff preview before every save

### Safety model

- **Nothing is written without review** — every save shows a diff of exactly what changes
- **Timestamped backup** (`config.backup-<ts>.json`) before every write, atomic write after
- **Unknown fields are preserved** — the UI never strips config keys it doesn't know about, so it stays safe across Cyrus upgrades
- **Secrets never reach the browser** — Linear tokens are masked in API responses and restored server-side on save
- **Conflict detection** — if Cyrus (or you, in an editor) changed `config.json` after the UI loaded it, the save is rejected instead of silently clobbering
- **Validation** — the config is checked against a schema mirroring Cyrus's own before anything is written
- **Loopback-only** — binds to `127.0.0.1` by default; the only way in is the Cloudflare-Access-protected tunnel hostname, then the app's own password login (scrypt-hashed, rate-limited, httpOnly session cookie)

## Requirements

- Node.js 20+ on the machine that runs the `cyrus` daemon
- A working Cyrus self-hosted setup (`~/.cyrus/config.json` exists)
- For remote access: the Cloudflare tunnel you already use for Cyrus webhooks

## Install

Install as the **same user that runs the `cyrus` daemon** (so `~/.cyrus` resolves correctly). Cloning into your home directory needs no sudo:

```bash
git clone https://github.com/Wagad90/Cyrus-UI.git ~/cyrus-ui
cd ~/cyrus-ui
./deploy/install.sh
```

The script installs dependencies, builds, prompts for the UI password, and offers to install + start the systemd service for you (generated with the right user, paths, and node binary). Re-run it after a `git pull` to update: it rebuilds, keeps your password, and restarts the service.

Prefer `/opt`? Create the directory with the right ownership first (`/opt` is root-owned):

```bash
sudo mkdir -p /opt/cyrus-ui && sudo chown "$USER" /opt/cyrus-ui
git clone https://github.com/Wagad90/Cyrus-UI.git /opt/cyrus-ui
```

Wherever it lives, set `WorkingDirectory` in the systemd unit to match.

Run it manually to try it out:

```bash
npm start
# → http://127.0.0.1:8899 (loopback only)
```

Or install the systemd service (recommended — see the instructions `install.sh` prints, unit file in `deploy/cyrus-ui.service`).

### Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `CYRUS_UI_PORT` | `8899` | Port the UI listens on |
| `CYRUS_UI_HOST` | `127.0.0.1` | Bind address. Keep loopback; the tunnel connects locally |
| `CYRUS_HOME` | `~/.cyrus` | Where the Cyrus daemon keeps `config.json` |
| `CYRUS_SERVER_PORT` | `3456` | Cyrus daemon port (for `/status` + `/version`) |
| `CYRUS_UI_DATA_DIR` | `~/.cyrus-ui` | Where the UI stores its password hash + session secret |
| `CYRUS_UI_INSECURE_COOKIE` | unset | Set `1` only for plain-HTTP LAN testing |

Change the password any time with `npm run set-password` (in this directory).

## Expose via your existing Cloudflare tunnel

One `cloudflared` tunnel can serve multiple public hostnames, so you don't need a second tunnel — just add a hostname to the one Cyrus already uses:

1. Open <https://one.dash.cloudflare.com> → **Networks → Tunnels** → your Cyrus tunnel → **Public Hostname** → **Add a public hostname**
2. Subdomain: `cyrus-ui` (or anything), Domain: your domain, Type: **HTTP**, URL: `localhost:8899`
3. Save. The UI is now at `https://cyrus-ui.yourdomain.com`

### Protect it with Cloudflare Access (strongly recommended)

This panel can modify your agent's configuration — put Zero Trust auth in front of it:

1. In the same dashboard: **Access → Applications → Add an application → Self-hosted**
2. Application domain: `cyrus-ui.yourdomain.com`
3. Add a policy: **Allow** → Include → **Emails** → your email
4. Save. Visitors now authenticate with Cloudflare (email OTP / SSO) *before* reaching the UI, and then still need the UI password (defense in depth).

Do **not** add an Access policy on the Cyrus webhook hostname itself — Linear/GitHub webhooks must reach it unauthenticated.

## Development

```bash
npm install
npm run dev:server        # tsc --watch for the API
npm run dev:web           # Vite dev server on :5173, proxies /api → :8899
npm test                  # server unit tests (vitest)
```

The API (all under `/api`, cookie-authenticated except auth endpoints):

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/login` / `logout`, `GET /api/auth/me` | Session management |
| `GET /api/config` | `config.json`, secrets masked |
| `PUT /api/config` | Validate → backup → atomic write (409 on disk conflict, 422 on validation failure) |
| `GET /api/status` | Proxies the Cyrus daemon's `/status` and `/version` |

## Roadmap

- Session browser: list agent sessions from `~/.cyrus/state/edge-worker-state.json` with live transcript tailing from `~/.cyrus/logs/`
- Maintenance: worktree cleanup, backup restore, guarded daemon restart
- `.env` editor with restart-required indicators
