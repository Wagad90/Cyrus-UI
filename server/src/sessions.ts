import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { env } from "./env.js";

/**
 * Readers for Cyrus's runtime session state:
 *   <cyrusHome>/state/edge-worker-state.json   (PersistenceManager v4.0)
 * Shape: { version, savedAt, state: { agentSessions, agentSessionEntries,
 *          childToParentAgentSession, issueRepositoryCache } }
 */

interface RawSession {
	id?: string;
	status?: string;
	createdAt?: number;
	updatedAt?: number;
	issueContext?: {
		trackerId?: string;
		issueId?: string;
		issueIdentifier?: string;
	};
	issue?: {
		identifier?: string;
		title?: string;
		branchName?: string;
	};
	repositories?: { repositoryId?: string; branchName?: string }[];
	workspace?: { path?: string };
	claudeSessionId?: string;
	geminiSessionId?: string;
	codexSessionId?: string;
	cursorSessionId?: string;
	metadata?: {
		model?: string;
		totalCostUsd?: number;
	};
}

interface RawEntry {
	type?: string;
	content?: string;
	metadata?: {
		toolName?: string;
		timestamp?: number;
		durationMs?: number;
		isError?: boolean;
		toolResultError?: boolean;
	};
}

interface RawStateFile {
	version?: string;
	savedAt?: string;
	state?: {
		agentSessions?: Record<string, RawSession>;
		agentSessionEntries?: Record<string, RawEntry[]>;
		childToParentAgentSession?: Record<string, string>;
	};
}

export interface SessionSummary {
	id: string;
	status: string;
	createdAt: number | null;
	updatedAt: number | null;
	issueIdentifier: string | null;
	issueTitle: string | null;
	tracker: string | null;
	repositoryIds: string[];
	branchName: string | null;
	workspacePath: string | null;
	workspaceName: string | null;
	runner: "claude" | "gemini" | "codex" | "cursor" | null;
	runnerSessionId: string | null;
	model: string | null;
	totalCostUsd: number | null;
	entryCount: number;
	parentId: string | null;
}

export interface SessionEntry {
	type: string;
	content: string;
	toolName: string | null;
	timestamp: number | null;
	durationMs: number | null;
	isError: boolean;
}

const MAX_ENTRY_CONTENT = 20_000;

function stateFilePath(): string {
	return join(env.cyrusHome, "state", "edge-worker-state.json");
}

function readStateFile(): RawStateFile | null {
	const path = stateFilePath();
	if (!existsSync(path)) return null;
	return JSON.parse(readFileSync(path, "utf8")) as RawStateFile;
}

function detectRunner(raw: RawSession): {
	runner: SessionSummary["runner"];
	runnerSessionId: string | null;
} {
	if (raw.claudeSessionId)
		return { runner: "claude", runnerSessionId: raw.claudeSessionId };
	if (raw.geminiSessionId)
		return { runner: "gemini", runnerSessionId: raw.geminiSessionId };
	if (raw.codexSessionId)
		return { runner: "codex", runnerSessionId: raw.codexSessionId };
	if (raw.cursorSessionId)
		return { runner: "cursor", runnerSessionId: raw.cursorSessionId };
	return { runner: null, runnerSessionId: null };
}

function toSummary(
	id: string,
	raw: RawSession,
	entries: RawEntry[] | undefined,
	parents: Record<string, string>,
): SessionSummary {
	const workspacePath = raw.workspace?.path ?? null;
	return {
		id,
		status: raw.status ?? "unknown",
		createdAt: raw.createdAt ?? null,
		updatedAt: raw.updatedAt ?? null,
		issueIdentifier:
			raw.issueContext?.issueIdentifier ?? raw.issue?.identifier ?? null,
		issueTitle: raw.issue?.title ?? null,
		tracker: raw.issueContext?.trackerId ?? null,
		repositoryIds: (raw.repositories ?? [])
			.map((r) => r.repositoryId)
			.filter((r): r is string => typeof r === "string"),
		branchName:
			raw.repositories?.[0]?.branchName ?? raw.issue?.branchName ?? null,
		workspacePath,
		workspaceName: workspacePath ? basename(workspacePath) : null,
		...detectRunner(raw),
		model: raw.metadata?.model ?? null,
		totalCostUsd: raw.metadata?.totalCostUsd ?? null,
		entryCount: entries?.length ?? 0,
		parentId: parents[id] ?? null,
	};
}

export function listSessions(): {
	savedAt: string | null;
	sessions: SessionSummary[];
} {
	const file = readStateFile();
	if (!file?.state) return { savedAt: null, sessions: [] };
	const sessions = Object.entries(file.state.agentSessions ?? {}).map(
		([id, raw]) =>
			toSummary(
				id,
				raw,
				file.state?.agentSessionEntries?.[id],
				file.state?.childToParentAgentSession ?? {},
			),
	);
	sessions.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
	return { savedAt: file.savedAt ?? null, sessions };
}

export interface TranscriptRef {
	rel: string;
	name: string;
	kind: "md" | "jsonl";
	sizeBytes: number;
	mtimeMs: number;
}

/** Finds transcript files for a session by runner session id / workspace dir. */
export function findTranscripts(summary: SessionSummary): TranscriptRef[] {
	const logsDir = join(env.cyrusHome, "logs");
	if (!existsSync(logsDir)) return [];
	const dirs = summary.workspaceName
		? [summary.workspaceName]
		: readdirSync(logsDir);
	const out: TranscriptRef[] = [];
	for (const dir of dirs) {
		const wsDir = join(logsDir, dir);
		let files: string[];
		try {
			files = readdirSync(wsDir);
		} catch {
			continue;
		}
		for (const file of files) {
			if (!/\.(md|jsonl)$/.test(file)) continue;
			// Match on the runner session id when we have one; otherwise take
			// everything in the session's workspace directory.
			if (
				summary.runnerSessionId &&
				!file.includes(summary.runnerSessionId)
			) {
				continue;
			}
			const full = join(wsDir, file);
			const st = statSync(full);
			out.push({
				rel: `${dir}/${file}`,
				name: file,
				kind: file.endsWith(".md") ? "md" : "jsonl",
				sizeBytes: st.size,
				mtimeMs: st.mtimeMs,
			});
		}
	}
	out.sort((a, b) => b.mtimeMs - a.mtimeMs);
	return out;
}

export function getSession(id: string): {
	session: SessionSummary;
	entries: SessionEntry[];
	transcripts: TranscriptRef[];
} | null {
	const file = readStateFile();
	const raw = file?.state?.agentSessions?.[id];
	if (!file?.state || !raw) return null;
	const rawEntries = file.state.agentSessionEntries?.[id] ?? [];
	const session = toSummary(
		id,
		raw,
		rawEntries,
		file.state.childToParentAgentSession ?? {},
	);
	const entries: SessionEntry[] = rawEntries.map((entry) => ({
		type: entry.type ?? "unknown",
		content:
			(entry.content ?? "").length > MAX_ENTRY_CONTENT
				? `${(entry.content ?? "").slice(0, MAX_ENTRY_CONTENT)}\n… [truncated]`
				: (entry.content ?? ""),
		toolName: entry.metadata?.toolName ?? null,
		timestamp: entry.metadata?.timestamp ?? null,
		durationMs: entry.metadata?.durationMs ?? null,
		isError: Boolean(
			entry.metadata?.isError || entry.metadata?.toolResultError,
		),
	}));
	return { session, entries, transcripts: findTranscripts(session) };
}
