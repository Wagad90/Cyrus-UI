import { TOOL_PRESETS, TOOL_SUGGESTIONS } from "../constants";
import type { ToolRestriction } from "../types";
import { Chips } from "./Chips";
import { inputClass } from "./ui";

/**
 * Editor for Cyrus tool restrictions: unset, one of the named presets,
 * or a custom list of tool names.
 */
export function ToolsEditor({
	value,
	onChange,
	unsetLabel = "Not set (inherit)",
}: {
	value: ToolRestriction | undefined;
	onChange: (next: ToolRestriction | undefined) => void;
	unsetLabel?: string;
}) {
	const mode = value === undefined ? "unset" : Array.isArray(value) ? "custom" : value;
	return (
		<div className="space-y-2">
			<select
				className={inputClass}
				value={mode}
				onChange={(e) => {
					const v = e.target.value;
					if (v === "unset") onChange(undefined);
					else if (v === "custom") onChange(Array.isArray(value) ? value : []);
					else onChange(v as ToolRestriction);
				}}
			>
				<option value="unset">{unsetLabel}</option>
				{TOOL_PRESETS.map((preset) => (
					<option key={preset.value} value={preset.value}>
						{preset.label}
					</option>
				))}
				<option value="custom">Custom tool list…</option>
			</select>
			{Array.isArray(value) && (
				<Chips
					value={value}
					onChange={(next) => onChange(next)}
					placeholder="Add tool names (Enter to add)"
					suggestions={TOOL_SUGGESTIONS}
				/>
			)}
		</div>
	);
}
