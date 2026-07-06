import { useId, useState } from "react";
import { AccessControlEditor } from "../components/AccessControlEditor";
import { Chips } from "../components/Chips";
import { ToolsEditor } from "../components/ToolsEditor";
import { Button, Field, Section, TextInput, Toggle } from "../components/ui";
import {
	LABEL_PROMPT_MODES,
	MODEL_SUGGESTIONS,
	MODE_DESCRIPTIONS,
} from "../constants";
import type {
	CyrusConfig,
	LabelPromptConfig,
	RepositoryConfig,
	ToolRestriction,
} from "../types";
import { setOrDelete } from "../util";

const ALL_MODEL_SUGGESTIONS = Object.values(MODEL_SUGGESTIONS).flat();

function promptLabels(
	value: string[] | LabelPromptConfig | undefined,
): string[] {
	if (!value) return [];
	return Array.isArray(value) ? value : (value.labels ?? []);
}

function promptAllowed(
	value: string[] | LabelPromptConfig | undefined,
): ToolRestriction | undefined {
	return value && !Array.isArray(value) ? value.allowedTools : undefined;
}

/**
 * Builds the value to store for a labelPrompts entry. Uses the simple
 * array form when possible, the object form when tool restrictions (or
 * unknown extra fields, which are preserved) are present.
 */
function buildPromptValue(
	existing: string[] | LabelPromptConfig | undefined,
	labels: string[],
	allowedTools: ToolRestriction | undefined,
): string[] | LabelPromptConfig | undefined {
	const extras: Record<string, unknown> =
		existing && !Array.isArray(existing) ? { ...existing } : {};
	delete extras.labels;
	delete extras.allowedTools;
	const hasExtras = Object.keys(extras).length > 0;
	if (labels.length === 0 && !allowedTools && !hasExtras) return undefined;
	if (!allowedTools && !hasExtras) return labels;
	const obj: LabelPromptConfig = { ...extras };
	if (labels.length) obj.labels = labels;
	if (allowedTools) obj.allowedTools = allowedTools;
	return obj;
}

