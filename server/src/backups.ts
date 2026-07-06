import {
	existsSync,
	readFileSync,
	readdirSync,
	statSync,
	unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { readConfig, writeConfig } from "./cyrusConfig.js";
import { env } from "./env.js";

const BACKUP_RE = /^config\.backup-\d+\.json$/;

export interface BackupInfo {
	name: string;
	sizeBytes: number;
	mtimeMs: number;
}

function assertValidName(name: string): void {
	if (!BACKUP_RE.test(name)) throw new Error("Invalid backup name");
}

export function listBackups(): BackupInfo[] {
	if (!existsSync(env.cyrusHome)) return [];
	return readdirSync(env.cyrusHome)
		.filter((f) => BACKUP_RE.test(f))
		.map((name) => {
			const st = statSync(join(env.cyrusHome, name));
			return { name, sizeBytes: st.size, mtimeMs: st.mtimeMs };
		})
		.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export function readBackup(name: string): Record<string, unknown> {
	assertValidName(name);
	return JSON.parse(
		readFileSync(join(env.cyrusHome, name), "utf8"),
	) as Record<string, unknown>;
}

/**
 * Restores a backup as the live config. The current config is itself
 * backed up first (writeConfig always does), so a restore is reversible.
 */
export function restoreBackup(name: string): { backupPath: string | null } {
	const content = readBackup(name);
	const { indent } = readConfig();
	const result = writeConfig(content, null, indent);
	return { backupPath: result.backupPath };
}

export function deleteBackup(name: string): void {
	assertValidName(name);
	unlinkSync(join(env.cyrusHome, name));
}

/** Deletes all but the newest `keep` backups; returns how many were removed. */
export function pruneBackups(keep: number): number {
	const backups = listBackups();
	const toDelete = backups.slice(Math.max(0, keep));
	for (const backup of toDelete) deleteBackup(backup.name);
	return toDelete.length;
}
