import { useEffect, useState } from "react";
import { api } from "../api";
import { Section } from "../components/ui";
import type { UsageBucket, UsageReport } from "../types";
import { formatTokens, formatUsd } from "../util";

function StatCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
			<div className="text-xs uppercase tracking-wider text-slate-500">
				{label}
			</div>
			<div className="mt-1 text-2xl font-semibold text-white">{value}</div>
		</div>
	);
}

function BucketTable({
	title,
	rows,
	description,
}: {
	title: string;
	rows: [string, UsageBucket][];
	description?: string;
}) {
	const sorted = [...rows].sort((a, b) => b[1].costUsd - a[1].costUsd);
	return (
		<Section title={title} description={description}>
			{sorted.length === 0 ? (
				<p className="text-sm text-slate-500">No data yet.</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="text-left text-xs uppercase tracking-wider text-slate-500">
								<th className="pb-2 pr-4"> </th>
								<th className="pb-2 pr-4">Cost</th>
								<th className="pb-2 pr-4">Runs</th>
								<th className="pb-2 pr-4">Input</th>
								<th className="pb-2 pr-4">Output</th>
								<th className="pb-2">Cache read</th>
							</tr>
						</thead>
						<tbody>
							{sorted.map(([key, bucket]) => (
								<tr key={key} className="border-t border-slate-800">
									<td className="py-2 pr-4 font-mono text-xs text-slate-300">
										{key}
									</td>
									<td className="py-2 pr-4 text-slate-200">
										{formatUsd(bucket.costUsd)}
									</td>
									<td className="py-2 pr-4 text-slate-400">
										{bucket.sessionRuns}
									</td>
									<td className="py-2 pr-4 text-slate-400">
										{formatTokens(bucket.inputTokens)}
									</td>
									<td className="py-2 pr-4 text-slate-400">
										{formatTokens(bucket.outputTokens)}
									</td>
									<td className="py-2 text-slate-400">
										{formatTokens(bucket.cacheReadTokens)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</Section>
	);
}

export function Usage() {
	const [report, setReport] = useState<UsageReport | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		api
			.usage()
			.then(setReport)
			.catch((e) => setError(e instanceof Error ? e.message : String(e)));
	}, []);

	if (error) return <p className="text-sm text-red-400">{error}</p>;
	if (!report)
		return (
			<p className="text-slate-500">
				Scanning transcripts… (first load parses every session log; repeat
				visits are cached)
			</p>
		);

	const days = Object.entries(report.byDay)
		.filter(([day]) => day !== "unknown")
		.sort((a, b) => b[0].localeCompare(a[0]))
		.slice(0, 14);

	return (
		<div className="space-y-5">
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<StatCard label="Total cost" value={formatUsd(report.totals.costUsd)} />
				<StatCard label="Runs" value={String(report.totals.sessionRuns)} />
				<StatCard
					label="Output tokens"
					value={formatTokens(report.totals.outputTokens)}
				/>
				<StatCard
					label="Cache read"
					value={formatTokens(report.totals.cacheReadTokens)}
				/>
			</div>
			<p className="text-xs text-slate-500">
				Aggregated from {report.filesScanned} session transcript
				{report.filesScanned === 1 ? "" : "s"} in ~/.cyrus/logs. Costs come
				from the runner's own reports (BYOK API pricing; subscription-token
				sessions may report $0).
			</p>
			<BucketTable title="By day (last 14)" rows={days} />
			<BucketTable
				title="By model"
				rows={Object.entries(report.byModel)}
			/>
			<BucketTable
				title="By workspace"
				rows={Object.entries(report.byWorkspace)}
				description="Workspace = the worktree directory name, usually the issue identifier."
			/>
		</div>
	);
}
