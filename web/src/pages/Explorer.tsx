import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Chips } from "../components/Chips";
import { Button, Field, Section, TextInput } from "../components/ui";
import {
	type Stage,
	labelVocabulary,
	simulate,
} from "../simulate";
import type { CyrusConfig, SkillsList } from "../types";

const STAGE_ICONS: Record<string, string> = {
	repo: "📁",
	mode: "🎭",
	runner: "🤖",
	tools: "🔧",
	skills: "📚",
};

function StageCard({ stage }: { stage: Stage }) {
	return (
		<div
			className={`rounded-xl border p-4 ${
				stage.warn
					? "border-amber-700 bg-amber-950/30"
					: "border-slate-700 bg-slate-900/80"
			}`}
		>
			<div className="flex items-baseline gap-2">
				<span>{STAGE_ICONS[stage.id]}</span>
				<span className="text-xs uppercase tracking-wider text-slate-500">
					{stage.title}
				</span>
			</div>
			<div
				className={`mt-1 text-lg font-semibold ${
					stage.warn ? "text-amber-300" : "text-white"
				}`}
			>
				{stage.value}
			</div>
			<div className="mt-1 text-xs text-slate-400">{stage.reason}</div>
			{stage.alternatives && stage.alternatives.length > 0 && (
				<div className="mt-2 space-y-0.5 border-t border-slate-800 pt-2">
					{stage.alternatives.map((alt) => (
						<div key={alt.label} className="text-xs text-slate-600">
							<span className="text-slate-500">{alt.label}</span> — {alt.reason}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export function Explorer({ config }: { config: CyrusConfig }) {
	const [labels, setLabels] = useState<string[]>([]);
	const [teamKey, setTeamKey] = useState("");
	const [projectName, setProjectName] = useState("");
	const [agentTag, setAgentTag] = useState("");
	const [modelTag, setModelTag] = useState("");
	const [envKeys, setEnvKeys] = useState<Set<string>>(new Set());
	const [skills, setSkills] = useState<SkillsList | null>(null);

	useEffect(() => {
		api
			.env()
			.then((res) => setEnvKeys(new Set(res.entries.map((e) => e.key))))
			.catch(() => {});
		api
			.skills()
			.then(setSkills)
			.catch(() => {});
	}, []);

	const vocabulary = useMemo(() => labelVocabulary(config), [config]);
	const labelSuggestions = useMemo(
		() =>
			[...new Set(vocabulary.map((v) => v.label))].filter(
				(l) => !l.includes("*") && !l.includes("+"),
			),
		[vocabulary],
	);
	const teamSuggestions = useMemo(
		() => [
			...new Set(
				(config.repositories ?? []).flatMap((r) => r.teamKeys ?? []),
			),
		],
		[config],
	);
	const projectSuggestions = useMemo(
		() => [
			...new Set(
				(config.repositories ?? []).flatMap((r) => r.projectKeys ?? []),
			),
		],
		[config],
	);

	const stages = useMemo(
		() =>
			simulate(
				config,
				{
					labels,
					teamKey: teamKey || undefined,
					projectName: projectName || undefined,
					agentTag: agentTag || undefined,
					modelTag: modelTag || undefined,
				},
				envKeys,
				skills,
			),
		[config, labels, teamKey, projectName, agentTag, modelTag, envKeys, skills],
	);

	return (
		<div className="space-y-5">
			<Section
				title="Simulate an issue"
				description="Pick the Linear labels (and optionally team/project) an issue would have, and see exactly what Cyrus would do with it — computed from your live config draft, so you can preview changes before saving."
			>
				<Field label="Labels on the issue">
					<Chips
						value={labels}
						onChange={setLabels}
						suggestions={labelSuggestions}
						placeholder="Bug, backend, opus…"
					/>
				</Field>
				<div className="grid gap-4 sm:grid-cols-4">
					<Field label="Team key">
						<TextInput
							value={teamKey}
							onChange={setTeamKey}
							placeholder={teamSuggestions[0] ?? "HOME"}
							list="explorer-teams"
							mono
						/>
						<datalist id="explorer-teams">
							{teamSuggestions.map((t) => (
								<option key={t} value={t} />
							))}
						</datalist>
					</Field>
					<Field label="Project">
						<TextInput
							value={projectName}
							onChange={setProjectName}
							placeholder={projectSuggestions[0] ?? "(none)"}
							list="explorer-projects"
						/>
						<datalist id="explorer-projects">
							{projectSuggestions.map((p) => (
								<option key={p} value={p} />
							))}
						</datalist>
					</Field>
					<Field label="[agent=…] tag" hint="In the issue description.">
						<TextInput
							value={agentTag}
							onChange={setAgentTag}
							placeholder="codex"
							mono
						/>
					</Field>
					<Field label="[model=…] tag">
						<TextInput
							value={modelTag}
							onChange={setModelTag}
							placeholder="haiku"
							mono
						/>
					</Field>
				</div>
			</Section>

			{/* Pipeline */}
			<div className="mx-auto max-w-2xl">
				<div className="rounded-xl border border-sky-800 bg-sky-950/30 p-4 text-center">
					<div className="text-xs uppercase tracking-wider text-slate-500">
						Incoming issue
					</div>
					<div className="mt-1 flex flex-wrap justify-center gap-1.5">
						{labels.length === 0 &&
						!teamKey &&
						!projectName &&
						!agentTag &&
						!modelTag ? (
							<span className="text-sm text-slate-400">
								no labels — add some above to see routing change
							</span>
						) : (
							<>
								{labels.map((label) => (
									<span
										key={label}
										className="rounded bg-sky-900/60 px-2 py-0.5 text-xs text-sky-200"
									>
										{label}
									</span>
								))}
								{teamKey && (
									<span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
										team: {teamKey}
									</span>
								)}
								{projectName && (
									<span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
										project: {projectName}
									</span>
								)}
								{agentTag && (
									<span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-300">
										[agent={agentTag}]
									</span>
								)}
								{modelTag && (
									<span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-300">
										[model={modelTag}]
									</span>
								)}
							</>
						)}
					</div>
				</div>
				{stages.map((stage) => (
					<div key={stage.id}>
						<div className="py-1 text-center text-slate-600">↓</div>
						<StageCard stage={stage} />
					</div>
				))}
			</div>

			<Section
				title="Label vocabulary"
				description="Every label your current config gives meaning to, plus Cyrus's built-in magic labels."
			>
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="text-left text-xs uppercase tracking-wider text-slate-500">
								<th className="pb-2 pr-4">Label</th>
								<th className="pb-2 pr-4">Kind</th>
								<th className="pb-2">Effect</th>
							</tr>
						</thead>
						<tbody>
							{vocabulary.map((entry, i) => (
								<tr
									key={`${entry.label}-${entry.kind}-${i}`}
									className="border-t border-slate-800"
								>
									<td className="py-1.5 pr-4">
										<button
											type="button"
											className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-sky-300 hover:bg-slate-700"
											onClick={() => {
												const clean = entry.label.split("  /  ")[0] as string;
												if (
													!clean.includes("*") &&
													!clean.includes("+") &&
													!labels.includes(clean)
												) {
													setLabels([...labels, clean]);
												}
											}}
										>
											{entry.label}
										</button>
									</td>
									<td className="py-1.5 pr-4 text-slate-500">{entry.kind}</td>
									<td className="py-1.5 text-slate-300">{entry.effect}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Section>

			<div className="text-xs text-slate-600">
				<Button onClick={() => {
					setLabels([]);
					setTeamKey("");
					setProjectName("");
					setAgentTag("");
					setModelTag("");
				}}>
					Clear simulation
				</Button>
			</div>
		</div>
	);
}
