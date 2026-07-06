/** Sets a key, or removes it when the value is empty — keeps config.json minimal. */
export function setOrDelete(
	obj: Record<string, unknown>,
	key: string,
	value: unknown,
): void {
	const empty =
		value === undefined ||
		value === null ||
		value === "" ||
		(Array.isArray(value) && value.length === 0);
	if (empty) {
		delete obj[key];
	} else {
		obj[key] = value;
	}
}

export function formatTime(ms: number | null | undefined): string {
	if (!ms) return "—";
	return new Date(ms).toLocaleString();
}

export function timeAgo(ms: number | null | undefined): string {
	if (!ms) return "—";
	const diff = Date.now() - ms;
	if (diff < 60_000) return "just now";
	const mins = Math.floor(diff / 60_000);
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	return new Date(ms).toLocaleDateString();
}

export function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatUsd(n: number | null | undefined): string {
	if (n === null || n === undefined) return "—";
	return `$${n.toFixed(n >= 10 ? 2 : 3)}`;
}

export function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}
