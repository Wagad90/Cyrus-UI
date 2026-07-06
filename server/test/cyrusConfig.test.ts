import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

process.env.CYRUS_HOME = mkdtempSync(join(tmpdir(), "cyrus-ui-test-"));

const mod = await import("../src/cyrusConfig.js");
const { SECRET_SENTINEL, maskSecrets, readConfig, restoreSecrets, writeConfig } =
	mod;
const { cyrusConfigSchema } = await import("../src/schema.js");

const sampleConfig = {
	repositories: [
		{
			id: "repo-a",
			name: "App",
			repositoryPath: "/srv/app",
			baseBranch: "main",
			workspaceBaseDir: "/srv/worktrees",
			linearToken: "lin_secret_repo",
			labelPrompts: { debugger: ["Bug"] },
			someFutureField: { nested: true },
		},
	],
	linearWorkspaces: {
		"ws-1": {
			linearToken: "lin_secret_ws",
			linearRefreshToken: "lin_refresh_ws",
			linearWorkspaceName: "My Workspace",
		},
	},
	claudeDefaultModel: "opus",
	unknownTopLevel: [1, 2, 3],
};

describe("maskSecrets", () => {
	it("masks nested secret keys but nothing else", () => {
		const masked = maskSecrets(sampleConfig) as typeof sampleConfig;
		expect(masked.linearWorkspaces["ws-1"].linearToken).toBe(SECRET_SENTINEL);
		expect(masked.linearWorkspaces["ws-1"].linearRefreshToken).toBe(
			SECRET_SENTINEL,
		);
		expect(masked.repositories[0].linearToken).toBe(SECRET_SENTINEL);
		expect(masked.linearWorkspaces["ws-1"].linearWorkspaceName).toBe(
			"My Workspace",
		);
		expect(masked.claudeDefaultModel).toBe("opus");
	});
});

describe("restoreSecrets", () => {
	it("restores sentinels from current values, matching repos by id", () => {
		const masked = maskSecrets(sampleConfig) as typeof sampleConfig;
		const edited = structuredClone(masked);
		// Simulate a reorder-proof edit: change a model and prepend a new repo.
		edited.claudeDefaultModel = "sonnet";
		(edited.repositories as unknown[]).unshift({
			id: "repo-b",
			name: "New",
			repositoryPath: "/srv/new",
			baseBranch: "main",
			workspaceBaseDir: "/srv/worktrees",
		});
		const restored = restoreSecrets(edited, sampleConfig) as Record<
			string,
			unknown
		>;
		const repos = restored.repositories as Array<Record<string, unknown>>;
		expect(repos[1]?.linearToken).toBe("lin_secret_repo");
		expect(repos[0]?.linearToken).toBeUndefined();
		const ws = (restored.linearWorkspaces as Record<string, unknown>)[
			"ws-1"
		] as Record<string, unknown>;
		expect(ws.linearToken).toBe("lin_secret_ws");
		expect(restored.claudeDefaultModel).toBe("sonnet");
	});
});

describe("schema", () => {
	it("accepts unknown fields (forward compatibility)", () => {
		const parsed = cyrusConfigSchema.safeParse(sampleConfig);
		expect(parsed.success).toBe(true);
	});

	it("rejects a repo missing required fields", () => {
		const parsed = cyrusConfigSchema.safeParse({
			repositories: [{ id: "x" }],
		});
		expect(parsed.success).toBe(false);
	});

	it("rejects a bad runner value", () => {
		const parsed = cyrusConfigSchema.safeParse({ defaultRunner: "gpt" });
		expect(parsed.success).toBe(false);
	});
});

describe("writeConfig round trip", () => {
	beforeAll(() => {
		writeFileSync(
			join(process.env.CYRUS_HOME as string, "config.json"),
			JSON.stringify(sampleConfig, null, 2),
		);
	});

	it("preserves unknown fields, backs up, and detects conflicts", () => {
		const snapshot = readConfig();
		expect(snapshot.exists).toBe(true);

		const edited = structuredClone(maskSecrets(snapshot.config));
		(edited as Record<string, unknown>).claudeDefaultModel = "haiku";
		const restored = restoreSecrets(edited, snapshot.config) as Record<
			string,
			unknown
		>;
		const result = writeConfig(restored, snapshot.mtimeMs, snapshot.indent);
		expect(result.backupPath).toBeTruthy();

		const onDisk = JSON.parse(
			readFileSync(
				join(process.env.CYRUS_HOME as string, "config.json"),
				"utf8",
			),
		);
		expect(onDisk.claudeDefaultModel).toBe("haiku");
		expect(onDisk.unknownTopLevel).toEqual([1, 2, 3]);
		expect(onDisk.repositories[0].someFutureField).toEqual({ nested: true });
		expect(onDisk.linearWorkspaces["ws-1"].linearToken).toBe("lin_secret_ws");

		const backups = readdirSync(process.env.CYRUS_HOME as string).filter(
			(f) => f.startsWith("config.backup-"),
		);
		expect(backups.length).toBeGreaterThan(0);

		// Stale mtime must now be rejected.
		expect(() =>
			writeConfig(restored, snapshot.mtimeMs, snapshot.indent),
		).toThrow(/changed on disk/);
	});
});
