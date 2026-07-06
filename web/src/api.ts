import type {
	ConfigResponse,
	CyrusConfig,
	SessionDetail,
	SessionSummary,
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
		headers: { "Content-Type": "application/json" },
		...init,
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
};
