import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { readConfig } from "./cyrusConfig.js";
import { listSessions } from "./sessions.js";

const execFileAsync = promisify(execFile);

export interface WorktreeInfo {
	path: string;
	branch: string | null;
	head: string | null;
	sizeBytes: number | null;
	mtimeMs: number | null;
	activeSession: string | null; // issue identifier of a non-complete session using it
}

export interface RepoWorktrees {
	repoId: string;
	repoName: string;
	repositoryPath: string;
	worktrees: WorktreeInfo[];
	error: string | null;
}

interface RepoRef {
	id: string;
	name: string;
	repositoryPath: string;
}

function configuredRepos(): RepoRef[] {
	const { config } = readConfig();
	const repos = (config.repositories ?? []) as Array<{
		id?: string;
		name?: string;
		repositoryPath?: string;
	}>;
	return repos
		.filter((r) => r.id && r.repositoryPath)
		.map((r) => ({
			id: r.id as string,
			name: r.name ?? (r.id as string),
			repositoryPath: r.repositoryPath as string,
		}));
}

async function gitWorktreeList(repositoryPath: string): Promise<
	{ path: string; branch: string | null; head: string | null }[]
> {
	const { stdout } = await execFileAsync(
		"git",
		["-C", repositoryPath, "worktree", "list", "--porcelain"],
		{ timeout: 10_000 },
	);
	const out: { path: string; branch: string | null; head: string | null }[] =
		[];
	let current: { path: string; branch: string | null; head: string | null } | null =
		null;
	for (const line of stdout.split("\n")) {
		if (line.startsWith("worktree ")) {
			if (current) out.push(current);
			current = { path: line.slice(9).trim(), branch: null, head: null };
		} else if (current && line.startsWith("HEAD ")) {
			current.head = line.slice(5).trim();
		} else if (current && line.startsWith("branch ")) {
			current.branch = line.slice(7).trim().replace("refs/heads/", "");
		}
	}
	if (current) out.push(current);
	return out;
}

async function dirSize(path: string): Promise<number | null> {
	try {
		const { stdout } = await execFileAsync("du", ["-sk", path], {
			timeout: 30_000,
		});
		const kb = Number.parseInt(stdout.split("\t")[0] as string, 10);
		return Number.isFinite(kb) ? kb * 1024 : null;
	} catch {
		return null;
	}
}

function activeSessionsByWorkspace(): Map<string, string> {
	const map = new Map<string, string>();
	try {
		for (const session of listSessions().sessions) {
			if (session.status === "complete" || session.status === "error") continue;
			if (session.workspacePath) {
				map.set(
					resolve(session.workspacePath),
					session.issueIdentifier ?? session.id,
				);
			}
		}
	} catch {
		// state file unreadable — skip badges
	}
	return map;
}

export async function listWorktrees(): Promise<RepoWorktrees[]> {
	const active = activeSessionsByWorkspace();
	const out: RepoWorktrees[] = [];
	for (const repo of configuredRepos()) {
		const entry: RepoWorktrees = {
			repoId: repo.id,
			repoName: repo.name,
			repositoryPath: repo.repositoryPath,
			worktrees: [],
			error: null,
		};
		try {
			const list = await gitWorktreeList(repo.repositoryPath);
			for (const wt of list) {
				if (resolve(wt.path) === resolve(repo.repositoryPath)) continue; // main checkout
				const exists = existsSync(wt.path);
				entry.worktrees.push({
					path: wt.path,
					branch: wt.branch,
					head: wt.head ? wt.head.slice(0, 8) : null,
					sizeBytes: exists ? await dirSize(wt.path) : null,
					mtimeMs: exists ? statSync(wt.path).mtimeMs : null,
					activeSession: active.get(resolve(wt.path)) ?? null,
				});
			}
		} catch (error) {
			entry.error = (error as Error).message;
		}
		out.push(entry);
	}
	return out;
}

export async function removeWorktree(
	repoId: string,
	worktreePath: string,
): Promise<void> {
	const repo = configuredRepos().find((r) => r.id === repoId);
	if (!repo) throw new Error(`Unknown repository: ${repoId}`);
	// Only paths git itself lists as worktrees of this repo can be removed.
	const list = await gitWorktreeList(repo.repositoryPath);
	const match = list.find((wt) => resolve(wt.path) === resolve(worktreePath));
	if (!match) throw new Error("Path is not a worktree of this repository");
	if (resolve(worktreePath) === resolve(repo.repositoryPath)) {
		throw new Error("Refusing to remove the main checkout");
	}
	await execFileAsync(
		"git",
		["-C", repo.repositoryPath, "worktree", "remove", "--force", worktreePath],
		{ timeout: 60_000 },
	);
	await execFileAsync("git", ["-C", repo.repositoryPath, "worktree", "prune"], {
		timeout: 10_000,
	});
}
