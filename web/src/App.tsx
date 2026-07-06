import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, api } from "./api";
import { SaveModal } from "./components/SaveModal";
import { Button } from "./components/ui";
import { AccessControl } from "./pages/AccessControl";
import { GlobalSettings } from "./pages/GlobalSettings";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { RawJson } from "./pages/RawJson";
import { Repositories } from "./pages/Repositories";
import type { ConfigResponse, CyrusConfig, StatusResponse } from "./types";

type Tab = "overview" | "global" | "repositories" | "access" | "raw";

const TABS: { id: Tab; label: string }[] = [
	{ id: "overview", label: "Overview" },
	{ id: "global", label: "Global Settings" },
	{ id: "repositories", label: "Repositories" },
	{ id: "access", label: "Access Control" },
	{ id: "raw", label: "Raw JSON" },
];

export default function App() {
	const [authState, setAuthState] = useState<"loading" | "anon" | "authed">(
		"loading",
	);
	const [passwordConfigured, setPasswordConfigured] = useState(true);

	useEffect(() => {
		api
			.me()
			.then((me) => {
				setPasswordConfigured(me.passwordConfigured);
				setAuthState(me.authenticated ? "authed" : "anon");
			})
			.catch(() => setAuthState("anon"));
	}, []);

	if (authState === "loading") {
		return (
			<div className="flex min-h-screen items-center justify-center text-slate-500">
				Loading…
			</div>
		);
	}
	if (authState === "anon") {
		return (
			<Login
				passwordConfigured={passwordConfigured}
				onLogin={() => setAuthState("authed")}
			/>
		);
	}
	return <Shell onLogout={() => setAuthState("anon")} />;
}

