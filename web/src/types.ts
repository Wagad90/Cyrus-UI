export type RunnerType = "claude" | "gemini" | "codex" | "cursor";

export type ToolRestriction =
	| string[]
	| "readOnly"
	| "safe"
	| "all"
	| "coordinator";

export interface LabelPromptConfig {
	labels?: string[];
	allowedTools?: ToolRestriction;
	disallowedTools?: ToolRestriction;
	[key: string]: unknown;
}

export type UserIdentifier = string | { id: string } | { email: string };

export interface UserAccessControl {
	allowedUsers?: UserIdentifier[];
	blockedUsers?: UserIdentifier[];
	blockBehavior?: "silent" | "comment";
	blockMessage?: string;
	[key: string]: unknown;
}

export interface RepositoryConfig {
	id: string;
	name: string;
	repositoryPath: string;
	baseBranch: string;
	workspaceBaseDir: string;
	githubUrl?: string;
	gitlabUrl?: string;
	linearWorkspaceId?: string;
	teamKeys?: string[];
	projectKeys?: string[];
	routingLabels?: string[];
	isActive?: boolean;
	allowedTools?: ToolRestriction;
	disallowedTools?: ToolRestriction;
	mcpConfigPath?: string | string[];
	appendInstruction?: string;
	model?: string;
	fallbackModel?: string;
	labelPrompts?: Record<string, string[] | LabelPromptConfig>;
	userAccessControl?: UserAccessControl;
	[key: string]: unknown;
}

export interface PromptTypeDefaults {
	allowedTools?: ToolRestriction;
	disallowedTools?: ToolRestriction;
	[key: string]: unknown;
}

export interface CyrusConfig {
	repositories?: RepositoryConfig[];
	linearWorkspaces?: Record<
		string,
		{
			linearWorkspaceName?: string;
			linearWorkspaceSlug?: string;
			[key: string]: unknown;
		}
	>;
	defaultRunner?: RunnerType;
	claudeDefaultModel?: string;
	claudeDefaultFallbackModel?: string;
	geminiDefaultModel?: string;
	codexDefaultModel?: string;
	cursorDefaultModel?: string;
	cursorDefaultFallbackModel?: string;
	promptDefaults?: Record<string, PromptTypeDefaults>;
	userAccessControl?: UserAccessControl;
	issueUpdateTrigger?: boolean;
	slackThreadFollowing?: boolean;
	prReviewTrigger?: boolean;
	global_setup_script?: string;
	[key: string]: unknown;
}

export interface ConfigResponse {
	exists: boolean;
	mtimeMs: number | null;
	path: string;
	config: CyrusConfig;
}

export interface StatusResponse {
	cyrus: {
		reachable: boolean;
		status: string | null;
		version: string | null;
		port: number;
	};
	ui: { version: string; cyrusHome: string };
}
