import type {
	CyrusConfig,
	RepositoryConfig,
	SkillInfo,
	ToolRestriction,
} from "./types";

/**
 * Client-side simulation of Cyrus's per-request decision pipeline,
 * mirroring RepositoryRouter (routing), PromptBuilder (label → mode),
 * RunnerSelectionService (runner/model precedence), and
 * ToolPermissionResolver (allowed-tools priority chain).
 */

export interface SimInput {
	labels: string[];
	teamKey?: string;
	projectName?: string;
	agentTag?: string; // [agent=…] in the issue description
	modelTag?: string; // [model=…]
}

export interface StageAlt {
	label: string;
	reason: string;
}

export interface Stage {
	id: string;
	title: string;
	value: string;
	reason: string;
	alternatives?: StageAlt[];
	warn?: boolean;
}

type RunnerName = "claude" | "gemini" | "codex" | "cursor";

const AGENT_LABELS: Record<string, RunnerName> = {
	claude: "claude",
	gemini: "gemini",
	codex: "codex",
	openai: "codex",
	cursor: "cursor",
};

const CLAUDE_MODEL_LABELS = new Set(["fable", "opus", "sonnet", "haiku"]);

function runnerForModel(
	model: string,
): "claude" | "gemini" | "codex" | "cursor" | null {
	const m = model.toLowerCase();
	if (CLAUDE_MODEL_LABELS.has(m) || m.startsWith("claude-")) return "claude";
	if (m.startsWith("gemini")) return "gemini";
	if (m.startsWith("gpt")) return "codex";
	if (m.startsWith("composer")) return "cursor";
	return null;
}

const norm = (s: string) => s.trim().toLowerCase();

function routeRepository(
	config: CyrusConfig,
	input: SimInput,
): Stage & { repo: RepositoryConfig | null } {
	const repos = (config.repositories ?? []).filter(
		(r) => r.isActive !== false,
	);
	const labels = input.labels.map(norm);

	const labelMatches = repos.filter((r) =>
		(r.routingLabels ?? []).some((l) => labels.includes(norm(l))),
	);
	if (labelMatches.length) {
		const repo = labelMatches[0] as RepositoryConfig;
		const matched = (repo.routingLabels ?? []).find((l) =>
			labels.includes(norm(l)),
		);
		return {
			id: "repo",
			title: "Repository",
			value: repo.name,
			reason: `routing label "${matched}" (highest routing priority)`,
			alternatives: labelMatches.slice(1).map((r) => ({
				label: r.name,
				reason: "also matches a routing label — first match wins",
			})),
			repo,
		};
	}

	if (input.projectName) {
		const projectMatches = repos.filter((r) =>
			(r.projectKeys ?? []).some((p) => norm(p) === norm(input.projectName as string)),
		);
		if (projectMatches.length) {
			const repo = projectMatches[0] as RepositoryConfig;
			return {
				id: "repo",
				title: "Repository",
				value: repo.name,
				reason: `project "${input.projectName}" is in this repo's projectKeys`,
				alternatives: projectMatches
					.slice(1)
					.map((r) => ({ label: r.name, reason: "also matches the project" })),
				repo,
			};
		}
	}

	if (input.teamKey) {
		const teamMatches = repos.filter((r) =>
			(r.teamKeys ?? []).some((t) => norm(t) === norm(input.teamKey as string)),
		);
		if (teamMatches.length) {
			const repo = teamMatches[0] as RepositoryConfig;
			return {
				id: "repo",
				title: "Repository",
				value: repo.name,
				reason: `team "${input.teamKey}" is in this repo's teamKeys`,
				alternatives: teamMatches
					.slice(1)
					.map((r) => ({ label: r.name, reason: "also matches the team" })),
				repo,
			};
		}
	}

	const catchAll = repos.filter(
		(r) =>
			!(r.routingLabels?.length || r.projectKeys?.length || r.teamKeys?.length),
	);
	if (catchAll.length) {
		const repo = catchAll[0] as RepositoryConfig;
		return {
			id: "repo",
			title: "Repository",
			value: repo.name,
			reason:
				"no routing rule matched — falls through to this catch-all repo (no routing rules configured on it)",
			alternatives: catchAll
				.slice(1)
				.map((r) => ({ label: r.name, reason: "also a catch-all" })),
			repo,
		};
	}

	return {
		id: "repo",
		title: "Repository",
		value: "no match",
		reason:
			"No repository matches these labels/team/project and there is no catch-all repo — Cyrus may prompt for a repository choice or skip the issue.",
		warn: true,
		repo: null,
	};
}

const MODE_ORDER = [
	"debugger",
	"builder",
	"scoper",
	"orchestrator",
	"graphite-orchestrator",
	"graphite",
];

