import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { LoginRateLimiter, SessionStore, verifyPassword } from "./auth.js";
import {
	deleteBackup,
	listBackups,
	pruneBackups,
	readBackup,
	restoreBackup,
} from "./backups.js";
import {
	ConflictError,
	configPath,
	maskSecrets,
	readConfig,
	restoreSecrets,
	writeConfig,
} from "./cyrusConfig.js";
import { DaemonBusyError, daemonInfo, restartDaemon } from "./daemon.js";
import { getJob, startCloneJob } from "./repoJobs.js";
import { listWorktrees, removeWorktree } from "./worktrees.js";
import { cyrusStatus } from "./cyrusStatus.js";
import { env } from "./env.js";
import { listTranscriptFiles, tailFile } from "./logs.js";
import { cyrusConfigSchema } from "./schema.js";
import { getSession, listSessions } from "./sessions.js";
import { loadUiConfig } from "./uiConfig.js";
import { usageReport } from "./usage.js";

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

	app.get("/api/sessions", async (_req, reply) => {
		try {
			return listSessions();
		} catch (error) {
			return reply.code(500).send({
				error: `Failed to read session state: ${(error as Error).message}`,
			});
		}
	});

	app.get("/api/sessions/:id", async (req, reply) => {
		const { id } = req.params as { id: string };
		try {
			const detail = getSession(id);
			if (!detail) return reply.code(404).send({ error: "Session not found" });
			return detail;
		} catch (error) {
			return reply.code(500).send({
				error: `Failed to read session: ${(error as Error).message}`,
			});
		}
	});

	app.get("/api/transcripts", async () => ({
		files: listTranscriptFiles(),
	}));

	app.get("/api/transcripts/tail", async (req, reply) => {
		const query = req.query as { path?: string; offset?: string };
		if (!query.path) {
			return reply.code(400).send({ error: "path query param required" });
		}
		const offset =
			query.offset !== undefined ? Number.parseInt(query.offset, 10) : null;
		try {
			return tailFile(
				query.path,
				Number.isFinite(offset as number) ? offset : null,
			);
		} catch (error) {
			return reply
				.code(404)
				.send({ error: `Cannot read transcript: ${(error as Error).message}` });
		}
	});

	app.get("/api/usage", async (_req, reply) => {
		try {
			return await usageReport();
		} catch (error) {
			return reply.code(500).send({
				error: `Failed to aggregate usage: ${(error as Error).message}`,
			});
		}
	});

	app.get("/api/daemon", async () => daemonInfo());

	app.post("/api/daemon/restart", async (req, reply) => {
		const body = req.body as { force?: boolean } | null;
		try {
			const result = await restartDaemon(Boolean(body?.force));
			return { ok: true, output: result.output };
		} catch (error) {
			if (error instanceof DaemonBusyError) {
				return reply.code(409).send({ error: error.message });
			}
			return reply.code(500).send({ error: (error as Error).message });
		}
	});

	app.get("/api/worktrees", async (_req, reply) => {
		try {
			return { repos: await listWorktrees() };
		} catch (error) {
			return reply.code(500).send({ error: (error as Error).message });
		}
	});

	app.post("/api/worktrees/remove", async (req, reply) => {
		const body = req.body as { repoId?: string; path?: string } | null;
		if (!body?.repoId || !body.path) {
			return reply.code(400).send({ error: "repoId and path required" });
		}
		try {
			await removeWorktree(body.repoId, body.path);
			return { ok: true };
		} catch (error) {
			return reply.code(400).send({ error: (error as Error).message });
		}
	});

	app.get("/api/backups", async () => ({ backups: listBackups() }));

	app.get("/api/backups/:name", async (req, reply) => {
		const { name } = req.params as { name: string };
		try {
			return { name, config: maskSecrets(readBackup(name)) };
		} catch (error) {
			return reply.code(404).send({ error: (error as Error).message });
		}
	});

	app.post("/api/backups/:name/restore", async (req, reply) => {
		const { name } = req.params as { name: string };
		try {
			const result = restoreBackup(name);
			return { ok: true, backupPath: result.backupPath };
		} catch (error) {
			return reply.code(400).send({ error: (error as Error).message });
		}
	});

	app.delete("/api/backups/:name", async (req, reply) => {
		const { name } = req.params as { name: string };
		try {
			deleteBackup(name);
			return { ok: true };
		} catch (error) {
			return reply.code(400).send({ error: (error as Error).message });
		}
	});

	app.post("/api/backups/prune", async (req, reply) => {
		const body = req.body as { keep?: number } | null;
		const keep = body?.keep ?? 10;
		if (!Number.isInteger(keep) || keep < 1) {
			return reply.code(400).send({ error: "keep must be a positive integer" });
		}
		return { ok: true, deleted: pruneBackups(keep) };
	});

	app.post("/api/repos/clone", async (req, reply) => {
		const body = req.body as {
			url?: string;
			name?: string;
			baseBranch?: string;
			routingLabels?: string[];
			linearWorkspaceId?: string;
		} | null;
		const url = body?.url;
		if (!url) return reply.code(400).send({ error: "url required" });
		try {
			const job = startCloneJob({ ...body, url });
			return { jobId: job.id };
		} catch (error) {
			return reply.code(400).send({ error: (error as Error).message });
		}
	});

	app.get("/api/jobs/:id", async (req, reply) => {
		const { id } = req.params as { id: string };
		const job = getJob(id);
		if (!job) return reply.code(404).send({ error: "Job not found" });
		return job;
	});

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
