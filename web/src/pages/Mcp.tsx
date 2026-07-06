import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Button, Section } from "../components/ui";
import type { McpFileInfo } from "../types";
import { formatBytes, timeAgo } from "../util";

export function Mcp() {
	const [files, setFiles] = useState<McpFileInfo[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [content, setContent] = useState("");
	const [dirty, setDirty] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			const res = await api.mcpFiles();
			setFiles(res.files);
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const open = async (path: string) => {
		setMessage(null);
		setError(null);
		try {
			const res = await api.mcpFile(path);
			setSelected(path);
			setContent(
				res.content ||
					JSON.stringify(
						{
							mcpServers: {
								"server-name": {
									type: "stdio",
									command: "command-to-run",
									args: [],
								},
							},
						},
						null,
						2,
					),
			);
			setDirty(!res.content);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	const save = async () => {
		if (!selected) return;
		setError(null);
		try {
			JSON.parse(content); // client-side check for a friendlier error
			await api.saveMcpFile(selected, content);
			setDirty(false);
			setMessage("Saved. New sessions pick up MCP changes automatically.");
			await load();
		} catch (e) {
			setError(
				e instanceof SyntaxError
					? `Invalid JSON: ${e.message}`
					: e instanceof Error
						? e.message
						: String(e),
			);
		}
	};

	return (
		<div className="space-y-5">
			<Section
				title="MCP configuration files"
				description="Files referenced by config.json (repository mcpConfigPath and the global per-platform lists). To edit a new file, first reference its absolute path in a repository's Advanced settings, then it appears here — the UI only touches files Cyrus actually uses."
			>
				{error && !selected && <p className="text-sm text-red-400">{error}</p>}
				{files?.length === 0 && (
					<p className="text-sm text-slate-500">
						No MCP files referenced yet. Add an{" "}
						<code className="font-mono">mcpConfigPath</code> under a
						repository's Advanced settings first.
					</p>
				)}
				<div className="space-y-1">
					{files?.map((file) => (
						<button
							key={file.path}
							type="button"
							onClick={() => open(file.path)}
							className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm ${
								selected === file.path
									? "border-sky-600 bg-sky-950/40"
									: "border-slate-800 bg-slate-950/50 hover:border-slate-600"
							}`}
						>
							<div className="min-w-0 flex-1">
								<div className="truncate font-mono text-xs text-slate-300">
									{file.path}
								</div>
								<div className="mt-0.5 flex gap-2 text-xs text-slate-500">
									{file.exists ? (
										<>
											<span>{formatBytes(file.sizeBytes ?? 0)}</span>
											<span>{timeAgo(file.mtimeMs)}</span>
										</>
									) : (
										<span className="text-amber-400">
											doesn't exist yet — opening creates a template
										</span>
									)}
									<span>· {file.referencedBy.join(", ")}</span>
								</div>
							</div>
						</button>
					))}
				</div>
			</Section>

			{selected && (
				<Section title="Edit" description={selected}>
					<p className="text-xs text-amber-400">
						Contents are shown as-is — this file may contain tokens you put in
						it. Validated as JSON before saving.
					</p>
					<textarea
						className="h-[45vh] w-full rounded-md border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
						value={content}
						spellCheck={false}
						onChange={(e) => {
							setContent(e.target.value);
							setDirty(true);
						}}
					/>
					{error && <p className="text-sm text-red-400">{error}</p>}
					{message && <p className="text-sm text-emerald-400">{message}</p>}
					<div className="flex gap-2">
						<Button kind="primary" onClick={save} disabled={!dirty}>
							Save file
						</Button>
						<Button
							onClick={() => {
								setSelected(null);
								setMessage(null);
								setError(null);
							}}
						>
							Close
						</Button>
					</div>
				</Section>
			)}
		</div>
	);
}
