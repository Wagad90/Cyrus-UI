import { Section, Button } from "../components/ui";
import type { CyrusConfig, StatusResponse } from "../types";
import { formatTime } from "../util";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div>
			<dt className="text-xs uppercase tracking-wider text-slate-500">
				{label}
			</dt>
			<dd className="mt-0.5 text-sm text-slate-200">{value}</dd>
		</div>
	);
}

export function Overview({
	status,
	onRefresh,
	config,
	meta,
}: {
	status: StatusResponse | null;
	onRefresh: () => void;
	config: CyrusConfig;
	meta: { path: string; exists: boolean; mtimeMs: number | null };
}) {
	const repos = config.repositories ?? [];
	const active = repos.filter((r) => r.isActive !== false);
	const workspaces = Object.entries(config.linearWorkspaces ?? {});
	const cyrus = status?.cyrus;

	return (
		<div className="space-y-5">
			<Section
				title="Cyrus daemon"
				description="Live state of the Cyrus process on this machine, read from its local HTTP endpoints."
			>
				<dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
					<Stat
						label="State"
						value={
							cyrus?.reachable ? (
								<span
									className={
										cyrus.status === "busy"
											? "text-amber-400"
											: "text-emerald-400"
									}
								>
									● {cyrus.status ?? "running"}
								</span>
							) : (
								<span className="text-red-400">● unreachable</span>
							)
						}
					/>
					<Stat label="Cyrus version" value={cyrus?.version ?? "—"} />
					<Stat label="Daemon port" value={cyrus?.port ?? "—"} />
					<Stat label="UI version" value={status?.ui.version ?? "—"} />
				</dl>
				{!cyrus?.reachable && (
					<p className="text-sm text-amber-400">
						Can't reach the Cyrus daemon on port {cyrus?.port}. Config editing
						still works — Cyrus reads config.json from disk when it starts (and
						hot-reloads it while running).
					</p>
				)}
				<Button onClick={onRefresh}>Refresh</Button>
			</Section>

			<Section title="Configuration file">
				<dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<Stat label="Path" value={<code className="font-mono text-xs">{meta.path}</code>} />
					<Stat
						label="Exists"
						value={meta.exists ? "yes" : "not yet created"}
					/>
					<Stat label="Last modified" value={formatTime(meta.mtimeMs)} />
				</dl>
			</Section>

			<Section title="Repositories">
				{repos.length === 0 ? (
					<p className="text-sm text-slate-500">
						No repositories configured. Add one on the Cyrus host with{" "}
						<code className="font-mono">cyrus self-add-repo &lt;git-url&gt;</code>{" "}
						— it appears here automatically.
					</p>
				) : (
					<div className="grid gap-3 sm:grid-cols-2">
						{repos.map((repo) => (
							<div
								key={repo.id}
								className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"
							>
								<div className="flex items-center justify-between">
									<span className="font-medium text-slate-200">
										{repo.name}
									</span>
									<span
										className={`text-xs ${
											repo.isActive === false
												? "text-slate-500"
												: "text-emerald-400"
										}`}
									>
										{repo.isActive === false ? "inactive" : "active"}
									</span>
								</div>
								<div className="mt-1 truncate font-mono text-xs text-slate-500">
									{repo.repositoryPath}
								</div>
								<div className="mt-2 flex flex-wrap gap-1 text-xs text-slate-400">
									{repo.model && <span>model: {repo.model}</span>}
									{(repo.teamKeys?.length ?? 0) > 0 && (
										<span>teams: {repo.teamKeys?.join(", ")}</span>
									)}
									{(repo.routingLabels?.length ?? 0) > 0 && (
										<span>labels: {repo.routingLabels?.join(", ")}</span>
									)}
								</div>
							</div>
						))}
					</div>
				)}
				<p className="text-xs text-slate-500">
					{active.length} of {repos.length} active
				</p>
			</Section>

			<Section title="Linear workspaces">
				{workspaces.length === 0 ? (
					<p className="text-sm text-slate-500">
						None connected. Run{" "}
						<code className="font-mono">cyrus self-auth-linear</code> on the
						host.
					</p>
				) : (
					<ul className="space-y-1 text-sm">
						{workspaces.map(([id, ws]) => (
							<li key={id} className="flex items-center gap-2">
								<span className="text-emerald-400">●</span>
								<span>{ws.linearWorkspaceName ?? ws.linearWorkspaceSlug ?? id}</span>
								<span className="font-mono text-xs text-slate-600">{id}</span>
							</li>
						))}
					</ul>
				)}
			</Section>
		</div>
	);
}
