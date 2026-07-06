import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Button, Section } from "../components/ui";
import type {
	SessionDetail,
	SessionSummary,
	TranscriptRef,
} from "../types";
import { formatBytes, formatTime, formatUsd, timeAgo } from "../util";

function statusStyle(status: string): { dot: string; text: string } {
	switch (status) {
		case "active":
			return { dot: "bg-emerald-400 animate-pulse", text: "text-emerald-300" };
		case "awaitingInput":
		case "pending":
			return { dot: "bg-amber-400", text: "text-amber-300" };
		case "error":
			return { dot: "bg-red-500", text: "text-red-400" };
		case "complete":
			return { dot: "bg-slate-500", text: "text-slate-400" };
		default:
			return { dot: "bg-slate-600", text: "text-slate-500" };
	}
}

function RunnerChip({ session }: { session: SessionSummary }) {
	if (!session.runner) return null;
	return (
		<span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-sky-300">
			{session.runner}
			{session.model ? ` · ${session.model}` : ""}
		</span>
	);
}

function SessionRow({
	session,
	onOpen,
}: {
	session: SessionSummary;
	onOpen: () => void;
}) {
	const style = statusStyle(session.status);
	return (
		<button
			type="button"
			onClick={onOpen}
			className="flex w-full items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-left hover:border-slate-600"
		>
			<span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-2">
					<span className="font-medium text-white">
						{session.issueIdentifier ?? session.id.slice(0, 8)}
					</span>
					<span className="truncate text-sm text-slate-400">
						{session.issueTitle ?? "(standalone session)"}
					</span>
				</div>
				<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
					<span className={style.text}>{session.status}</span>
					<RunnerChip session={session} />
					{session.workspaceName && (
						<span className="font-mono">{session.workspaceName}</span>
					)}
					{session.totalCostUsd !== null && (
						<span>{formatUsd(session.totalCostUsd)}</span>
					)}
					<span>{session.entryCount} activities</span>
				</div>
			</div>
			<span className="shrink-0 text-xs text-slate-500">
				{timeAgo(session.updatedAt)}
			</span>
		</button>
	);
}

const ENTRY_STYLES: Record<string, string> = {
	user: "border-sky-800 bg-sky-950/30",
	assistant: "border-slate-700 bg-slate-900/60",
	system: "border-slate-800 bg-slate-950/60",
	result: "border-emerald-900 bg-emerald-950/30",
};

