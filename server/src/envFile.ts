import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "./env.js";

/**
 * Editor for ~/.cyrus/.env (the file the cyrus CLI loads at startup).
 * Values for sensitive-looking keys never reach the browser: they're sent
 * as null with masked=true, and a null value on save means "keep what's
 * on disk". Comments, blank lines, and key order are preserved.
 */

export const ENV_MASKED = null;

const SENSITIVE_RE = /(TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL)/i;

export interface EnvEntry {
	key: string;
	/** null when masked (sensitive) — real value never leaves the server */
	value: string | null;
	masked: boolean;
}

export function envFilePath(): string {
	return join(env.cyrusHome, ".env");
}

function parseLines(content: string): {
	lines: string[];
	entries: Map<string, { value: string; lineIndex: number }>;
} {
	const lines = content.split("\n");
	const entries = new Map<string, { value: string; lineIndex: number }>();
	lines.forEach((line, lineIndex) => {
		const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (match) {
			entries.set(match[1] as string, {
				value: match[2] as string,
				lineIndex,
			});
		}
	});
	return { lines, entries };
}

export function readEnvFile(): {
	exists: boolean;
	path: string;
	entries: EnvEntry[];
} {
	const path = envFilePath();
	if (!existsSync(path)) return { exists: false, path, entries: [] };
	const { entries } = parseLines(readFileSync(path, "utf8"));
	return {
		exists: true,
		path,
		entries: [...entries.entries()].map(([key, { value }]) => {
			const masked = SENSITIVE_RE.test(key);
			return { key, value: masked ? ENV_MASKED : value, masked };
		}),
	};
}

/**
 * Rewrites .env to contain exactly the provided entries. A null value
 * keeps the current on-disk value (that's how masked entries round-trip).
 * Existing lines keep their position and surrounding comments; removed
 * keys drop their line; new keys are appended.
 */
export function writeEnvFile(
	desired: { key: string; value: string | null }[],
): void {
	const path = envFilePath();
	const current = existsSync(path)
		? parseLines(readFileSync(path, "utf8"))
		: { lines: [] as string[], entries: new Map<string, { value: string; lineIndex: number }>() };

	for (const entry of desired) {
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(entry.key)) {
			throw new Error(`Invalid env key: ${entry.key}`);
		}
		if (entry.value !== null && /[\n\r]/.test(entry.value)) {
			throw new Error(`Value for ${entry.key} must be a single line`);
		}
	}

	const desiredKeys = new Set(desired.map((e) => e.key));
	const output: string[] = [];
	// Keep original lines, updating or dropping KEY= lines.
	current.lines.forEach((line, index) => {
		const found = [...current.entries.entries()].find(
			([, meta]) => meta.lineIndex === index,
		);
		if (!found) {
			output.push(line); // comment / blank / non-assignment line
			return;
		}
		const [key, meta] = found;
		if (!desiredKeys.has(key)) return; // key removed
		const wanted = desired.find((e) => e.key === key) as {
			key: string;
			value: string | null;
		};
		output.push(`${key}=${wanted.value === null ? meta.value : wanted.value}`);
	});
	// Append new keys.
	for (const entry of desired) {
		if (!current.entries.has(entry.key)) {
			if (entry.value === null) continue; // masked-but-new makes no sense
			output.push(`${entry.key}=${entry.value}`);
		}
	}
	// Drop trailing empties, end with exactly one newline.
	while (output.length && output[output.length - 1] === "") output.pop();
	const tmp = `${path}.cyrus-ui-tmp`;
	writeFileSync(tmp, `${output.join("\n")}\n`, { mode: 0o600 });
	renameSync(tmp, path);
}
