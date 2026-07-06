import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { LoginRateLimiter, SessionStore, verifyPassword } from "./auth.js";
import {
	ConflictError,
	configPath,
	maskSecrets,
	readConfig,
	restoreSecrets,
	writeConfig,
} from "./cyrusConfig.js";
import { cyrusStatus } from "./cyrusStatus.js";
import { env } from "./env.js";
import { cyrusConfigSchema } from "./schema.js";
import { loadUiConfig } from "./uiConfig.js";

const SESSION_COOKIE = "cyrus_ui_session";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "../package.json"), "utf8")) as {
	version: string;
};

async function main(): Promise<void> {
	const bootConfig = loadUiConfig();
	const sessions = new SessionStore();
	const limiter = new LoginRateLimiter();

	const app = Fastify({ logger: true, trustProxy: true });
	await app.register(fastifyCookie, { secret: bootConfig.sessionSecret });

	function isAuthed(req: {
		cookies: Record<string, string | undefined>;
		unsignCookie: (value: string) => { valid: boolean; value: string | null };
	}): boolean {
		const raw = req.cookies[SESSION_COOKIE];
		if (!raw) return false;
		const unsigned = req.unsignCookie(raw);
		return unsigned.valid && sessions.isValid(unsigned.value ?? undefined);
	}

	app.addHook("onRequest", async (req, reply) => {
		reply.header("X-Robots-Tag", "noindex, nofollow");
		if (!req.url.startsWith("/api/")) return;
		if (req.url.startsWith("/api/auth/")) return;
		if (!isAuthed(req)) {
			reply.code(401).send({ error: "unauthorized" });
		}
	});

	app.get("/api/auth/me", async (req) => ({
		authenticated: isAuthed(req),
		// Re-read so `set-password` takes effect without restarting the service.
		passwordConfigured: Boolean(loadUiConfig().passwordHash),
	}));

	app.post("/api/auth/login", async (req, reply) => {
		const uiConfig = loadUiConfig();
		if (!uiConfig.passwordHash) {
			return reply.code(503).send({
				error:
					"No password configured yet. On the server, run: npm run set-password",
			});
		}
		const ip =
			(req.headers["cf-connecting-ip"] as string | undefined) ?? req.ip;
		if (!limiter.allowed(ip)) {
			return reply
				.code(429)
				.send({ error: "Too many attempts. Try again in a minute." });
		}
		const body = req.body as { password?: string } | null;
		if (
			!body?.password ||
			!verifyPassword(body.password, uiConfig.passwordHash)
		) {
			return reply.code(401).send({ error: "Wrong password" });
		}
		const id = sessions.create();
		reply.setCookie(SESSION_COOKIE, id, {
			path: "/",
			httpOnly: true,
			sameSite: "strict",
			secure: !env.insecureCookie,
			signed: true,
			maxAge: 7 * 24 * 60 * 60,
		});
		return { ok: true };
	});

	app.post("/api/auth/logout", async (req, reply) => {
		const raw = req.cookies[SESSION_COOKIE];
		if (raw) {
			const unsigned = req.unsignCookie(raw);
			if (unsigned.valid) sessions.destroy(unsigned.value ?? undefined);
		}
		reply.clearCookie(SESSION_COOKIE, { path: "/" });
		return { ok: true };
	});

	app.get("/api/config", async (_req, reply) => {
		try {
			const snapshot = readConfig();
			return {
				exists: snapshot.exists,
				mtimeMs: snapshot.mtimeMs,
				path: configPath(),
				config: maskSecrets(snapshot.config),
			};
		} catch (error) {
			return reply.code(500).send({
				error: `Failed to read ${configPath()}: ${(error as Error).message}`,
			});
		}
	});

	app.put("/api/config", async (req, reply) => {
		const body = req.body as {
			config?: unknown;
			baseMtimeMs?: number | null;
		} | null;
		if (
			!body ||
			typeof body.config !== "object" ||
			body.config === null ||
			Array.isArray(body.config)
		) {
			return reply
				.code(400)
				.send({ error: "Body must be { config: object, baseMtimeMs }" });
		}
		let current: ReturnType<typeof readConfig>;
		try {
			current = readConfig();
		} catch (error) {
			return reply.code(500).send({
				error: `Refusing to write: current ${configPath()} is unreadable (${(error as Error).message})`,
			});
		}
		const restored = restoreSecrets(body.config, current.config) as Record<
			string,
			unknown
		>;
		const parsed = cyrusConfigSchema.safeParse(restored);
		if (!parsed.success) {
			return reply.code(422).send({
				error: "Config failed validation",
				issues: parsed.error.issues.map((issue) => ({
					path: issue.path.join("."),
					message: issue.message,
				})),
			});
		}
		try {
			const result = writeConfig(
				restored,
				body.baseMtimeMs ?? null,
				current.indent,
			);
			return {
				ok: true,
				mtimeMs: result.mtimeMs,
				backupPath: result.backupPath,
			};
		} catch (error) {
			if (error instanceof ConflictError) {
				return reply.code(409).send({
					error: error.message,
					mtimeMs: current.mtimeMs,
					config: maskSecrets(current.config),
				});
			}
			throw error;
		}
	});

	app.get("/api/status", async () => ({
		cyrus: await cyrusStatus(),
		ui: { version: pkg.version, cyrusHome: env.cyrusHome },
	}));

	const webDist = join(here, "../../web/dist");
	if (existsSync(webDist)) {
		await app.register(fastifyStatic, { root: webDist });
		app.setNotFoundHandler((req, reply) => {
			if (req.url.startsWith("/api/") || req.method !== "GET") {
				reply.code(404).send({ error: "not found" });
				return;
			}
			reply.sendFile("index.html");
		});
	} else {
		app.log.warn(
			`Web build not found at ${webDist} — run \`npm run build -w web\` (API-only mode)`,
		);
	}

	await app.listen({ port: env.port, host: env.host });
	app.log.info(
		`Cyrus Control UI listening on http://${env.host}:${env.port} (cyrusHome: ${env.cyrusHome})`,
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
