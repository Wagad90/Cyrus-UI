import { homedir } from "node:os";
import { resolve } from "node:path";

function int(value: string | undefined, fallback: number): number {
	const n = value ? Number.parseInt(value, 10) : Number.NaN;
	return Number.isFinite(n) ? n : fallback;
}

export const env = {
	/** Port the UI listens on. */
	port: int(process.env.CYRUS_UI_PORT, 8899),
	/** Loopback by default: only the Cloudflare tunnel (same host) can reach it. */
	host: process.env.CYRUS_UI_HOST ?? "127.0.0.1",
	/** Where the Cyrus daemon keeps config.json, state, logs. */
	cyrusHome: resolve(process.env.CYRUS_HOME ?? resolve(homedir(), ".cyrus")),
	/** Port the Cyrus daemon's shared server listens on (for /status, /version). */
	cyrusPort: int(process.env.CYRUS_SERVER_PORT, 3456),
	/** Where the UI keeps its own settings (password hash, session secret). */
	dataDir: resolve(
		process.env.CYRUS_UI_DATA_DIR ?? resolve(homedir(), ".cyrus-ui"),
	),
	/** Set CYRUS_UI_INSECURE_COOKIE=1 only when testing over plain http on a LAN IP. */
	insecureCookie: process.env.CYRUS_UI_INSECURE_COOKIE === "1",
};
