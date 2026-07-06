import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
	const salt = randomBytes(16).toString("hex");
	const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
	return `s1$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
	const parts = stored.split("$");
	if (parts.length !== 3 || parts[0] !== "s1") return false;
	const salt = parts[1] as string;
	const expected = Buffer.from(parts[2] as string, "hex");
	const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
	return expected.length === actual.length && timingSafeEqual(actual, expected);
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class SessionStore {
	private sessions = new Map<string, number>();

	create(): string {
		const id = randomBytes(32).toString("hex");
		this.sessions.set(id, Date.now() + SESSION_TTL_MS);
		return id;
	}

	isValid(id: string | undefined): boolean {
		if (!id) return false;
		const expires = this.sessions.get(id);
		if (!expires) return false;
		if (Date.now() > expires) {
			this.sessions.delete(id);
			return false;
		}
		return true;
	}

	destroy(id: string | undefined): void {
		if (id) this.sessions.delete(id);
	}
}

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

export class LoginRateLimiter {
	private attempts = new Map<string, { count: number; resetAt: number }>();

	allowed(key: string): boolean {
		const now = Date.now();
		const entry = this.attempts.get(key);
		if (!entry || now > entry.resetAt) {
			this.attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
			return true;
		}
		entry.count += 1;
		return entry.count <= MAX_ATTEMPTS;
	}
}
