import { useEffect, useState } from "react";
import { Button, Section } from "../components/ui";
import type { CyrusConfig } from "../types";

export function RawJson({
	draft,
	setDraft,
}: {
	draft: CyrusConfig;
	setDraft: (next: CyrusConfig) => void;
}) {
	const [text, setText] = useState(() => JSON.stringify(draft, null, 2));
	const [editing, setEditing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Track edits made on the form pages while not typing here.
	useEffect(() => {
		if (!editing) setText(JSON.stringify(draft, null, 2));
	}, [draft, editing]);

	const apply = () => {
		try {
			const parsed = JSON.parse(text) as CyrusConfig;
			if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
				throw new Error("Top level must be a JSON object");
			}
			setDraft(parsed);
			setEditing(false);
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	return (
		<Section
			title="Raw configuration"
			description="The full draft as JSON. Secret values show as __CYRUS_UI_SECRET_UNCHANGED__ — leave them alone and the real values on disk are kept. Apply moves your edits into the draft; use Review & Save to write to disk."
		>
			<textarea
				className="h-[60vh] w-full rounded-md border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
				value={text}
				spellCheck={false}
				onChange={(e) => {
					setText(e.target.value);
					setEditing(true);
				}}
			/>
			{error && <p className="text-sm text-red-400">JSON error: {error}</p>}
			<div className="flex gap-2">
				<Button kind="primary" onClick={apply} disabled={!editing}>
					Apply to draft
				</Button>
				<Button
					onClick={() => {
						setText(JSON.stringify(draft, null, 2));
						setEditing(false);
						setError(null);
					}}
					disabled={!editing}
				>
					Discard text edits
				</Button>
			</div>
		</Section>
	);
}
