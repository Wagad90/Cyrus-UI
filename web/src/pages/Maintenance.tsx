import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api";
import { Chips } from "../components/Chips";
import { Button, Field, Section, TextInput } from "../components/ui";
import type {
	BackupInfo,
	DaemonInfo,
	RepoJob,
	RepoWorktrees,
} from "../types";
import { formatBytes, formatTime, timeAgo } from "../util";

function DaemonSection() {
	const [info, setInfo] = useState<DaemonInfo | null>(null);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [needsForce, setNeedsForce] = useState(false);

	const load = useCallback(async () => {
		try {
			setInfo(await api.daemon());
		} catch {
			// best effort
		}
	}, []);

	useEffect(() => {
		load();
		const timer = setInterval(load, 15_000);
		return () => clearInterval(timer);
	}, [load]);

	const restart = async (force: boolean) => {
		setBusy(true);
		setError(null);
		setMessage(null);
		try {
			await api.restartDaemon(force);
			setNeedsForce(false);
			setMessage(
				"Restart command sent. Cyrus should be back within a few seconds.",
			);
			setTimeout(load, 4000);
		} catch (e) {
			if (e instanceof ApiError && e.status === 409) {
				setNeedsForce(true);
				setError(e.message);
			} else {
				setError(e instanceof Error ? e.message : String(e));
			}
		} finally {
			setBusy(false);
		}
	};

	return (
		<Section
			title="Cyrus daemon"
			description="Restart is refused while a session is running unless you force it."
		>
			<div className="flex flex-wrap items-center gap-4 text-sm">
				<span>
					State:{" "}
					{info?.reachable ? (
						<span
							className={
								info.status === "busy" ? "text-amber-400" : "text-emerald-400"
							}
						>
							● {info.status ?? "running"}
						</span>
					) : (
						<span className="text-red-400">● unreachable</span>
					)}
				</span>
				{info?.service.activeState && (
					<span className="text-slate-400">
						systemd: {info.service.activeState}
						{info.service.sinceTimestamp
							? ` (since ${info.service.sinceTimestamp})`
							: ""}
					</span>
				)}
				{info?.version && (
					<span className="text-slate-500">v{info.version}</span>
				)}
			</div>
			<div className="flex items-center gap-2">
				<Button kind="primary" disabled={busy} onClick={() => restart(false)}>
					{busy ? "Restarting…" : "Restart Cyrus"}
				</Button>
				{needsForce && (
					<Button kind="danger" disabled={busy} onClick={() => restart(true)}>
						Force restart (kills the running session)
					</Button>
				)}
			</div>
			{info && (
				<p className="font-mono text-xs text-slate-600">
					runs: {info.restartCommand}
				</p>
			)}
			{message && <p className="text-sm text-emerald-400">{message}</p>}
			{error && <p className="text-sm text-red-400">{error}</p>}
		</Section>
	);
}

