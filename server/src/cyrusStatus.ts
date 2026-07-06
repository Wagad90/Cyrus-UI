import { env } from "./env.js";

async function fetchJson(
	path: string,
	timeoutMs = 1500,
): Promise<unknown | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(`http://127.0.0.1:${env.cyrusPort}${path}`, {
			signal: controller.signal,
		});
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

export interface CyrusStatus {
	reachable: boolean;
	status: string | null;
	version: string | null;
	port: number;
}

export async function cyrusStatus(): Promise<CyrusStatus> {
	const [status, version] = await Promise.all([
		fetchJson("/status"),
		fetchJson("/version"),
	]);
	return {
		reachable: status !== null || version !== null,
		status: (status as { status?: string } | null)?.status ?? null,
		version:
			(version as { cyrus_cli_version?: string } | null)?.cyrus_cli_version ??
			null,
		port: env.cyrusPort,
	};
}
