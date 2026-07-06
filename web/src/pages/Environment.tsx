import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Button, Section, inputClass } from "../components/ui";
import type { EnvEntry } from "../types";

interface Row {
	key: string;
	value: string; // display value ("" for untouched masked entries)
	masked: boolean;
	edited: boolean;
	isNew: boolean;
}

export function Environment() {
	const [rows, setRows] = useState<Row[] | null>(null);
	const [path, setPath] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const load = useCallback(async () => {
		try {
			const res = await api.env();
			setPath(res.path);
			setRows(
				res.entries.map((entry: EnvEntry) => ({
					key: entry.key,
					value: entry.value ?? "",
					masked: entry.masked,
					edited: false,
					isNew: false,
				})),
			);
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const save = async () => {
		if (!rows) return;
		setSaving(true);
		setError(null);
		setMessage(null);
		try {
			await api.saveEnv(
				rows
					.filter((row) => row.key.trim())
					.map((row) => ({
						key: row.key.trim(),
						// untouched masked secret → null → server keeps disk value
						value: row.masked && !row.edited ? null : row.value,
					})),
			);
			setMessage(
				"Saved. ⚠ Environment variables load at daemon startup — restart Cyrus (Maintenance tab) for changes to take effect.",
			);
			await load();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setSaving(false);
		}
	};

	const update = (index: number, patch: Partial<Row>) => {
		setRows((prev) =>
			prev
				? prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
				: prev,
		);
	};

	const dirty = rows?.some((row) => row.edited || row.isNew) ?? false;

	return (
		<div className="space-y-5">
			<Section
				title="Environment file"
				description={
					<>
						<code className="font-mono">{path || "~/.cyrus/.env"}</code> — API
						keys, ports, tunnel token. Secret values are hidden; leave a secret
						blank to keep it as-is, or type to replace it. Unlike config.json,
						these only load when the daemon starts, so changes need a restart.
					</>
				}
			>
				{error && <p className="text-sm text-red-400">{error}</p>}
				{message && <p className="text-sm text-amber-300">{message}</p>}
				{rows === null && !error && (
					<p className="text-sm text-slate-500">Loading…</p>
				)}
				<div className="space-y-2">
					{rows?.map((row, index) => (
						<div key={row.isNew ? `new-${index}` : row.key} className="flex gap-2">
							{row.isNew ? (
								<input
									className={`${inputClass} w-64 font-mono`}
									placeholder="KEY_NAME"
									value={row.key}
									onChange={(e) =>
										update(index, { key: e.target.value.toUpperCase() })
									}
								/>
							) : (
								<span className="flex w-64 shrink-0 items-center font-mono text-sm text-slate-300">
									{row.key}
									{row.masked && <span className="ml-1 text-slate-600">🔒</span>}
								</span>
							)}
							<input
								className={`${inputClass} flex-1 font-mono`}
								type={row.masked && !row.edited ? "password" : "text"}
								placeholder={
									row.masked && !row.edited
										? "•••••••• (unchanged — type to replace)"
										: "value"
								}
								value={row.value}
								onChange={(e) =>
									update(index, { value: e.target.value, edited: true })
								}
							/>
							<Button
								kind="danger"
								onClick={() =>
									setRows((prev) =>
										prev ? prev.filter((_, i) => i !== index) : prev,
									)
								}
							>
								✕
							</Button>
						</div>
					))}
				</div>
				<div className="flex gap-2">
					<Button
						onClick={() =>
							setRows((prev) => [
								...(prev ?? []),
								{ key: "", value: "", masked: false, edited: true, isNew: true },
							])
						}
					>
						+ Add variable
					</Button>
					<Button kind="primary" onClick={save} disabled={saving || !rows}>
						{saving ? "Saving…" : "Save .env"}
					</Button>
					{dirty && <Button onClick={load}>Discard</Button>}
				</div>
				<p className="text-xs text-slate-500">
					Removing a row deletes that variable on save. Comments and blank
					lines in the file are preserved.
				</p>
			</Section>
		</div>
	);
}
