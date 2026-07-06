import { z } from "zod";

/**
 * Lenient mirror of Cyrus's EdgeConfigSchema (packages/core/src/config-schemas.ts).
 * Every object is `.passthrough()` so fields this UI doesn't know about are
 * accepted and preserved verbatim — Cyrus evolves quickly and the config on
 * disk must never lose data just because this UI is a version behind.
 */

const runner = z.enum(["claude", "gemini", "codex", "cursor"]);

const toolRestriction = z.union([
	z.array(z.string()),
	z.enum(["readOnly", "safe", "all", "coordinator"]),
]);

const promptTypeDefaults = z
	.object({
		allowedTools: toolRestriction.optional(),
		disallowedTools: toolRestriction.optional(),
	})
	.passthrough();

const labelPromptValue = z.union([
	z.array(z.string()),
	z
		.object({
			labels: z.array(z.string()).optional(),
			allowedTools: toolRestriction.optional(),
			disallowedTools: toolRestriction.optional(),
		})
		.passthrough(),
]);

const userIdentifier = z.union([
	z.string(),
	z.object({ id: z.string() }).passthrough(),
	z.object({ email: z.string() }).passthrough(),
]);

const userAccessControl = z
	.object({
		allowedUsers: z.array(userIdentifier).optional(),
		blockedUsers: z.array(userIdentifier).optional(),
		blockBehavior: z.enum(["silent", "comment"]).optional(),
		blockMessage: z.string().optional(),
	})
	.passthrough();

const repository = z
	.object({
		id: z.string().min(1),
		name: z.string().min(1),
		repositoryPath: z.string().min(1),
		baseBranch: z.string().min(1),
		workspaceBaseDir: z.string().min(1),
		githubUrl: z.string().optional(),
		gitlabUrl: z.string().optional(),
		linearWorkspaceId: z.string().optional(),
		teamKeys: z.array(z.string()).optional(),
		projectKeys: z.array(z.string()).optional(),
		routingLabels: z.array(z.string()).optional(),
		isActive: z.boolean().optional(),
		allowedTools: toolRestriction.optional(),
		disallowedTools: toolRestriction.optional(),
		mcpConfigPath: z.union([z.string(), z.array(z.string())]).optional(),
		appendInstruction: z.string().optional(),
		model: z.string().optional(),
		fallbackModel: z.string().optional(),
		labelPrompts: z.record(labelPromptValue).optional(),
		userAccessControl: userAccessControl.optional(),
	})
	.passthrough();

export const cyrusConfigSchema = z
	.object({
		repositories: z.array(repository).optional(),
		linearWorkspaces: z.record(z.object({}).passthrough()).optional(),
		defaultRunner: runner.optional(),
		claudeDefaultModel: z.string().optional(),
		claudeDefaultFallbackModel: z.string().optional(),
		geminiDefaultModel: z.string().optional(),
		codexDefaultModel: z.string().optional(),
		cursorDefaultModel: z.string().optional(),
		cursorDefaultFallbackModel: z.string().optional(),
		promptDefaults: z.record(promptTypeDefaults).optional(),
		userAccessControl: userAccessControl.optional(),
		issueUpdateTrigger: z.boolean().optional(),
		slackThreadFollowing: z.boolean().optional(),
		prReviewTrigger: z.boolean().optional(),
		global_setup_script: z.string().optional(),
	})
	.passthrough();
