import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { env } from "./env.js";

/**
 * Editors for Cyrus's two skill roots:
 *  - Default workflow skills:  ~/.cyrus/cyrus-skills-plugin/skills/<name>/SKILL.md
 *    Deployed once by Cyrus at startup and never overwritten — user edits here
 *    ARE the supported customization point for what happens on each request.
 *  - User skills:              ~/.cyrus/user-skills-plugin/skills/<name>/SKILL.md
 *    Optional scope.json sidecar: { repositoryIds?, linearTeamIds?, linearLabelIds? }
 *    (a skill with no scope is available to every session).
 */

export type SkillRoot = "default" | "user";

const VALID_NAME = /^[a-z0-9][a-z0-9_-]*$/;

export interface SkillScope {
	repositoryIds?: string[];
	linearTeamIds?: string[];
	linearLabelIds?: string[];
}

export interface SkillInfo {
	name: string;
	description: string | null;
	sizeBytes: number;
	mtimeMs: number;
	scope: SkillScope | null;
}

function rootDir(root: SkillRoot): string {
	return root === "default"
		? join(env.cyrusHome, "cyrus-skills-plugin", "skills")
		: join(env.cyrusHome, "user-skills-plugin", "skills");
}

function assertName(name: string): void {
	if (!VALID_NAME.test(name)) {
		throw new Error(
			"Skill names may only contain lowercase letters, numbers, hyphens, and underscores",
		);
	}
}

function parseDescription(content: string): string | null {
	// SKILL.md frontmatter: --- ... description: xyz ... ---
	const match = content.match(/^---\n([\s\S]*?)\n---/);
	if (!match) return null;
	const line = (match[1] as string)
		.split("\n")
		.find((l) => l.startsWith("description:"));
	return line ? line.slice("description:".length).trim() : null;
}

function readScope(dir: string): SkillScope | null {
	const path = join(dir, "scope.json");
	if (!existsSync(path)) return null;
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as SkillScope;
		return parsed && typeof parsed === "object" ? parsed : null;
	} catch {
		return null; // unparseable = unscoped, mirroring Cyrus's behaviour
	}
}

function listRoot(root: SkillRoot): SkillInfo[] {
	const dir = rootDir(root);
	if (!existsSync(dir)) return [];
	const out: SkillInfo[] = [];
	for (const name of readdirSync(dir)) {
		const skillMd = join(dir, name, "SKILL.md");
		if (!existsSync(skillMd)) continue;
		const st = statSync(skillMd);
		const content = readFileSync(skillMd, "utf8");
		out.push({
			name,
			description: parseDescription(content),
			sizeBytes: st.size,
			mtimeMs: st.mtimeMs,
			scope: root === "user" ? readScope(join(dir, name)) : null,
		});
	}
	out.sort((a, b) => a.name.localeCompare(b.name));
	return out;
}

export function listSkills(): {
	defaults: SkillInfo[];
	user: SkillInfo[];
	defaultsDeployed: boolean;
} {
	return {
		defaults: listRoot("default"),
		user: listRoot("user"),
		defaultsDeployed: existsSync(rootDir("default")),
	};
}

export function readSkill(
	root: SkillRoot,
	name: string,
): { content: string; scope: SkillScope | null } {
	assertName(name);
	const dir = join(rootDir(root), name);
	const skillMd = join(dir, "SKILL.md");
	if (!existsSync(skillMd)) throw new Error(`Skill "${name}" not found`);
	return {
		content: readFileSync(skillMd, "utf8"),
		scope: root === "user" ? readScope(dir) : null,
	};
}

function normalizeScope(scope: SkillScope | undefined | null): SkillScope | null {
	if (!scope) return null;
	const clean = (values: unknown): string[] | undefined => {
		if (!Array.isArray(values)) return undefined;
		const filtered = values.filter(
			(v): v is string => typeof v === "string" && v.length > 0,
		);
		return filtered.length ? filtered : undefined;
	};
	const out: SkillScope = {};
	const repositoryIds = clean(scope.repositoryIds);
	const linearTeamIds = clean(scope.linearTeamIds);
	const linearLabelIds = clean(scope.linearLabelIds);
	if (repositoryIds) out.repositoryIds = repositoryIds;
	if (linearTeamIds) out.linearTeamIds = linearTeamIds;
	if (linearLabelIds) out.linearLabelIds = linearLabelIds;
	return Object.keys(out).length ? out : null;
}

export function writeSkill(
	root: SkillRoot,
	name: string,
	content: string,
	scope?: SkillScope | null,
): void {
	assertName(name);
	if (!content.trim()) throw new Error("Skill content cannot be empty");
	const dir = join(rootDir(root), name);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "SKILL.md"),
		content.endsWith("\n") ? content : `${content}\n`,
	);
	if (root === "user") {
		const normalized = normalizeScope(scope);
		const scopePath = join(dir, "scope.json");
		if (normalized) {
			writeFileSync(scopePath, `${JSON.stringify(normalized, null, "\t")}\n`);
		} else if (existsSync(scopePath)) {
			rmSync(scopePath);
		}
	}
}

export function deleteSkill(root: SkillRoot, name: string): void {
	assertName(name);
	if (root !== "user") {
		throw new Error(
			"Default skills can't be deleted individually — use reset instead",
		);
	}
	const dir = join(rootDir(root), name);
	if (!existsSync(dir)) throw new Error(`Skill "${name}" not found`);
	rmSync(dir, { recursive: true });
}

/**
 * Removes the entire deployed default-skills plugin. Cyrus's
 * DefaultSkillsDeployer recreates pristine copies on its next startup, so
 * this needs a daemon restart to complete.
 */
export function resetDefaultSkills(): void {
	const pluginDir = join(env.cyrusHome, "cyrus-skills-plugin");
	if (existsSync(pluginDir)) rmSync(pluginDir, { recursive: true });
}
