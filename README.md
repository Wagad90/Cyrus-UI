# Cyrus Control UI

A self-hosted web control room for a [Cyrus](https://github.com/cyrusagents/cyrus) agent instance. It runs beside the `cyrus` daemon on the same machine and gives you — from any browser, via your existing Cloudflare tunnel — live visibility into what your agent is doing and full visual control over how it's configured.

Because Cyrus hot-reloads its config file, every config change you save here **applies to the running agent instantly — no restart needed**.

## Features

| Tab | What it does |
|---|---|
| **Overview** | Daemon state (idle/busy/unreachable), Cyrus version (with drift note), repositories, Linear workspaces |
| **Sessions** | Every agent session from Cyrus's state file: status, issue, runner, model, cost — with a per-session activity timeline and a **live-tailing raw transcript viewer** |
| **Usage** | Token/cost stats aggregated from session transcripts, by day / model / workspace |
| **Global Settings** | Default runner (claude/gemini/codex/cursor), per-runner default models, prompt-mode tool defaults, behaviour toggles, **sandbox/egress policy editor** |
| **Repositories** | Per-repo issue routing (labels/projects/teams), model overrides, tool permissions, and the label → AI mode mapping (debugger/builder/scoper/orchestrator) |
| **Access Control** | Allowed/blocked Linear users, block behaviour and message |
| **MCP Servers** | View/edit the MCP config files referenced by your config (JSON-validated; only referenced paths are touchable) |
| **Environment** | Edit `~/.cyrus/.env` with secret masking and restart-required indicators |
| **Maintenance** | Guarded daemon restart (refuses while a session runs), **add repository** (clone + register, like `cyrus self-add-repo`), worktree cleanup with disk usage, config backup browser with restore/prune |
| **Raw JSON** | The full config with a red/green diff preview before every save |

### Safety model

- **Nothing is written without review** — config saves show a diff of exactly what changes
- **Timestamped backup** before every write, atomic writes, one-click restore
- **Unknown fields are preserved** — the UI never strips config keys it doesn't know, so it stays safe across Cyrus upgrades
- **Secrets never reach the browser** — Linear tokens in config.json and sensitive `.env` values are masked in API responses and restored server-side on save
- **Conflict detection** — a save is rejected (not clobbered) if the file changed on disk since you loaded it
- **Scoped file access** — transcript reads are locked to `~/.cyrus/logs`, MCP edits to config-referenced paths, worktree removal to paths git itself lists
- **Loopback-only** — binds to `127.0.0.1`; the only way in is the Cloudflare-Access-protected tunnel hostname, then the app's password login (scrypt-hashed, rate-limited, httpOnly session cookie)

## Requirements

- Node.js 20+ on the machine that runs the `cyrus` daemon
- A working Cyrus self-hosted setup (`~/.cyrus/config.json` exists)
- For remote access: the Cloudflare tunnel you already use for Cyrus webhooks

## Install (wizard)

Install as the **same user that runs the `cyrus` daemon**. One command does everything:

```bash
git clone https://github.com/Wagad90/Cyrus-UI.git ~/cyrus-ui
cd ~/cyrus-ui
./deploy/install.sh
```

The wizard checks prerequisites, builds, asks for a port and password, installs + starts the systemd service (generated with your user/paths/node binary), optionally adds the sudoers rule that powers the Restart button, and health-checks the result. **Re-run it after `git pull` to update** — it keeps your password and restarts the service.

Prefer `/opt`? `sudo mkdir -p /opt/cyrus-ui && sudo chown "$USER" /opt/cyrus-ui` first, then clone there.

### Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `CYRUS_UI_PORT` | `8899` | Port the UI listens on |
| `CYRUS_UI_HOST` | `127.0.0.1` | Bind address — keep loopback; the tunnel connects locally |
| `CYRUS_HOME` | `~/.cyrus` | Cyrus home (config, state, logs, repos, worktrees) |
| `CYRUS_SERVER_PORT` | `3456` | Cyrus daemon port (status/version probes) |
| `CYRUS_UI_DATA_DIR` | `~/.cyrus-ui` | UI's own settings (password hash, session secret) |
| `CYRUS_UI_RESTART_CMD` | `sudo -n systemctl restart cyrus` | Restart command — set to `pm2 restart cyrus` etc. for non-systemd setups |
| `CYRUS_UI_CYRUS_SERVICE` | `cyrus` | systemd unit name shown in daemon status |
| `CYRUS_UI_INSECURE_COOKIE` | unset | Set `1` only for plain-HTTP LAN testing |

Change the password any time: `npm run set-password` (in this directory).

## Expose via your existing Cloudflare tunnel

One `cloudflared` tunnel serves multiple public hostnames — no second tunnel needed:

1. <https://one.dash.cloudflare.com> → **Networks → Tunnels** → your Cyrus tunnel → **Public Hostname** → **Add a public hostname**
2. Subdomain `cyrus-ui`, your domain, Type **HTTP**, URL `localhost:8899`
3. **Access → Applications → Add an application → Self-hosted** for `cyrus-ui.yourdomain.com`, policy Allow → Emails → your email

Visitors authenticate with Cloudflare first, then the UI password. Don't put an Access policy on the Cyrus webhook hostname itself — Linear/GitHub webhooks must reach it unauthenticated.

## Development

```bash
npm install
npm run dev:server        # tsc --watch for the API
npm run dev:web           # Vite dev server on :5173, proxies /api → :8899
npm test                  # server unit tests (vitest)
```

### API overview

All under `/api`, cookie-authenticated except the auth endpoints themselves:

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Config | `GET/PUT /api/config` (masked secrets, validate → backup → atomic write, 409 on conflict, 422 on invalid) |
| Status | `GET /api/status`, `GET /api/daemon`, `POST /api/daemon/restart` |
| Sessions | `GET /api/sessions`, `GET /api/sessions/:id`, `GET /api/transcripts`, `GET /api/transcripts/tail` |
| Usage | `GET /api/usage` |
| Repos | `POST /api/repos/clone`, `GET /api/jobs/:id` |
| Worktrees | `GET /api/worktrees`, `POST /api/worktrees/remove` |
| Backups | `GET /api/backups`, `GET /api/backups/:name`, `POST /api/backups/:name/restore`, `DELETE /api/backups/:name`, `POST /api/backups/prune` |
| Env | `GET/PUT /api/env` |
| MCP | `GET /api/mcp/files`, `GET/PUT /api/mcp/file` |