function AddRepoSection() {
	const [url, setUrl] = useState("");
	const [name, setName] = useState("");
	const [baseBranch, setBaseBranch] = useState("");
	const [labels, setLabels] = useState<string[]>([]);
	const [job, setJob] = useState<RepoJob | null>(null);
	const [error, setError] = useState<string | null>(null);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		return () => {
			if (timerRef.current) clearInterval(timerRef.current);
		};
	}, []);

	const start = async () => {
		setError(null);
		setJob(null);
		try {
			const { jobId } = await api.cloneRepo({
				url,
				name: name || undefined,
				baseBranch: baseBranch || undefined,
				routingLabels: labels.length ? labels : undefined,
			});
			const poll = async () => {
				const j = await api.job(jobId);
				setJob(j);
				if (j.state !== "running" && timerRef.current) {
					clearInterval(timerRef.current);
					timerRef.current = null;
				}
			};
			await poll();
			timerRef.current = setInterval(poll, 1500);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	return (
		<Section
			title="Add repository"
			description="Clones into ~/.cyrus/repos and registers it in config.json — same as `cyrus self-add-repo`, no SSH needed. Cyrus picks it up without a restart."
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Git URL">
					<TextInput
						value={url}
						onChange={setUrl}
						placeholder="https://github.com/you/repo.git"
						mono
					/>
				</Field>
				<Field label="Name (optional)" hint="Defaults to the repo name from the URL.">
					<TextInput value={name} onChange={setName} placeholder="my-app" mono />
				</Field>
				<Field label="Base branch (optional)" hint="Auto-detected if empty.">
					<TextInput
						value={baseBranch}
						onChange={setBaseBranch}
						placeholder="main"
						mono
					/>
				</Field>
				<Field
					label="Routing labels (optional)"
					hint="Defaults to the repository name."
				>
					<Chips value={labels} onChange={setLabels} placeholder="backend…" />
				</Field>
			</div>
			<Button
				kind="primary"
				disabled={!url || job?.state === "running"}
				onClick={start}
			>
				{job?.state === "running" ? "Cloning…" : "Clone & add"}
			</Button>
			{error && <p className="text-sm text-red-400">{error}</p>}
			{job && (
				<div
					className={`rounded-lg border p-3 ${
						job.state === "error"
							? "border-red-900 bg-red-950/30"
							: job.state === "done"
								? "border-emerald-900 bg-emerald-950/30"
								: "border-slate-700 bg-slate-950/50"
					}`}
				>
					<div className="mb-1 text-xs uppercase tracking-wider text-slate-500">
						{job.repoName} — {job.state}
					</div>
					<pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs text-slate-300">
						{job.log.join("\n")}
					</pre>
				</div>
			)}
		</Section>
	);
}

function WorktreesSection() {
	const [repos, setRepos] = useState<RepoWorktrees[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [removing, setRemoving] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			const res = await api.worktrees();
			setRepos(res.repos);
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const remove = async (repoId: string, path: string, active: string | null) => {
		const warning = active
			? `⚠ Session ${active} is still using this worktree!\n\nRemove ${path} anyway?`
			: `Remove worktree ${path}?\n\nThe branch and any pushed commits survive; uncommitted local changes are lost.`;
		if (!window.confirm(warning)) return;
		setRemoving(path);
		try {
			await api.removeWorktree(repoId, path);
			await load();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setRemoving(null);
		}
	};

	const total = repos?.reduce((n, r) => n + r.worktrees.length, 0) ?? 0;

	return (
		<Section
			title={`Worktrees${repos ? ` (${total})` : ""}`}
			description="Per-issue git worktrees Cyrus created. Removing one frees disk space; finished issues' worktrees are safe to clean up."
		>
			{error && <p className="text-sm text-red-400">{error}</p>}
			{repos === null && !error && (
				<p className="text-sm text-slate-500">Scanning…</p>
			)}
			{repos?.map((repo) => (
				<div key={repo.repoId}>
					<div className="mb-1 text-sm font-medium text-slate-300">
						{repo.repoName}
					</div>
					{repo.error && (
						<p className="text-sm text-amber-400">{repo.error}</p>
					)}
					{repo.worktrees.length === 0 && !repo.error && (
						<p className="text-sm text-slate-500">No worktrees.</p>
					)}
					<div className="space-y-1">
						{repo.worktrees.map((wt) => (
							<div
								key={wt.path}
								className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm"
							>
								<div className="min-w-0 flex-1">
									<div className="truncate font-mono text-xs text-slate-300">
										{wt.path}
									</div>
									<div className="mt-0.5 flex flex-wrap gap-2 text-xs text-slate-500">
										{wt.branch && <span>⎇ {wt.branch}</span>}
										{wt.sizeBytes !== null && (
											<span>{formatBytes(wt.sizeBytes)}</span>
										)}
										{wt.mtimeMs && <span>{timeAgo(wt.mtimeMs)}</span>}
										{wt.activeSession && (
											<span className="text-amber-400">
												in use by {wt.activeSession}
											</span>
										)}
									</div>
								</div>
								<Button
									kind="danger"
									disabled={removing === wt.path}
									onClick={() => remove(repo.repoId, wt.path, wt.activeSession)}
								>
									{removing === wt.path ? "Removing…" : "Remove"}
								</Button>
							</div>
						))}
					</div>
				</div>
			))}
			<Button onClick={load}>Refresh</Button>
		</Section>
	);
}

function BackupsSection() {
	const [backups, setBackups] = useState<BackupInfo[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [viewing, setViewing] = useState<{ name: string; json: string } | null>(
		null,
	);

	const load = useCallback(async () => {
		try {
			const res = await api.backups();
			setBackups(res.backups);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const act = async (fn: () => Promise<unknown>, done: string) => {
		setError(null);
		setMessage(null);
		try {
			await fn();
			setMessage(done);
			await load();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	return (
		<Section
			title={`Config backups${backups ? ` (${backups.length})` : ""}`}
			description="Every save from this UI (and restore) creates one. Restoring first backs up the current config, so it's reversible."
		>
			{message && <p className="text-sm text-emerald-400">{message}</p>}
			{error && <p className="text-sm text-red-400">{error}</p>}
			<div className="space-y-1">
				{backups?.map((backup) => (
					<div
						key={backup.name}
						className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm"
					>
						<div className="min-w-0 flex-1">
							<span className="font-mono text-xs text-slate-300">
								{backup.name}
							</span>
							<span className="ml-3 text-xs text-slate-500">
								{formatTime(backup.mtimeMs)} · {formatBytes(backup.sizeBytes)}
							</span>
						</div>
						<Button
							onClick={async () => {
								const res = await api.backup(backup.name);
								setViewing({
									name: backup.name,
									json: JSON.stringify(res.config, null, 2),
								});
							}}
						>
							View
						</Button>
						<Button
							onClick={() => {
								if (
									window.confirm(
										`Restore ${backup.name} as the live config? The current config is backed up first.`,
									)
								) {
									act(
										() => api.restoreBackup(backup.name),
										"Restored. Cyrus hot-reloads the config; reload this page to see it.",
									);
								}
							}}
						>
							Restore
						</Button>
						<Button
							kind="danger"
							onClick={() =>
								act(() => api.deleteBackup(backup.name), "Deleted.")
							}
						>
							Delete
						</Button>
					</div>
				))}
				{backups?.length === 0 && (
					<p className="text-sm text-slate-500">No backups yet.</p>
				)}
			</div>
			{(backups?.length ?? 0) > 10 && (
				<Button
					onClick={() =>
						act(
							() => api.pruneBackups(10),
							"Pruned — kept the 10 newest backups.",
						)
					}
				>
					Prune (keep newest 10)
				</Button>
			)}
			{viewing && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
					<div className="flex max-h-full w-full max-w-3xl flex-col rounded-xl border border-slate-700 bg-slate-900">
						<div className="border-b border-slate-800 px-5 py-3 font-mono text-sm text-slate-300">
							{viewing.name}
						</div>
						<pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs text-slate-300">
							{viewing.json}
						</pre>
						<div className="flex justify-end border-t border-slate-800 px-5 py-3">
							<Button onClick={() => setViewing(null)}>Close</Button>
						</div>
					</div>
				</div>
			)}
		</Section>
	);
}

export function Maintenance() {
	return (
		<div className="space-y-5">
			<DaemonSection />
			<AddRepoSection />
			<WorktreesSection />
			<BackupsSection />
		</div>
	);
}
