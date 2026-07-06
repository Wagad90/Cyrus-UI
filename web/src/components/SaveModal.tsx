import { useMemo, useState } from "react";
import { ApiError, api } from "../api";
import { diffLines } from "../diff";
import type { ConfigResponse, CyrusConfig } from "../types";
import { Button } from "./ui";

export function SaveModal({
	original,
	draft,
	mtimeMs,
	onSaved,
	onClose,
}: {
	original: CyrusConfig;
	draft: CyrusConfig;
	mtimeMs: number | null;
	onSaved: (fresh: ConfigResponse, backupPath: string | null) => void;
	onClose: () => void;
}) {
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
	const [conflict, setConflict] = useState(false);

	const diff = useMemo(
		() =>
			diffLines(
				JSON.stringify(original, null, 2),
				JSON.stringify(draft, null, 2),
			),
		[original, draft],
	);

	const save = async () => {
		setSaving(true);
		setError(null);
		setIssues([]);
		setConflict(false);
		try {
			const result = await api.putConfig(draft, mtimeMs);
			const fresh = await api.getConfig();
			onSaved(fresh, result.backupPath);
		} catch (e) {
			if (e instanceof ApiError && e.status === 409) {
				setConflict(true);
				setError(
					"config.json was changed on disk (by Cyrus or another editor) after you loaded it.",
				);
			} else if (e instanceof ApiError && e.status === 422) {
				setError("Validation failed — nothing was written:");
				setIssues(
					((e.payload as { issues?: { path: string; message: string }[] })
						?.issues ?? []) as { path: string; message: string }[],
				);
			} else {
				setError(e instanceof Error ? e.message : String(e));
			}
		} finally {
			setSaving(false);
		}
	};

	const reloadFromDisk = async () => {
		const fresh = await api.getConfig();
		onSaved(fresh, null); // resets draft to disk state — caller warns about discard
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
			<div className="flex max-h-full w-full max-w-3xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
				<div className="border-b border-slate-800 px-5 py-4">
					<h2 className="text-lg font-semibold text-white">Review changes</h2>
					<p className="text-sm text-slate-400">
						This diff is what will be written to config.json (secrets stay
						masked here — real values are preserved server-side). Cyrus applies
						the change live, no restart needed. A timestamped backup is made
						first.
					</p>
				</div>
				<div className="min-h-0 flex-1 overflow-auto p-4">
					<pre className="text-xs leading-5">
						{diff.map((line, i) => (
							<div
								key={`${i}-${line.text.slice(0, 20)}`}
								className={
									line.type === "add"
										? "bg-emerald-950/60 text-emerald-300"
										: line.type === "del"
											? "bg-red-950/60 text-red-300"
											: line.type === "skip"
												? "text-slate-600"
												: "text-slate-400"
								}
							>
								{line.type === "add"
									? "+ "
									: line.type === "del"
										? "- "
										: "  "}
								{line.text}
							</div>
						))}
					</pre>
				</div>
				{error && (
					<div className="mx-5 mb-2 rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
						{error}
						{issues.length > 0 && (
							<ul className="mt-1 list-inside list-disc">
								{issues.map((issue) => (
									<li key={issue.path}>
										<code className="font-mono">{issue.path || "(root)"}</code>:{" "}
										{issue.message}
									</li>
								))}
							</ul>
						)}
					</div>
				)}
				<div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
					<Button onClick={onClose}>Keep editing</Button>
					{conflict ? (
						<Button kind="danger" onClick={reloadFromDisk}>
							Reload from disk (discards my edits)
						</Button>
					) : (
						<Button kind="primary" onClick={save} disabled={saving}>
							{saving ? "Saving…" : "Save to config.json"}
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