function selectMode(
	repo: RepositoryConfig | null,
	input: SimInput,
): Stage & { mode: string | null } {
	const labels = input.labels.map(norm);
	if (labels.includes("graphite") && labels.includes("orchestrator")) {
		return {
			id: "mode",
			title: "AI mode (system prompt)",
			value: "graphite-orchestrator",
			reason:
				'built-in pairing: "graphite" + "orchestrator" labels together select the Graphite orchestrator prompt',
			mode: "graphite-orchestrator",
		};
	}
	if (repo?.labelPrompts) {
		for (const mode of MODE_ORDER) {
			const entry = repo.labelPrompts[mode];
			if (!entry) continue;
			const modeLabels = Array.isArray(entry) ? entry : (entry.labels ?? []);
			const matched = modeLabels.find((l) => labels.includes(norm(l)));
			if (matched) {
				return {
					id: "mode",
					title: "AI mode (system prompt)",
					value: mode,
					reason: `label "${matched}" is mapped to ${mode} in ${repo.name}'s labelPrompts`,
					mode,
				};
			}
		}
	}
	if (labels.includes("orchestrator")) {
		return {
			id: "mode",
			title: "AI mode (system prompt)",
			value: "orchestrator",
			reason:
				'built-in: the "orchestrator" label always works, even without configuration',
			mode: "orchestrator",
		};
	}
	return {
		id: "mode",
		title: "AI mode (system prompt)",
		value: "standard",
		reason:
			"no mode label matched — the standard issue-assigned prompt is used; Cyrus classifies the request and picks workflow skills itself",
		mode: null,
	};
}

function selectRunnerAndModel(
	config: CyrusConfig,
	repo: RepositoryConfig | null,
	input: SimInput,
	envKeys: Set<string>,
): Stage & { runner: string; modeLabelUsed?: string } {
	const labels = input.labels.map(norm);

	let runner: RunnerName | null = null;
	let model: string | null = null;
	const reasons: string[] = [];

	// 1. Description tags beat everything.
	if (input.modelTag) {
		model = input.modelTag;
		reasons.push(`[model=${input.modelTag}] tag in the issue description`);
		runner = runnerForModel(input.modelTag);
		if (runner) reasons.push(`model implies the ${runner} runner`);
	}
	if (input.agentTag) {
		const tagRunner = AGENT_LABELS[norm(input.agentTag)];
		if (tagRunner) {
			runner = tagRunner;
			reasons.push(`[agent=${input.agentTag}] tag overrides any label choice`);
		}
	}

	// 2. Agent labels beat model-implied runners.
	if (!runner) {
		const agentLabel = labels.find((l) => AGENT_LABELS[l]);
		if (agentLabel) {
			runner = AGENT_LABELS[agentLabel] as RunnerName;
			reasons.push(`"${agentLabel}" label selects the runner`);
		}
	}

	// 3. Model labels (may also imply the runner).
	if (!model) {
		const modelLabel = labels.find((l) => runnerForModel(l) !== null);
		if (modelLabel) {
			model = modelLabel;
			reasons.push(`"${modelLabel}" label selects the model`);
			if (!runner) {
				runner = runnerForModel(modelLabel);
				if (runner) reasons.push(`model label implies the ${runner} runner`);
			}
		}
	}

	// 4. Configured / detected default runner.
	if (!runner) {
		if (config.defaultRunner) {
			runner = config.defaultRunner;
			reasons.push(`defaultRunner in config.json`);
		} else {
			const detected: RunnerName[] = [];
			if (envKeys.has("CLAUDE_CODE_OAUTH_TOKEN") || envKeys.has("ANTHROPIC_API_KEY"))
				detected.push("claude");
			if (envKeys.has("GEMINI_API_KEY")) detected.push("gemini");
			if (envKeys.has("OPENAI_API_KEY")) detected.push("codex");
			if (envKeys.has("CURSOR_API_KEY")) detected.push("cursor");
			if (detected.length === 1) {
				runner = detected[0] as RunnerName;
				reasons.push("auto-detected: exactly one provider key in .env");
			} else {
				runner = "claude";
				reasons.push(
					detected.length === 0
						? "fallback: no provider key detected"
						: "fallback: multiple provider keys present, Claude wins",
				);
			}
		}
	}

	// 5. Default model for the chosen runner.
	if (!model) {
		if (runner === "claude" && repo?.model) {
			model = repo.model;
			reasons.push(`repository model override in ${repo.name}`);
		} else {
			const defaults: Record<string, [string | undefined, string]> = {
				claude: [config.claudeDefaultModel, "opus"],
				gemini: [config.geminiDefaultModel, "gemini-2.5-pro"],
				codex: [config.codexDefaultModel, "gpt-5.5"],
				cursor: [config.cursorDefaultModel, "composer-2"],
			};
			const [configured, builtin] = defaults[runner as string] as [
				string | undefined,
				string,
			];
			model = configured ?? builtin;
			reasons.push(
				configured
					? `${runner}DefaultModel in config.json`
					: `Cyrus built-in default for ${runner}`,
			);
		}
	}

	return {
		id: "runner",
		title: "Runner & model",
		value: `${runner} · ${model}`,
		reason: reasons.join("; "),
		runner: runner as string,
	};
}

