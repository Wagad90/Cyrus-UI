import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { readConfig, writeConfig } from "./cyrusConfig.js";
import { env } from "./env.js";

/**
 * Background clone-and-register jobs, mirroring what `cyrus self-add-repo`
 * does: clone into <cyrusHome>/repos/<name>, detect the default branch,
 * append a repository entry to config.json (which Cyrus hot-reloads).
 */

export interface RepoJob {
	id: string;
	state: "running" | "done" | "error";
	log: string[];
	repoName: string;
	startedAt: number;
}

const jobs = new Map<string, RepoJob>();

export function getJob(id: string): RepoJob | null {
	return jobs.get(id) ?? null;
}

function detectDefaultBranch(repositoryPath: string): string {
	try {
		const ref = execFileSync(
			"git",
			["-C", repositoryPath, "symbolic-ref", "refs/remotes/origin/HEAD"],
			{ encoding: "utf8", timeout: 10_000 },
		).trim();
		const branch = ref.replace("refs/remotes/origin/", "");
		if (branch) return branch;
	} catch {
		// fall through
	}
	return "main";
}

function isValidGitUrl(url: string): boolean {
	return (
		/^https?:\/\/[\w.@:/~-]+$/.test(url) ||
		/^git@[\w.-]+:[\w./~-]+$/.test(url) ||
		/^ssh:\/\/[\w.@:/~-]+$/.test(url)
	);
}

export function startCloneJob(input: {
	url: string;
	name?: string;
	baseBranch?: string;
	routingLabels?: string[];
	linearWorkspaceId?: string;
}): RepoJob {
	const url = input.url.trim();
	if (!isValidGitUrl(url)) throw new Error("That doesn't look like a git URL");
	const repoName =
		input.name?.trim() || basename(url).replace(/\.git$/, "") || "repo";
	if (!/^[\w.-]+$/.test(repoName)) throw new Error("Invalid repository name");

	const reposDir =
		process.env.CYRUS_REPOS_DIR ?? join(env.cyrusHome, "repos");
	const repositoryPath = join(reposDir, repoName);
	if (existsSync(repositoryPath)) {
		throw new Error(`${repositoryPath} already exists`);
	}
	mkdirSync(reposDir, { recursive: true });

	const job: RepoJob = {
		id: randomUUID(),
		state: "running",
		log: [`$ git clone ${url} ${repositoryPath}`],
		repoName,
		startedAt: Date.now(),
	};
	jobs.set(job.id, job);

	const child = spawn("git", ["clone", "--progress", url, repositoryPath], {
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
	});
	const append = (chunk: Buffer) => {
		const text = chunk.toString("utf8").trim();
		if (text) job.log.push(...text.split("\n").slice(-5));
		if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
	};
	child.stdout.on("data", append);
	child.stderr.on("data", append);
	child.on("error", (error) => {
		job.state = "error";
		job.log.push(`clone failed: ${error.message}`);
	});
	child.on("close", (code) => {
		if (job.state === "error") return;
		if (code !== 0) {
			job.state = "error";
			job.log.push(
				`git clone exited with code ${code}. For private repos, make sure this user has credentials configured (ssh key or credential helper).`,
			);
			return;
		}
		try {
			const baseBranch =
				input.baseBranch?.trim() || detectDefaultBranch(repositoryPath);
			const snapshot = readConfig();
			const config = snapshot.config;
			const repositories = Array.isArray(config.repositories)
				? (config.repositories as Record<string, unknown>[])
				: [];
			const workspaceIds = Object.keys(
				(config.linearWorkspaces as Record<string, unknown>) ?? {},
			);
			const repoConfig: Record<string, unknown> = {
				id: randomUUID(),
				name: repoName,
				repositoryPath,
				baseBranch,
				workspaceBaseDir:
					process.env.CYRUS_WORKTREES_DIR ?? join(env.cyrusHome, "worktrees"),
				isActive: true,
				routingLabels: input.routingLabels?.length
					? input.routingLabels
					: [repoName],
			};
			const workspaceId = input.linearWorkspaceId ?? workspaceIds[0];
			if (workspaceId) repoConfig.linearWorkspaceId = workspaceId;
			if (url.includes("github.com")) {
				repoConfig.githubUrl = url.replace(/\.git$/, "");
			} else if (url.includes("gitlab")) {
				repoConfig.gitlabUrl = url.replace(/\.git$/, "");
			}
			repositories.push(repoConfig);
			config.repositories = repositories;
			writeConfig(config, null, snapshot.indent);
			job.log.push(
				`Cloned (base branch: ${baseBranch}) and added to config.json — Cyrus picks it up live.`,
				`Routing labels: ${(repoConfig.routingLabels as string[]).join(", ")}`,
			);
			job.state = "done";
		} catch (error) {
			job.state = "error";
			job.log.push(`Failed to update config: ${(error as Error).message}`);
		}
	});
	return job;
}