function TranscriptViewer({ transcript }: { transcript: TranscriptRef }) {
	const [content, setContent] = useState("");
	const [startedMidFile, setStartedMidFile] = useState(false);
	const [follow, setFollow] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const offsetRef = useRef<number | null>(null);
	const preRef = useRef<HTMLPreElement>(null);
	const followRef = useRef(follow);
	followRef.current = follow;

	const poll = useCallback(async () => {
		try {
			const res = await api.tail(transcript.rel, offsetRef.current);
			if (offsetRef.current === null) {
				setContent(res.content);
				setStartedMidFile(res.startedMidFile);
			} else if (res.content) {
				setContent((prev) => prev + res.content);
			}
			offsetRef.current = res.nextOffset;
			setError(null);
			if (followRef.current && preRef.current) {
				// Let React paint the appended text first.
				requestAnimationFrame(() => {
					if (preRef.current)
						preRef.current.scrollTop = preRef.current.scrollHeight;
				});
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, [transcript.rel]);

	useEffect(() => {
		offsetRef.current = null;
		setContent("");
		poll();
		const timer = setInterval(poll, 2000);
		return () => clearInterval(timer);
	}, [poll]);

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<span className="font-mono text-xs text-slate-500">
					{transcript.name} · {formatBytes(transcript.sizeBytes)} · refreshes
					every 2s
				</span>
				<Button onClick={() => setFollow(!follow)}>
					{follow ? "⏸ Pause auto-scroll" : "▶ Follow"}
				</Button>
			</div>
			{startedMidFile && (
				<p className="text-xs text-amber-400">
					Large file — showing the tail (last 64 KB).
				</p>
			)}
			{error && <p className="text-sm text-red-400">{error}</p>}
			<pre
				ref={preRef}
				className="h-[55vh] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-300"
			>
				{content || "(empty)"}
			</pre>
		</div>
	);
}

function SessionDetailView({
	id,
	onBack,
}: {
	id: string;
	onBack: () => void;
}) {
	const [detail, setDetail] = useState<SessionDetail | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [transcript, setTranscript] = useState<TranscriptRef | null>(null);

	const load = useCallback(async () => {
		try {
			const d = await api.session(id);
			setDetail(d);
			setError(null);
			// Preselect the newest markdown transcript.
			setTranscript(
				(prev) => prev ?? d.transcripts.find((t) => t.kind === "md") ?? null,
			);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, [id]);

	useEffect(() => {
		load();
		const timer = setInterval(load, 10_000);
		return () => clearInterval(timer);
	}, [load]);

	if (error)
		return (
			<div>
				<Button onClick={onBack}>← Back</Button>
				<p className="mt-4 text-sm text-red-400">{error}</p>
			</div>
		);
	if (!detail) return <p className="text-slate-500">Loading session…</p>;

	const { session, entries, transcripts } = detail;
	const style = statusStyle(session.status);

	return (
		<div className="space-y-5">
			<div className="flex items-center gap-3">
				<Button onClick={onBack}>← All sessions</Button>
				<span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
				<h2 className="text-lg font-semibold text-white">
					{session.issueIdentifier ?? session.id.slice(0, 8)}
				</h2>
				<span className={`text-sm ${style.text}`}>{session.status}</span>
			</div>

			<Section title="Session">
				<dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
					<div>
						<dt className="text-xs uppercase text-slate-500">Issue</dt>
						<dd className="text-slate-200">{session.issueTitle ?? "—"}</dd>
					</div>
					<div>
						<dt className="text-xs uppercase text-slate-500">Runner</dt>
						<dd className="text-slate-200">
							{session.runner ?? "—"}
							{session.model ? ` · ${session.model}` : ""}
						</dd>
					</div>
					<div>
						<dt className="text-xs uppercase text-slate-500">Cost</dt>
						<dd className="text-slate-200">{formatUsd(session.totalCostUsd)}</dd>
					</div>
					<div>
						<dt className="text-xs uppercase text-slate-500">Branch</dt>
						<dd className="font-mono text-xs text-slate-200">
							{session.branchName ?? "—"}
						</dd>
					</div>
					<div>
						<dt className="text-xs uppercase text-slate-500">Created</dt>
						<dd className="text-slate-200">{formatTime(session.createdAt)}</dd>
					</div>
					<div>
						<dt className="text-xs uppercase text-slate-500">Updated</dt>
						<dd className="text-slate-200">{formatTime(session.updatedAt)}</dd>
					</div>
					<div className="col-span-2">
						<dt className="text-xs uppercase text-slate-500">Worktree</dt>
						<dd className="truncate font-mono text-xs text-slate-200">
							{session.workspacePath ?? "—"}
						</dd>
					</div>
				</dl>
			</Section>

			<Section
				title={`Activity timeline (${entries.length})`}
				description="What Cyrus posted to the issue tracker for this session."
			>
				<div className="max-h-[45vh] space-y-2 overflow-auto pr-1">
					{entries.length === 0 && (
						<p className="text-sm text-slate-500">No activities recorded.</p>
					)}
					{entries.map((entry, i) => (
						<div
							key={`${i}-${entry.timestamp}`}
							className={`rounded-lg border p-3 ${
								entry.isError
									? "border-red-900 bg-red-950/30"
									: (ENTRY_STYLES[entry.type] ?? ENTRY_STYLES.system)
							}`}
						>
							<div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
								<span className="font-semibold uppercase">{entry.type}</span>
								{entry.toolName && (
									<span className="rounded bg-slate-800 px-1.5 font-mono">
										{entry.toolName}
									</span>
								)}
								{entry.timestamp && <span>{formatTime(entry.timestamp)}</span>}
								{entry.durationMs != null && (
									<span>{(entry.durationMs / 1000).toFixed(1)}s</span>
								)}
							</div>
							<div className="whitespace-pre-wrap text-sm text-slate-300">
								{entry.content || "(no content)"}
							</div>
						</div>
					))}
				</div>
			</Section>

			<Section
				title="Raw transcript"
				description="The full agent log written by the runner — updates live while the session runs."
			>
				{transcripts.length === 0 ? (
					<p className="text-sm text-slate-500">
						No transcript files found for this session.
					</p>
				) : (
					<>
						<div className="flex flex-wrap gap-2">
							{transcripts.map((t) => (
								<button
									key={t.rel}
									type="button"
									onClick={() => setTranscript(t)}
									className={`rounded-md border px-2 py-1 font-mono text-xs ${
										transcript?.rel === t.rel
											? "border-sky-600 bg-sky-950/50 text-sky-300"
											: "border-slate-700 text-slate-400 hover:border-slate-500"
									}`}
								>
									{t.kind === "md" ? "📄" : "🧾"} {t.name} (
									{formatBytes(t.sizeBytes)})
								</button>
							))}
						</div>
						{transcript && (
							<TranscriptViewer
								key={transcript.rel}
								transcript={transcript}
							/>
						)}
					</>
				)}
			</Section>
		</div>
	);
}

export function Sessions() {
	const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [openId, setOpenId] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			const res = await api.sessions();
			setSessions(res.sessions);
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	useEffect(() => {
		if (openId) return; // detail view has its own refresh
		load();
		const timer = setInterval(load, 10_000);
		return () => clearInterval(timer);
	}, [load, openId]);

	if (openId) {
		return <SessionDetailView id={openId} onBack={() => setOpenId(null)} />;
	}

	return (
		<div className="space-y-3">
			{error && <p className="text-sm text-red-400">{error}</p>}
			{sessions === null && !error && (
				<p className="text-slate-500">Loading sessions…</p>
			)}
			{sessions?.length === 0 && (
				<Section title="No sessions yet">
					<p className="text-sm text-slate-400">
						When Cyrus processes an issue, its sessions show up here (read from{" "}
						<code className="font-mono">
							~/.cyrus/state/edge-worker-state.json
						</code>
						). Assign an issue to Cyrus in Linear to kick one off.
					</p>
				</Section>
			)}
			{sessions?.map((session) => (
				<SessionRow
					key={session.id}
					session={session}
					onOpen={() => setOpenId(session.id)}
				/>
			))}
		</div>
	);
}