function describeTools(value: ToolRestriction): string {
	return Array.isArray(value) ? `custom list (${value.length} tools)` : value;
}

function selectTools(
	config: CyrusConfig,
	repo: RepositoryConfig | null,
	mode: string | null,
): Stage {
	if (mode && repo?.labelPrompts) {
		const entry = repo.labelPrompts[mode];
		if (entry && !Array.isArray(entry) && entry.allowedTools) {
			return {
				id: "tools",
				title: "Allowed tools",
				value: describeTools(entry.allowedTools),
				reason: `${repo.name}'s labelPrompts.${mode}.allowedTools (highest priority)`,
			};
		}
	}
	if (mode && config.promptDefaults?.[mode]?.allowedTools) {
		return {
			id: "tools",
			title: "Allowed tools",
			value: describeTools(
				config.promptDefaults[mode].allowedTools as ToolRestriction,
			),
			reason: `global promptDefaults.${mode}.allowedTools`,
		};
	}
	if (repo?.allowedTools) {
		return {
			id: "tools",
			title: "Allowed tools",
			value: describeTools(repo.allowedTools),
			reason: `${repo.name}'s repository-level allowedTools`,
		};
	}
	return {
		id: "tools",
		title: "Allowed tools",
		value: "Cyrus default",
		reason: "standard tool set plus Bash(git:*) and Bash(gh:*)",
	};
}

function selectSkills(
	repo: RepositoryConfig | null,
	skills: { defaults: SkillInfo[]; user: SkillInfo[] } | null,
): Stage {
	if (!skills) {
		return {
			id: "skills",
			title: "Workflow skills",
			value: "unknown",
			reason: "skill list not loaded",
		};
	}
	const names = skills.defaults.map((s) => s.name);
	const alternatives: StageAlt[] = [];
	const applicable: string[] = [];
	for (const skill of skills.user) {
		if (!skill.scope) {
			applicable.push(skill.name);
			continue;
		}
		if (skill.scope.repositoryIds) {
			if (repo && skill.scope.repositoryIds.includes(repo.id)) {
				applicable.push(skill.name);
			} else {
				alternatives.push({
					label: skill.name,
					reason: "scoped to other repositories",
				});
			}
			continue;
		}
		alternatives.push({
			label: skill.name,
			reason:
				"scoped by Linear team/label IDs — depends on the actual issue's IDs",
		});
	}
	return {
		id: "skills",
		title: "Workflow skills available",
		value:
			[...names, ...applicable].join(" · ") || "none deployed",
		reason:
			"default workflow skills (editable in the Skills tab) plus user skills whose scope matches",
		alternatives: alternatives.length ? alternatives : undefined,
	};
}

export function simulate(
	config: CyrusConfig,
	input: SimInput,
	envKeys: Set<string>,
	skills: { defaults: SkillInfo[]; user: SkillInfo[] } | null,
): Stage[] {
	const repoStage = routeRepository(config, input);
	const modeStage = selectMode(repoStage.repo, input);
	const runnerStage = selectRunnerAndModel(
		config,
		repoStage.repo,
		input,
		envKeys,
	);
	const toolsStage = selectTools(config, repoStage.repo, modeStage.mode);
	const skillsStage = selectSkills(repoStage.repo, skills);
	return [repoStage, modeStage, runnerStage, toolsStage, skillsStage];
}

export interface VocabEntry {
	label: string;
	kind: string;
	effect: string;
}

/** Every label this config gives meaning to, plus the built-in magic labels. */
export function labelVocabulary(config: CyrusConfig): VocabEntry[] {
	const out: VocabEntry[] = [];
	for (const repo of config.repositories ?? []) {
		for (const label of repo.routingLabels ?? []) {
			out.push({
				label,
				kind: "routing",
				effect: `routes the issue to ${repo.name}`,
			});
		}
		for (const [mode, entry] of Object.entries(repo.labelPrompts ?? {})) {
			const labels = Array.isArray(entry) ? entry : (entry.labels ?? []);
			for (const label of labels) {
				out.push({
					label,
					kind: "mode",
					effect: `runs in ${mode} mode for ${repo.name}`,
				});
			}
		}
	}
	for (const [label, runner] of Object.entries(AGENT_LABELS)) {
		out.push({
			label,
			kind: "runner (built-in)",
			effect: `forces the ${runner} runner`,
		});
	}
	for (const label of CLAUDE_MODEL_LABELS) {
		out.push({
			label,
			kind: "model (built-in)",
			effect: `Claude runner with the ${label} model`,
		});
	}
	out.push(
		{
			label: "gemini-*  /  gpt-*  /  composer-*",
			kind: "model (built-in)",
			effect: "selects that model and implies its runner",
		},
		{
			label: "orchestrator",
			kind: "mode (built-in)",
			effect: "orchestrator mode — coordinates multi-session work",
		},
		{
			label: "graphite + orchestrator",
			kind: "mode (built-in)",
			effect: "Graphite stacked-PR orchestrator",
		},
	);
	return out;
}