function RepoEditor({
	repo,
	updateRepo,
	onRemove,
}: {
	repo: RepositoryConfig;
	updateRepo: (mutate: (next: RepositoryConfig) => void) => void;
	onRemove: () => void;
}) {
	const modelList = useId();
	const mcpPaths = Array.isArray(repo.mcpConfigPath)
		? repo.mcpConfigPath
		: repo.mcpConfigPath
			? [repo.mcpConfigPath]
			: [];

	return (
		<div className="space-y-5 border-t border-slate-800 p-4">
			<datalist id={modelList}>
				{ALL_MODEL_SUGGESTIONS.map((m) => (
					<option key={m} value={m} />
				))}
			</datalist>

			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Name">
					<TextInput
						value={repo.name}
						onChange={(next) =>
							updateRepo((r) => {
								r.name = next;
							})
						}
					/>
				</Field>
				<Field label="Base branch">
					<TextInput
						value={repo.baseBranch}
						onChange={(next) =>
							updateRepo((r) => {
								r.baseBranch = next;
							})
						}
						mono
					/>
				</Field>
			</div>
			<Toggle
				checked={repo.isActive !== false}
				onChange={(next) =>
					updateRepo((r) => {
						// Cyrus treats a missing isActive as active.
						setOrDelete(r, "isActive", next ? undefined : false);
					})
				}
				label="Active — process issues routed to this repository"
			/>

			<Section
				title="Issue routing"
				description="Which Linear issues land in this repository. Priority: routing labels beat projects, projects beat teams. Leave all empty for workspace catch-all behaviour."
			>
				<div className="grid gap-4 lg:grid-cols-3">
					<Field label="Routing labels" hint="Highest priority.">
						<Chips
							value={repo.routingLabels ?? []}
							onChange={(next) =>
								updateRepo((r) => setOrDelete(r, "routingLabels", next))
							}
							placeholder="backend, api…"
						/>
					</Field>
					<Field label="Project keys" hint="Linear project names.">
						<Chips
							value={repo.projectKeys ?? []}
							onChange={(next) =>
								updateRepo((r) => setOrDelete(r, "projectKeys", next))
							}
							placeholder="Mobile App…"
						/>
					</Field>
					<Field label="Team keys" hint="Lowest priority.">
						<Chips
							value={repo.teamKeys ?? []}
							onChange={(next) =>
								updateRepo((r) => setOrDelete(r, "teamKeys", next))
							}
							placeholder="CEE, FRONT…"
						/>
					</Field>
				</div>
			</Section>

			<Section
				title="Model override"
				description="Overrides the global default model for issues processed in this repository."
			>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field label="Model">
						<TextInput
							value={repo.model ?? ""}
							onChange={(next) =>
								updateRepo((r) => setOrDelete(r, "model", next.trim()))
							}
							placeholder="(use global default)"
							list={modelList}
							mono
						/>
					</Field>
					<Field label="Fallback model">
						<TextInput
							value={repo.fallbackModel ?? ""}
							onChange={(next) =>
								updateRepo((r) => setOrDelete(r, "fallbackModel", next.trim()))
							}
							placeholder="(use global default)"
							list={modelList}
							mono
						/>
					</Field>
				</div>
			</Section>

			<Section
				title="Label → AI mode mapping"
				description="Issues with these Linear labels run in the matching AI mode (its system prompt), optionally with mode-specific tool permissions."
			>
				<div className="grid gap-3 lg:grid-cols-2">
					{LABEL_PROMPT_MODES.map((mode) => {
						const existing = repo.labelPrompts?.[mode];
						const labels = promptLabels(existing);
						const allowed = promptAllowed(existing);
						const write = (
							nextLabels: string[],
							nextAllowed: ToolRestriction | undefined,
						) =>
							updateRepo((r) => {
								const lp = { ...(r.labelPrompts ?? {}) };
								const value = buildPromptValue(existing, nextLabels, nextAllowed);
								if (value === undefined) delete lp[mode];
								else lp[mode] = value;
								setOrDelete(
									r,
									"labelPrompts",
									Object.keys(lp).length ? lp : undefined,
								);
							});
						return (
							<div
								key={mode}
								className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"
							>
								<div className="mb-2">
									<span className="font-mono text-sm text-sky-400">{mode}</span>
									<p className="text-xs text-slate-500">
										{MODE_DESCRIPTIONS[mode]}
									</p>
								</div>
								<Field label="Trigger labels">
									<Chips
										value={labels}
										onChange={(next) => write(next, allowed)}
										placeholder="Bug, Feature…"
									/>
								</Field>
								<div className="mt-2">
									<Field label="Allowed tools (this mode only)">
										<ToolsEditor
											value={allowed}
											onChange={(next) => write(labels, next)}
											unsetLabel="Inherit (promptDefaults / repo tools)"
										/>
									</Field>
								</div>
							</div>
						);
					})}
				</div>
			</Section>

			<Section
				title="Tool permissions"
				description="Repository-wide tool permissions, used when no mode-specific setting applies."
			>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field label="Allowed tools">
						<ToolsEditor
							value={repo.allowedTools}
							onChange={(next) =>
								updateRepo((r) => setOrDelete(r, "allowedTools", next))
							}
							unsetLabel="Cyrus default (standard tools + git/gh Bash)"
						/>
					</Field>
					<Field label="Disallowed tools">
						<ToolsEditor
							value={repo.disallowedTools}
							onChange={(next) =>
								updateRepo((r) => setOrDelete(r, "disallowedTools", next))
							}
							unsetLabel="None"
						/>
					</Field>
				</div>
			</Section>

			<details className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
				<summary className="cursor-pointer text-sm font-medium text-slate-300">
					Advanced
				</summary>
				<div className="mt-3 space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<Field label="Repository path" hint="Where the checkout lives on the Cyrus host.">
							<TextInput
								value={repo.repositoryPath}
								onChange={(next) =>
									updateRepo((r) => {
										r.repositoryPath = next;
									})
								}
								mono
							/>
						</Field>
						<Field label="Worktree base directory">
							<TextInput
								value={repo.workspaceBaseDir}
								onChange={(next) =>
									updateRepo((r) => {
										r.workspaceBaseDir = next;
									})
								}
								mono
							/>
						</Field>
						<Field label="GitHub URL" hint="Used for webhook matching/routing.">
							<TextInput
								value={repo.githubUrl ?? ""}
								onChange={(next) =>
									updateRepo((r) => setOrDelete(r, "githubUrl", next.trim()))
								}
								placeholder="https://github.com/org/repo"
								mono
							/>
						</Field>
						<Field label="GitLab URL">
							<TextInput
								value={repo.gitlabUrl ?? ""}
								onChange={(next) =>
									updateRepo((r) => setOrDelete(r, "gitlabUrl", next.trim()))
								}
								placeholder="https://gitlab.com/group/project"
								mono
							/>
						</Field>
					</div>
					<Field
						label="MCP config paths"
						hint="Paths to MCP server config files; later files override earlier ones."
					>
						<Chips
							value={mcpPaths}
							onChange={(next) =>
								updateRepo((r) =>
									setOrDelete(
										r,
										"mcpConfigPath",
										next.length === 1 ? next[0] : next,
									),
								)
							}
							placeholder="/path/to/mcp-config.json"
						/>
					</Field>
					<Field
						label="Append instruction"
						hint="Extra text appended to every session prompt for this repository."
					>
						<textarea
							className="h-24 w-full rounded-md border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
							value={repo.appendInstruction ?? ""}
							onChange={(e) =>
								updateRepo((r) =>
									setOrDelete(r, "appendInstruction", e.target.value),
								)
							}
						/>
					</Field>
					<Field label="Per-repository access control">
						<AccessControlEditor
							value={repo.userAccessControl}
							onChange={(next) =>
								updateRepo((r) => setOrDelete(r, "userAccessControl", next))
							}
						/>
					</Field>
					<div className="border-t border-slate-800 pt-3">
						<Button kind="danger" onClick={onRemove}>
							Remove repository from config
						</Button>
						<p className="mt-1 text-xs text-slate-500">
							Only removes the config entry (after Review &amp; Save). Files on
							disk are untouched.
						</p>
					</div>
				</div>
			</details>
		</div>
	);
}