function Shell({ onLogout }: { onLogout: () => void }) {
	const [tab, setTab] = useState<Tab>("overview");
	const [meta, setMeta] = useState<{
		path: string;
		exists: boolean;
		mtimeMs: number | null;
	} | null>(null);
	const [original, setOriginal] = useState<CyrusConfig | null>(null);
	const [draft, setDraft] = useState<CyrusConfig | null>(null);
	const [status, setStatus] = useState<StatusResponse | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [showSave, setShowSave] = useState(false);
	const [savedNote, setSavedNote] = useState<string | null>(null);

	const handleAuthError = useCallback(
		(e: unknown) => {
			if (e instanceof ApiError && e.status === 401) onLogout();
			else setLoadError(e instanceof Error ? e.message : String(e));
		},
		[onLogout],
	);

	const loadConfig = useCallback(async () => {
		try {
			const res = await api.getConfig();
			setMeta({ path: res.path, exists: res.exists, mtimeMs: res.mtimeMs });
			setOriginal(res.config);
			setDraft(structuredClone(res.config));
			setLoadError(null);
		} catch (e) {
			handleAuthError(e);
		}
	}, [handleAuthError]);

	const loadStatus = useCallback(async () => {
		try {
			setStatus(await api.status());
		} catch {
			// status is best-effort
		}
	}, []);

	useEffect(() => {
		loadConfig();
		loadStatus();
		const timer = setInterval(loadStatus, 30_000);
		return () => clearInterval(timer);
	}, [loadConfig, loadStatus]);

	const dirty = useMemo(
		() =>
			original !== null &&
			draft !== null &&
			JSON.stringify(original) !== JSON.stringify(draft),
		[original, draft],
	);

	const updateDraft = useCallback(
		(mutate: (next: CyrusConfig) => void) => {
			setDraft((prev) => {
				if (!prev) return prev;
				const next = structuredClone(prev);
				mutate(next);
				return next;
			});
		},
		[],
	);

	const onSaved = (fresh: ConfigResponse, backupPath: string | null) => {
		setMeta({ path: fresh.path, exists: fresh.exists, mtimeMs: fresh.mtimeMs });
		setOriginal(fresh.config);
		setDraft(structuredClone(fresh.config));
		setShowSave(false);
		setSavedNote(
			backupPath
				? `Saved. Cyrus picks the change up live. Backup: ${backupPath}`
				: "Reloaded from disk.",
		);
		setTimeout(() => setSavedNote(null), 6000);
	};

	const cyrus = status?.cyrus;
	const statusDot = !cyrus?.reachable
		? { color: "bg-red-500", label: "Cyrus unreachable" }
		: cyrus.status === "busy"
			? { color: "bg-amber-400", label: "Cyrus busy" }
			: { color: "bg-emerald-500", label: "Cyrus idle" };

	return (
		<div className="flex min-h-screen">
			<aside className="flex w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900/40 p-4">
				<div className="mb-6 flex items-center gap-2">
					<span className="text-2xl">🎛️</span>
					<div>
						<div className="font-semibold text-white">Cyrus Control</div>
						<div className="flex items-center gap-1.5 text-xs text-slate-500">
							<span className={`h-2 w-2 rounded-full ${statusDot.color}`} />
							{statusDot.label}
						</div>
					</div>
				</div>
				<nav className="space-y-1">
					{TABS.map((t) => (
						<button
							key={t.id}
							type="button"
							onClick={() => setTab(t.id)}
							className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
								tab === t.id
									? "bg-sky-600/20 font-medium text-sky-300"
									: "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
							}`}
						>
							{t.label}
						</button>
					))}
				</nav>
				<div className="mt-auto space-y-2 pt-6">
					{cyrus?.version && (
						<p className="text-xs text-slate-600">cyrus v{cyrus.version}</p>
					)}
					<Button
						onClick={async () => {
							await api.logout();
							onLogout();
						}}
					>
						Sign out
					</Button>
				</div>
			</aside>

			<main className="min-w-0 flex-1 p-6 pb-24">
				<div className="mx-auto max-w-5xl">
					<h1 className="mb-5 text-xl font-semibold text-white">
						{TABS.find((t) => t.id === tab)?.label}
					</h1>
					{loadError && (
						<div className="mb-4 rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
							{loadError}{" "}
							<button
								type="button"
								className="underline"
								onClick={loadConfig}
							>
								Retry
							</button>
						</div>
					)}
					{savedNote && (
						<div className="mb-4 rounded-md border border-emerald-900 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-300">
							{savedNote}
						</div>
					)}
					{draft && meta ? (
						<>
							{tab === "overview" && (
								<Overview
									status={status}
									onRefresh={loadStatus}
									config={draft}
									meta={meta}
								/>
							)}
							{tab === "global" && (
								<GlobalSettings config={draft} update={updateDraft} />
							)}
							{tab === "repositories" && (
								<Repositories config={draft} update={updateDraft} />
							)}
							{tab === "access" && (
								<AccessControl config={draft} update={updateDraft} />
							)}
							{tab === "raw" && (
								<RawJson draft={draft} setDraft={(next) => setDraft(next)} />
							)}
						</>
					) : (
						!loadError && <p className="text-slate-500">Loading config…</p>
					)}
				</div>
			</main>

			{dirty && (
				<div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-700 bg-slate-900/95 px-6 py-3 backdrop-blur">
					<div className="mx-auto flex max-w-5xl items-center justify-between">
						<span className="text-sm text-amber-300">
							Unsaved changes — nothing is written until you review &amp; save.
						</span>
						<div className="flex gap-2">
							<Button
								onClick={() => setDraft(structuredClone(original) as CyrusConfig)}
							>
								Discard
							</Button>
							<Button kind="primary" onClick={() => setShowSave(true)}>
								Review &amp; Save
							</Button>
						</div>
					</div>
				</div>
			)}

			{showSave && original && draft && meta && (
				<SaveModal
					original={original}
					draft={draft}
					mtimeMs={meta.mtimeMs}
					onSaved={onSaved}
					onClose={() => setShowSave(false)}
				/>
			)}
		</div>
	);
}
