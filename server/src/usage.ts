import { createReadStream } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { listTranscriptFiles, logsDir } from "./logs.js";

/**
 * Aggregates token/cost usage from the JSONL transcripts Cyrus writes for
 * every runner session. Lines look like:
 *   { type: "session-metadata", sessionId, workspaceName, timestamp, ... }
 *   { type: "sdk-message", message: <SDK message>, timestamp }
 * Cost/usage comes from messages with message.type === "result"
 * (total_cost_usd + usage totals); the model is taken from assistant
 * messages. Files are parsed once and cached by (size, mtime).
 */

interface FileUsage {
	costUsd: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreationTokens: number;
	model: string | null;
	workspace: string;
	day: string; // YYYY-MM-DD of last activity in file
	sessionRuns: number;
}

const cache = new Map<string, { sizeBytes: number; mtimeMs: number; usage: FileUsage }>();

async function parseFile(
	rel: string,
	workspace: string,
): Promise<FileUsage> {
	const usage: FileUsage = {
		costUsd: 0,
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheCreationTokens: 0,
		model: null,
		workspace,
		day: "unknown",
		sessionRuns: 0,
	};
	const rlIface = createInterface({
		input: createReadStream(join(logsDir(), rel), { encoding: "utf8" }),
		crlfDelay: Number.POSITIVE_INFINITY,
	});
	for await (const line of rlIface) {
		if (!line.trim()) continue;
		let record: {
			type?: string;
			timestamp?: string;
			message?: {
				type?: string;
				total_cost_usd?: number;
				usage?: {
					input_tokens?: number;
					output_tokens?: number;
					cache_read_input_tokens?: number;
					cache_creation_input_tokens?: number;
				};
				message?: { model?: string };
			};
		};
		try {
			record = JSON.parse(line);
		} catch {
			continue; // partial last line of a live file
		}
		if (typeof record.timestamp === "string") {
			usage.day = record.timestamp.slice(0, 10);
		}
		const message = record.message;
		if (record.type !== "sdk-message" || !message) continue;
		if (message.type === "assistant" && message.message?.model) {
			usage.model = message.message.model;
		}
		if (message.type === "result") {
			usage.sessionRuns += 1;
			usage.costUsd += message.total_cost_usd ?? 0;
			usage.inputTokens += message.usage?.input_tokens ?? 0;
			usage.outputTokens += message.usage?.output_tokens ?? 0;
			usage.cacheReadTokens += message.usage?.cache_read_input_tokens ?? 0;
			usage.cacheCreationTokens +=
				message.usage?.cache_creation_input_tokens ?? 0;
		}
	}
	return usage;
}

export interface UsageBucket {
	costUsd: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreationTokens: number;
	sessionRuns: number;
}

export interface UsageReport {
	totals: UsageBucket;
	byDay: Record<string, UsageBucket>;
	byModel: Record<string, UsageBucket>;
	byWorkspace: Record<string, UsageBucket>;
	filesScanned: number;
}

function emptyBucket(): UsageBucket {
	return {
		costUsd: 0,
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheCreationTokens: 0,
		sessionRuns: 0,
	};
}

function add(bucket: UsageBucket, usage: FileUsage): void {
	bucket.costUsd += usage.costUsd;
	bucket.inputTokens += usage.inputTokens;
	bucket.outputTokens += usage.outputTokens;
	bucket.cacheReadTokens += usage.cacheReadTokens;
	bucket.cacheCreationTokens += usage.cacheCreationTokens;
	bucket.sessionRuns += usage.sessionRuns;
}

export async function usageReport(): Promise<UsageReport> {
	const files = listTranscriptFiles().filter((f) => f.kind === "jsonl");
	const report: UsageReport = {
		totals: emptyBucket(),
		byDay: {},
		byModel: {},
		byWorkspace: {},
		filesScanned: files.length,
	};
	for (const file of files) {
		let entry = cache.get(file.rel);
		if (
			!entry ||
			entry.sizeBytes !== file.sizeBytes ||
			entry.mtimeMs !== file.mtimeMs
		) {
			entry = {
				sizeBytes: file.sizeBytes,
				mtimeMs: file.mtimeMs,
				usage: await parseFile(file.rel, file.workspace),
			};
			cache.set(file.rel, entry);
		}
		const usage = entry.usage;
		add(report.totals, usage);
		add((report.byDay[usage.day] ??= emptyBucket()), usage);
		add((report.byModel[usage.model ?? "unknown"] ??= emptyBucket()), usage);
		add((report.byWorkspace[usage.workspace] ??= emptyBucket()), usage);
	}
	return report;
}
