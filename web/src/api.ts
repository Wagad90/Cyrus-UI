import type {
	BackupInfo,
	ConfigResponse,
	CyrusConfig,
	DaemonInfo,
	EnvEntry,
	McpFileInfo,
	RepoJob,
	RepoWorktrees,
	SessionDetail,
	SessionSummary,
	SkillScope,
	SkillsList,
	StatusResponse,
	TailResult,
	UsageReport,
} from "./types";

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
		public payload?: unknown,
	) {
		super(message);
	}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(path, {
		...init,
		headers: {
			// Only claim a JSON body when there is one — Fastify 400s a
			// bodyless DELETE that carries a JSON content-type.
			...(init?.body ? { "Content-Type": "application/json" } : {}),
			...init?.headers,
		},
	});
	if (!res.ok) {
		let message = `Request failed (${res.status})`;
		let payload: unknown;
		try {
			payload = await res.json();
			const err = (payload as { error?: string }).error;
			if (err) message = err;
		} catch {
			// non-JSON error body
		}
		throw new ApiError(res.status, message, payload);
	}
	return res.json() as Promise<T>;
}

export const api = {
	me: () =>
		request<{ authenticated: boolean; passwordConfigured: boolean }>(
			"/api/auth/me",
		),
	login: (password: string) =>
		request<{ ok: true }>("/api/auth/login", {
			method: "POST",
			body: JSON.stringify({ password }),
		}),
	logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
	getConfig: () => request<ConfigResponse>("/api/config"),
	putConfig: (config: CyrusConfig, baseMtimeMs: number | null) =>
		request<{ ok: true; mtimeMs: number; backupPath: string | null }>(
			"/api/config",
			{
				method: "PUT",
				body: JSON.stringify({ config, baseMtimeMs }),
			},
		),
	status: () => request<StatusResponse>("/api/status"),
	sessions: () =>
		request<{ savedAt: string | null; sessions: SessionSummary[] }>(
			"/api/sessions",
		),
	session: (id: string) =>
		request<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`),
	tail: (path: string, offset: number | null) =>
		request<TailResult>(
			`/api/transcripts/tail?path=${encodeURIComponent(path)}${
				offset !== null ? `&offset=${offset}` : ""
			}`,
		),
	usage: () => request<UsageReport>("/api/usage"),
	daemon: () => request<DaemonInfo>("/api/daemon"),
	restartDaemon: (force: boolean) =>
		request<{ ok: true; output: string }>("/api/daemon/restart", {
			method: "POST",
			body: JSON.stringify({ force }),
		}),
	worktrees: () => request<{ repos: RepoWorktrees[] }>("/api/worktrees"),
	removeWorktree: (repoId: string, path: string) =>
		request<{ ok: true }>("/api/worktrees/remove", {
			method: "POST",
			body: JSON.stringify({ repoId, path }),
		}),
	backups: () => request<{ backups: BackupInfo[] }>("/api/backups"),
	backup: (name: string) =>
		request<{ name: string; config: CyrusConfig }>(
			`/api/backups/${encodeURIComponent(name)}`,
		),
	restoreBackup: (name: string) =>
		request<{ ok: true; backupPath: string | null }>(
			`/api/backups/${encodeURIComponent(name)}/restore`,
			{ method: "POST" },
		),
	deleteBackup: (name: string) =>
		request<{ ok: true }>(`/api/backups/${encodeURIComponent(name)}`, {
			method: "DELETE",
		}),
	pruneBackups: (keep: number) =>
		request<{ ok: true; deleted: number }>("/api/backups/prune", {
			method: "POST",
			body: JSON.stringify({ keep }),
		}),
	cloneRepo: (input: {
		url: string;
		name?: string;
		baseBranch?: string;
		routingLabels?: string[];
	}) =>
		request<{ jobId: string }>("/api/repos/clone", {
			method: "POST",
			body: JSON.stringify(input),
		}),
	job: (id: string) => request<RepoJob>(`/api/jobs/${encodeURIComponent(id)}`),
	env: () =>
		request<{ exists: boolean; path: string; entries: EnvEntry[] }>(
			"/api/env",
		),
	saveEnv: (entries: { key: string; value: string | null }[]) =>
		request<{ ok: true; restartRequired: boolean }>("/api/env", {
			method: "PUT",
			body: JSON.stringify({ entries }),
		}),
	mcpFiles: () => request<{ files: McpFileInfo[] }>("/api/mcp/files"),
	mcpFile: (path: string) =>
		request<{ path: string; content: string }>(
			`/api/mcp/file?path=${encodeURIComponent(path)}`,
		),
	saveMcpFile: (path: string, content: string) =>
		request<{ ok: true }>("/api/mcp/file", {
			method: "PUT",
			body: JSON.stringify({ path, content }),
		}),
	skills: () => request<SkillsList>("/api/skill-files"),
	skill: (root: "default" | "user", name: string) =>
		request<{ root: string; name: string; content: string; scope: SkillScope | null }>(
			`/api/skill-files/${root}/${encodeURIComponent(name)}`,
		),
	saveSkill: (
		root: "default" | "user",
		name: string,
		content: string,
		scope?: SkillScope | null,
	) =>
		request<{ ok: true }>(
			`/api/skill-files/${root}/${encodeURIComponent(name)}`,
			{ method: "PUT", body: JSON.stringify({ content, scope }) },
		),
	deleteSkill: (root: "default" | "user", name: string) =>
		request<{ ok: true }>(
			`/api/skill-files/${root}/${encodeURIComponent(name)}`,
			{ method: "DELETE" },
		),
	resetDefaultSkills: () =>
		request<{ ok: true; note: string }>("/api/skill-files/reset-defaults", {
			method: "POST",
		}),
};
