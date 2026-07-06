import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { env } from "./env.js";

/**
 * Placeholder sent to the browser instead of secret values. When it comes
 * back unchanged in a PUT, the on-disk value is restored server-side, so
 * secrets never round-trip through the client.
 */
export const SECRET_SENTINEL = "__CYRUS_UI_SECRET_UNCHANGED__";

const SECRET_KEYS = new Set([
	"linearToken",
	"linearRefreshToken",
	"ngrokAuthToken",
]);

export class ConflictError extends Error {}

export interface ConfigSnapshot {
	exists: boolean;
	mtimeMs: number | null;
	indent: string;
	config: Record<string, unknown>;
}

export function configPath(): string {
	return join(env.cyrusHome, "config.json");
}

export function readConfig(): ConfigSnapshot {
	const path = configPath();
	if (!existsSync(path)) {
		return { exists: false, mtimeMs: null, indent: "\t", config: {} };
	}
	const raw = readFileSync(path, "utf8");
	const config = JSON.parse(raw) as Record<string, unknown>;
	const indent = raw.includes("\n\t") ? "\t" : "  ";
	return { exists: true, mtimeMs: statSync(path).mtimeMs, indent, config };
}

export function maskSecrets<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map((item) => maskSecrets(item)) as T;
	}
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
			if (SECRET_KEYS.has(key) && typeof v === "string" && v.length > 0) {
				out[key] = SECRET_SENTINEL;
			} else {
				out[key] = maskSecrets(v);
			}
		}
		return out as T;
	}
	return value;
}

/**
 * Walks the edited config and replaces sentinel values with the current
 * on-disk values at the same location. Arrays of objects with an `id`
 * field (e.g. repositories) are matched by id so reordering is safe.
 */
export function restoreSecrets(edited: unknown, current: unknown): unknown {
	if (Array.isArray(edited)) {
		const currentArr = Array.isArray(current) ? current : [];
		const byId = new Map<string, unknown>();
		for (const item of currentArr) {
			const id = (item as { id?: unknown } | null)?.id;
			if (typeof id === "string") byId.set(id, item);
		}
		return edited.map((item, i) => {
			const id = (item as { id?: unknown } | null)?.id;
			const match =
				typeof id === "string" && byId.has(id) ? byId.get(id) : currentArr[i];
			return restoreSecrets(item, match);
		});
	}
	if (edited && typeof edited === "object") {
		const cur =
			current && typeof current === "object" && !Array.isArray(current)
				? (current as Record<string, unknown>)
				: {};
		const out: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(
			edited as Record<string, unknown>,
		)) {
			if (value === SECRET_SENTINEL) {
				// Restore the real value; a sentinel with nothing to restore is dropped.
				if (typeof cur[key] === "string") out[key] = cur[key];
			} else {
				out[key] = restoreSecrets(value, cur[key]);
			}
		}
		return out;
	}
	return edited;
}

export function writeConfig(
	config: Record<string, unknown>,
	expectedMtimeMs: number | null,
	indent: string,
): { mtimeMs: number; backupPath: string | null } {
	const path = configPath();
	const exists = existsSync(path);
	if (exists && expectedMtimeMs !== null) {
		const actual = statSync(path).mtimeMs;
		if (Math.abs(actual - expectedMtimeMs) > 0.001) {
			throw new ConflictError(
				"config.json changed on disk since it was loaded",
			);
		}
	}
	mkdirSync(env.cyrusHome, { recursive: true });
	let backupPath: string | null = null;
	if (exists) {
		// Same naming convention Cyrus itself uses for API-requested backups.
		backupPath = join(env.cyrusHome, `config.backup-${Date.now()}.json`);
		copyFileSync(path, backupPath);
	}
	const tmpPath = `${path}.cyrus-ui-tmp`;
	writeFileSync(tmpPath, `${JSON.stringify(config, null, indent)}\n`, {
		mode: 0o600,
	});
	renameSync(tmpPath, path);
	return { mtimeMs: statSync(path).mtimeMs, backupPath };
}
