export const RUNNERS = ["claude", "gemini", "codex", "cursor"] as const;

/** Known-good model names per runner (free text is always allowed too). */
export const MODEL_SUGGESTIONS: Record<string, string[]> = {
	claude: ["fable", "opus", "sonnet", "haiku"],
	gemini: [
		"gemini-2.5-pro",
		"gemini-2.5-flash",
		"gemini-2.5-flash-lite",
		"gemini-3-pro-preview",
	],
	codex: ["gpt-5.5", "gpt-5.4", "gpt-5.3-codex"],
	cursor: ["composer-2", "gpt-5.4"],
};

/** Defaults Cyrus applies when the field is unset. */
export const MODEL_DEFAULTS: Record<string, string> = {
	claudeDefaultModel: "opus",
	claudeDefaultFallbackModel: "sonnet",
	geminiDefaultModel: "gemini-2.5-pro",
	codexDefaultModel: "gpt-5.5",
	cursorDefaultModel: "composer-2",
	cursorDefaultFallbackModel: "composer-2",
};

export const PROMPT_MODES = [
	"debugger",
	"builder",
	"scoper",
	"orchestrator",
	"graphite-orchestrator",
] as const;

export const LABEL_PROMPT_MODES = [...PROMPT_MODES, "graphite"] as const;

export const MODE_DESCRIPTIONS: Record<string, string> = {
	debugger: "Systematic problem investigation",
	builder: "Feature implementation",
	scoper: "Requirements analysis / PRD scoping",
	orchestrator:
		"Coordinates multi-session work (the 'orchestrator' label always works, even unconfigured)",
	"graphite-orchestrator":
		"Orchestrator using Graphite stacked PRs (triggered by 'graphite' + 'orchestrator' together)",
	graphite: "Use Graphite (gt) stacked-PR workflow",
};

export const TOOL_PRESETS = [
	{ value: "readOnly", label: "readOnly — view-only tools, no edits (17 tools)" },
	{ value: "safe", label: "safe — everything except Bash (32 tools)" },
	{ value: "all", label: "all — every tool including Bash (33 tools)" },
	{ value: "coordinator", label: "coordinator — orchestration tool set" },
] as const;

export const TOOL_SUGGESTIONS = [
	"Read",
	"Edit",
	"Write",
	"Glob",
	"Grep",
	"Bash",
	"Bash(git:*)",
	"Bash(gh:*)",
	"Bash(npm:*)",
	"Task",
	"WebFetch",
	"WebSearch",
	"NotebookEdit",
	"TaskCreate",
	"TaskUpdate",
	"TaskGet",
	"TaskList",
	"Skill",
	"mcp__linear",
	"mcp__github",
];
