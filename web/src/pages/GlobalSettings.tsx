import { useId } from "react";
import { ToolsEditor } from "../components/ToolsEditor";
import { Field, Section, TextInput, TriState, inputClass } from "../components/ui";
import {
	MODEL_DEFAULTS,
	MODEL_SUGGESTIONS,
	MODE_DESCRIPTIONS,
	PROMPT_MODES,
	RUNNERS,
} from "../constants";
import type { CyrusConfig, ToolRestriction } from "../types";
import { setOrDelete } from "../util";

function ModelField({
	label,
	field,
	runner,
	config,
	update,
}: {
	label: string;
	field: string;
	runner: string;
	config: CyrusConfig;
	update: (mutate: (next: CyrusConfig) => void) => void;
}) {
	const listId = useId();
	return (
		<Field
			label={label}
			hint={`Leave empty for Cyrus's default (${MODEL_DEFAULTS[field] ?? "auto"}).`}
		>
			<TextInput
				value={(config[field] as string | undefined) ?? ""}
				onChange={(next) => update((c) => setOrDelete(c, field, next.trim()))}
				placeholder={MODEL_DEFAULTS[field]}
				list={listId}
				mono
			/>
			<datalist id={listId}>
				{(MODEL_SUGGESTIONS[runner] ?? []).map((m) => (
					<option key={m} value={m} />
				))}
			</datalist>
		</Field>
	);
}

export function GlobalSettings({
	config,
	update,
}: {
	config: CyrusConfig;
	update: (mutate: (next: CyrusConfig) => void) => void;
}) {
	return (
		<div className="space-y-5">
			<Section
				title="Default runner & models"
				description="Which coding agent handles issues by default, and which model each runner uses. Per-issue overrides still work via labels (e.g. 'opus', 'codex') or [model=…] tags in the issue description. Changes apply live."
			>
				<Field
					label="Default runner"
					hint="If unset, Cyrus auto-detects from which provider API key is present, falling back to Claude."
				>
					<select
						className={inputClass}
						value={config.defaultRunner ?? ""}
						onChange={(e) =>
							update((c) => setOrDelete(c, "defaultRunner", e.target.value))
						}
					>
						<option value="">Auto-detect (default)</option>
						{RUNNERS.map((r) => (
							<option key={r} value={r}>
								{r}
							</option>
						))}
					</select>
				</Field>
				<div className="grid gap-4 sm:grid-cols-2">
					<ModelField
						label="Claude model"
						field="claudeDefaultModel"
						runner="claude"
						config={config}
						update={update}
					/>
					<ModelField
						label="Claude fallback model"
						field="claudeDefaultFallbackModel"
						runner="claude"
						config={config}
						update={update}
					/>
					<ModelField
						label="Gemini model"
						field="geminiDefaultModel"
						runner="gemini"
						config={config}
						update={update}
					/>
					<ModelField
						label="Codex model"
						field="codexDefaultModel"
						runner="codex"
						config={config}
						update={update}
					/>
					<ModelField
						label="Cursor model"
						field="cursorDefaultModel"
						runner="cursor"
						config={config}
						update={update}
					/>
					<ModelField
						label="Cursor fallback model"
						field="cursorDefaultFallbackModel"
						runner="cursor"
						config={config}
						update={update}
					/>
				</div>
			</Section>

			<Section
				title="Prompt-mode tool defaults"
				description="Default tool permissions for each AI mode, across all repositories. Repository-specific labelPrompts settings override these."
			>
				<div className="grid gap-4 lg:grid-cols-2">
					{PROMPT_MODES.map((mode) => {
						const defaults = config.promptDefaults?.[mode];
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
								<Field label="Allowed tools">
									<ToolsEditor
										value={defaults?.allowedTools}
										onChange={(next: ToolRestriction | undefined) =>
											update((c) => {
												const pd = { ...(c.promptDefaults ?? {}) };
												const entry = { ...(pd[mode] ?? {}) };
												setOrDelete(entry, "allowedTools", next);
												if (Object.keys(entry).length === 0) delete pd[mode];
												else pd[mode] = entry;
												setOrDelete(
													c,
													"promptDefaults",
													Object.keys(pd).length ? pd : undefined,
												);
											})
										}
									/>
								</Field>
							</div>
						);
					})}
				</div>
			</Section>

			<Section
				title="Behaviour"
				description="Global feature toggles. 'Default' leaves the key out of config.json so Cyrus uses its built-in behaviour."
			>
				<div className="grid gap-4 sm:grid-cols-3">
					<Field
						label="React to issue edits"
						hint="Start/continue a session when an issue's title or description changes."
					>
						<TriState
							value={config.issueUpdateTrigger}
							onChange={(next) =>
								update((c) => setOrDelete(c, "issueUpdateTrigger", next))
							}
							defaultLabel="off"
						/>
					</Field>
					<Field
						label="Follow Slack threads"
						hint="Keep responding in Slack threads Cyrus participates in."
					>
						<TriState
							value={config.slackThreadFollowing}
							onChange={(next) =>
								update((c) => setOrDelete(c, "slackThreadFollowing", next))
							}
							defaultLabel="off"
						/>
					</Field>
					<Field
						label="PR review trigger"
						hint="React to pull-request review events."
					>
						<TriState
							value={config.prReviewTrigger}
							onChange={(next) =>
								update((c) => setOrDelete(c, "prReviewTrigger", next))
							}
							defaultLabel="off"
						/>
					</Field>
				</div>
				<Field
					label="Global setup script"
					hint="Path to a script run for every repository when a new worktree is created."
				>
					<TextInput
						value={config.global_setup_script ?? ""}
						onChange={(next) =>
							update((c) => setOrDelete(c, "global_setup_script", next.trim()))
						}
						placeholder="/home/user/scripts/setup.sh"
						mono
					/>
				</Field>
			</Section>
		</div>
	);
}
