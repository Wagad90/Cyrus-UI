import { exec } from "node:child_process";
import { promisify } from "node:util";
import { cyrusStatus } from "./cyrusStatus.js";

const execAsync = promisify(exec);

/**
 * Restarting the daemon shells out to a fixed command. Default requires a
 * sudoers rule (the install wizard offers to create it):
 *   <user> ALL=(root) NOPASSWD: /usr/bin/systemctl restart cyrus
 * Override with CYRUS_UI_RESTART_CMD (e.g. "pm2 restart cyrus").
 */
const RESTART_CMD =
	process.env.CYRUS_UI_RESTART_CMD ?? "sudo -n systemctl restart cyrus";
const SERVICE_NAME = process.env.CYRUS_UI_CYRUS_SERVICE ?? "cyrus";

export interface DaemonInfo {
	reachable: boolean;
	status: string | null;
	version: string | null;
	service: {
		known: boolean;
		activeState: string | null;
		sinceTimestamp: string | null;
	};
	restartCommand: string;
}

export async function daemonInfo(): Promise<DaemonInfo> {
	const cyrus = await cyrusStatus();
	let activeState: string | null = null;
	let sinceTimestamp: string | null = null;
	let known = false;
	try {
		const { stdout } = await execAsync(
			`systemctl show ${SERVICE_NAME} --property=ActiveState,ExecMainStartTimestamp`,
			{ timeout: 5000 },
		);
		for (const line of stdout.split("\n")) {
			const [key, ...rest] = line.split("=");
			const value = rest.join("=").trim();
			if (key === "ActiveState" && value) {
				activeState = value;
				known = value !== "inactive" || cyrus.reachable;
			}
			if (key === "ExecMainStartTimestamp" && value) sinceTimestamp = value;
		}
	} catch {
		// systemctl unavailable (non-systemd host) — that's fine
	}
	return {
		reachable: cyrus.reachable,
		status: cyrus.status,
		version: cyrus.version,
		service: { known, activeState, sinceTimestamp },
		restartCommand: RESTART_CMD,
	};
}

export class DaemonBusyError extends Error {}

export async function restartDaemon(
	force: boolean,
): Promise<{ output: string }> {
	const cyrus = await cyrusStatus();
	if (cyrus.reachable && cyrus.status === "busy" && !force) {
		throw new DaemonBusyError(
			"Cyrus is busy (a session is running). Restarting now would kill it — use force to restart anyway.",
		);
	}
	try {
		const { stdout, stderr } = await execAsync(RESTART_CMD, {
			timeout: 30_000,
		});
		return { output: `${stdout}${stderr}`.trim() };
	} catch (error) {
		const e = error as { stderr?: string; message?: string };
		throw new Error(
			`Restart command failed: ${e.stderr?.trim() || e.message || "unknown error"}. ` +
				`If this is a sudo permission error, re-run the install wizard to set up the sudoers rule.`,
		);
	}
}
