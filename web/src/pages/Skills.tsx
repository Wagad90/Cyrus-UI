import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Chips } from "../components/Chips";
import { Button, Field, Section, inputClass } from "../components/ui";
import type { CyrusConfig, SkillInfo, SkillScope, SkillsList } from "../types";
import { timeAgo } from "../util";

function SkillEditor({
	root,
	name,
	repos,
	onClose,
	onSaved,
	isNew,
}: {
	root: "default" | "user";
	name: string;
	repos: { id: string; name: string }[];
	onClose: () => void;
	onSaved: () => void;
	isNew?: boolean;
}) {
	const [content, setContent] = useState("");
	const [scope, setScope] = useState<SkillScope | null>(null);
	const [loaded, setLoaded] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	useEffect(() => {
		if (isNew) {
			setContent(
				`---\nname: ${name}\ndescription: What this skill teaches the agent to do.\n---\n\n# ${name}\n\nInstructions for the agent…\n`,
			);
			setLoaded(true);
			return;
		}
		api
			.skill(root, name)
			.then((res) => {
				setContent(res.content);
				setScope(res.scope);
				setLoaded(true);
			})
			.catch((e) => setError(e instanceof Error ? e.message : String(e)));
	}, [root, name, isNew]);

	const save = async () => {
		setError(null);
		try {
			await api.saveSkill(root, name, content, root === "user" ? scope : undefined);
			setMessage("Saved. New agent sessions pick this up automatically.");
			onSaved();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	const updateScope = (key: keyof SkillScope, values: string[]) => {
		setScope((prev) => {
			const next: SkillScope = { ...(prev ?? {}) };
			if (values.length) next[key] = values;
			else delete next[key];
			return Object.keys(next).length ? next : null;
		});
	};

	if (!loaded && !error) return <p className="text-sm text-slate-500">Loading…</p>;

	return (
		<div className="space-y-3 border-t border-slate-800 pt-3">
			<textarea
				className="h-[45vh] w-full rounded-md border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
				value={content}
				spellCheck={false}
				onChange={(e) => setContent(e.target.value)}
			/>
			{root === "user" && (
				<div className="grid gap-3 lg:grid-cols-3">
					<Field
						label="Scope: repositories"
						hint="Empty = every repository. Pick repo IDs from your config."
					>
						<Chips
							value={scope?.repositoryIds ?? []}
							onChange={(next) => updateScope("repositoryIds", next)}
							suggestions={repos.map((r) => r.id)}
							placeholder="repo id…"
						/>
					</Field>
					<Field
						label="Scope: Linear team IDs"
						hint="Linear team UUIDs (not team keys)."
					>
						<Chips
							value={scope?.linearTeamIds ?? []}
							onChange={(next) => updateScope("linearTeamIds", next)}
							placeholder="team uuid…"
						/>
					</Field>
					<Field
						label="Scope: Linear label IDs"
						hint="Linear label UUIDs (not label names)."
					>
						<Chips
							value={scope?.linearLabelIds ?? []}
							onChange={(next) => updateScope("linearLabelIds", next)}
							placeholder="label uuid…"
						/>
					</Field>
				</div>
			)}
			{error && <p className="text-sm text-red-400">{error}</p>}
			{message && <p className="text-sm text-emerald-400">{message}</p>}
			<div className="flex gap-2">
				<Button kind="primary" onClick={save}>
					Save skill
				</Button>
				<Button onClick={onClose}>Close</Button>
			</div>
		</div>
	);
}

function SkillCard({
	skill,
	root,
	repos,
	open,
	onToggle,
	onChanged,
	onDelete,
}: {
	skill: SkillInfo;
	root: "default" | "user";
	repos: { id: string; name: string }[];
	open: boolean;
	onToggle: () => void;
	onChanged: () => void;
	onDelete?: () => void;
}) {
	return (
		<div className="rounded-lg border border-slate-800 bg-slate-950/50">
			<div className="flex items-center gap-3 px-3 py-2">
				<button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
					<span className="font-mono text-sm text-sky-300">{skill.name}</span>
					<span className="ml-3 text-xs text-slate-500">
						{skill.description ?? "(no description)"}
					</span>
				</button>
				<span className="shrink-0 text-xs text-slate-600">
					{timeAgo(skill.mtimeMs)}
				</span>
				{skill.scope && (
					<span className="shrink-0 rounded bg-slate-800 px-1.5 text-xs text-amber-300">
						scoped
					</span>
				)}
				{onDelete && (
					<Button kind="danger" onClick={onDelete}>
						✕
					</Button>
				)}
			</div>
			{open && (
				<div className="px-3 pb-3">
					<SkillEditor
						root={root}
						name={skill.name}
						repos={repos}
						onClose={onToggle}
						onSaved={onChanged}
					/>
				</div>
			)}
		</div>
	);
}

export function Skills({ config }: { config: CyrusConfig }) {
	const [skills, setSkills] = useState<SkillsList | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [open, setOpen] = useState<string | null>(null);
	const [newName, setNewName] = useState("");
	const [creating, setCreating] = useState<string | null>(null);
	const [note, setNote] = useState<string | null>(null);

	const repos = (config.repositories ?? []).map((r) => ({
		id: r.id,
		name: r.name,
	}));

	const load = useCallback(async () => {
		try {
			setSkills(await api.skills());
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	return (
		<div className="space-y-5">
			{error && <p className="text-sm text-red-400">{error}</p>}
			{note && <p className="text-sm text-amber-300">{note}</p>}

			<Section
				title="Workflow skills (defaults)"
				description="These markdown files define what actually happens on each request — investigation, implementation, verification, shipping, summarizing. Cyrus deployed them once and never overwrites them: your edits here ARE the supported way to customize the agent's workflow."
			>
				{skills && !skills.defaultsDeployed && (
					<p className="text-sm text-amber-400">
						Not deployed yet — they appear after Cyrus's first start (or after
						a restart if you just reset them).
					</p>
				)}
				<div className="space-y-1">
					{skills?.defaults.map((skill) => (
						<SkillCard
							key={skill.name}
							skill={skill}
							root="default"
							repos={repos}
							open={open === `default/${skill.name}`}
							onToggle={() =>
								setOpen(
									open === `default/${skill.name}`
										? null
										: `default/${skill.name}`,
								)
							}
							onChanged={load}
						/>
					))}
				</div>
				{skills?.defaultsDeployed && (
					<Button
						kind="danger"
						onClick={async () => {
							if (
								window.confirm(
									"Reset ALL default workflow skills? Your customizations to them are deleted; pristine copies are redeployed on the next Cyrus restart (Maintenance tab).",
								)
							) {
								const res = await api.resetDefaultSkills();
								setNote(res.note);
								await load();
							}
						}}
					>
						Reset all defaults…
					</Button>
				)}
			</Section>

			<Section
				title="My skills"
				description="Your own named workflows. Unscoped skills are available in every session; scope one to specific repositories (or Linear team/label UUIDs) to limit where it applies."
			>
				<div className="space-y-1">
					{skills?.user.map((skill) => (
						<SkillCard
							key={skill.name}
							skill={skill}
							root="user"
							repos={repos}
							open={open === `user/${skill.name}`}
							onToggle={() =>
								setOpen(
									open === `user/${skill.name}` ? null : `user/${skill.name}`,
								)
							}
							onChanged={load}
							onDelete={async () => {
								if (window.confirm(`Delete skill "${skill.name}"?`)) {
									await api.deleteSkill("user", skill.name);
									await load();
								}
							}}
						/>
					))}
					{skills?.user.length === 0 && (
						<p className="text-sm text-slate-500">No custom skills yet.</p>
					)}
				</div>
				{creating ? (
					<SkillEditor
						root="user"
						name={creating}
						repos={repos}
						isNew
						onClose={() => setCreating(null)}
						onSaved={() => {
							setCreating(null);
							load();
						}}
					/>
				) : (
					<div className="flex gap-2">
						<input
							className={`${inputClass} w-64 font-mono`}
							placeholder="new-skill-name"
							value={newName}
							onChange={(e) =>
								setNewName(e.target.value.toLowerCase().replace(/\s+/g, "-"))
							}
						/>
						<Button
							kind="primary"
							disabled={!/^[a-z0-9][a-z0-9_-]*$/.test(newName)}
							onClick={() => {
								setCreating(newName);
								setNewName("");
							}}
						>
							+ Create skill
						</Button>
					</div>
				)}
			</Section>
		</div>
	);
}