export function Repositories({
	config,
	update,
}: {
	config: CyrusConfig;
	update: (mutate: (next: CyrusConfig) => void) => void;
}) {
	const [expanded, setExpanded] = useState<string | null>(null);
	const repos = config.repositories ?? [];

	const updateRepo =
		(id: string) => (mutate: (next: RepositoryConfig) => void) =>
			update((c) => {
				const repo = c.repositories?.find((r) => r.id === id);
				if (repo) mutate(repo);
			});

	return (
		<div className="space-y-4">
			{repos.length === 0 && (
				<Section title="No repositories">
					<p className="text-sm text-slate-400">
						Add one on the Cyrus host:{" "}
						<code className="font-mono">
							cyrus self-add-repo https://github.com/org/repo.git
						</code>{" "}
						— it clones the repo, wires it to your Linear workspace, and shows
						up here (and in the running daemon) automatically.
					</p>
				</Section>
			)}
			{repos.map((repo) => (
				<div
					key={repo.id}
					className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60"
				>
					<button
						type="button"
						className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-800/40"
						onClick={() =>
							setExpanded(expanded === repo.id ? null : repo.id)
						}
					>
						<div>
							<span className="font-medium text-white">{repo.name}</span>
							<span className="ml-3 font-mono text-xs text-slate-500">
								{repo.repositoryPath}
							</span>
						</div>
						<div className="flex items-center gap-3 text-xs">
							<span
								className={
									repo.isActive === false
										? "text-slate-500"
										: "text-emerald-400"
								}
							>
								{repo.isActive === false ? "inactive" : "active"}
							</span>
							<span className="text-slate-500">
								{expanded === repo.id ? "▲" : "▼"}
							</span>
						</div>
					</button>
					{expanded === repo.id && (
						<RepoEditor
							repo={repo}
							updateRepo={updateRepo(repo.id)}
							onRemove={() => {
								if (
									window.confirm(
										`Remove "${repo.name}" from config.json? The repository files on disk are not touched.`,
									)
								) {
									update((c) => {
										c.repositories = (c.repositories ?? []).filter(
											(r) => r.id !== repo.id,
										);
									});
									setExpanded(null);
								}
							}}
						/>
					)}
				</div>
			))}
		</div>
	);
}
