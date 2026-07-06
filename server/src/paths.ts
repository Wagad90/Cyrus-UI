import { resolve, sep } from "node:path";

/**
 * Resolves `rel` inside `base` and rejects any path that escapes it
 * (traversal via .., absolute paths, etc.).
 */
export function safeResolve(base: string, rel: string): string {
	const full = resolve(base, rel);
	const root = resolve(base);
	if (full !== root && !full.startsWith(root + sep)) {
		throw new Error("Path escapes allowed directory");
	}
	return full;
}
