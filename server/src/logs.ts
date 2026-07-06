import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { env } from "./env.js";
import { safeResolve } from "./paths.js";

export function logsDir(): string {
	return join(env.cyrusHome, "logs");
}

export interface TranscriptFile {
	rel: string;
	workspace: string;
	name: string;
	kind: "md" | "jsonl";
	sizeBytes: number;
	mtimeMs: number;
}

export function listTranscriptFiles(): TranscriptFile[] {
	const root = logsDir();
	if (!existsSync(root)) return [];
	const out: TranscriptFile[] = [];
	for (const workspace of readdirSync(root)) {
		const wsDir = join(root, workspace);
		let files: string[];
		try {
			files = readdirSync(wsDir);
		} catch {
			continue; // not a directory
		}
		for (const name of files) {
			if (!/\.(md|jsonl)$/.test(name)) continue;
			try {
				const st = statSync(join(wsDir, name));
				out.push({
					rel: `${workspace}/${name}`,
					workspace,
					name,
					kind: name.endsWith(".md") ? "md" : "jsonl",
					sizeBytes: st.size,
					mtimeMs: st.mtimeMs,
				});
			} catch {
				// file vanished mid-listing
			}
		}
	}
	out.sort((a, b) => b.mtimeMs - a.mtimeMs);
	return out;
}

const MAX_CHUNK = 256 * 1024;
/** For the first request on a big file, start this far from the end. */
const INITIAL_WINDOW = 64 * 1024;

export interface TailResult {
	content: string;
	nextOffset: number;
	sizeBytes: number;
	/** True when this response started mid-file (offset > 0 on first read). */
	startedMidFile: boolean;
}

/**
 * Incremental reader for live-tailing transcripts. Pass back `nextOffset`
 * on each poll; content grows append-only. If the file shrank (rotation),
 * reading restarts from 0.
 */
export function tailFile(rel: string, offset: number | null): TailResult {
	const full = safeResolve(logsDir(), rel);
	const size = statSync(full).size;
	let start = offset ?? Math.max(0, size - INITIAL_WINDOW);
	if (start > size) start = 0; // file was truncated/rotated
	const length = Math.min(size - start, MAX_CHUNK);
	let content = "";
	if (length > 0) {
		const fd = openSync(full, "r");
		try {
			const buf = Buffer.alloc(length);
			const read = readSync(fd, buf, 0, length, start);
			content = buf.subarray(0, read).toString("utf8");
		} finally {
			closeSync(fd);
		}
	}
	return {
		content,
		nextOffset: start + Buffer.byteLength(content),
		sizeBytes: size,
		startedMidFile: offset === null && start > 0,
	};
}
