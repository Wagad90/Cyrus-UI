import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { readConfig } from "./cyrusConfig.js";

/**
 * Read/write access to MCP config files — but ONLY paths that the Cyrus
 * config actually references (repositories[].mcpConfigPath and the global
 * slack/linear/github McpConfigs lists). That keeps this endpoint from
 * being an arbitrary-file read/write primitive.
 */

export interface McpFileInfo {
	path: string;
	exists: boolean;
	sizeBytes: number | null;
	mtimeMs: number | null;
	referencedBy: string[];
}

function collectReferences(): Map<string, string[]> {
	const { config } = readConfig();
	const refs = new Map<string, string[]>();
	const addRef = (path: unknown, source: string) => {
		if (typeof path !== "string" || !path.trim()) return;
		const abs = isAbsolute(path) ? resolve(path) : null;
		if (!abs) return; // relative paths depend on repo cwd — skip
		refs.set(abs, [...(refs.get(abs) ?? []), source]);
	};
	const repos = (config.repositories ?? []) as Array<{
		name?: string;
		mcpConfigPath?: string | string[];
	}>;
	for (const repo of repos) {
		const source = `repository: ${repo.name ?? "?"}`;
		if (Array.isArray(repo.mcpConfigPath)) {
			for (const p of repo.mcpConfigPath) addRef(p, source);
		} else {
			addRef(repo.mcpConfigPath, source);
		}
	}
	for (const field of [
		"slackMcpConfigs",
		"linearMcpConfigs",
		"githubMcpConfigs",
	] as const) {
		const list = config[field];
		if (Array.isArray(list)) {
			for (const p of list) addRef(p, field);
		}
	}
	return refs;
}

export function listMcpFiles(): McpFileInfo[] {
	return [...collectReferences().entries()].map(([path, referencedBy]) => {
		if (!existsSync(path)) {
			return { path, exists: false, sizeBytes: null, mtimeMs: null, referencedBy };
		}
		const st = statSync(path);
		return {
			path,
			exists: true,
			sizeBytes: st.size,
			mtimeMs: st.mtimeMs,
			referencedBy,
		};
	});
}

function assertReferenced(path: string): string {
	const abs = resolve(path);
	if (!collectReferences().has(abs)) {
		throw new Error(
			"That path is not referenced by config.json — add it as an mcpConfigPath first",
		);
	}
	return abs;
}

export function readMcpFile(path: string): string {
	const abs = assertReferenced(path);
	if (!existsSync(abs)) return "";
	return readFileSync(abs, "utf8");
}

export function writeMcpFile(path: string, content: string): void {
	const abs = assertReferenced(path);
	const parsed = JSON.parse(content); // throws on invalid JSON
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error("MCP config must be a JSON object");
	}
	writeFileSync(abs, content.endsWith("\n") ? content : `${content}\n`, {
		mode: 0o600,
	});
}
