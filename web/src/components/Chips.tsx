import { useId, useState } from "react";
import { inputClass } from "./ui";

export function Chips({
	value,
	onChange,
	placeholder,
	suggestions,
}: {
	value: string[];
	onChange: (next: string[]) => void;
	placeholder?: string;
	suggestions?: string[];
}) {
	const [input, setInput] = useState("");
	const listId = useId();

	const add = (raw: string) => {
		const item = raw.trim();
		if (!item) return;
		if (!value.includes(item)) onChange([...value, item]);
		setInput("");
	};

	return (
		<div className="rounded-md border border-slate-700 bg-slate-800/80 p-1.5">
			<div className="flex flex-wrap items-center gap-1.5">
				{value.map((item) => (
					<span
						key={item}
						className="inline-flex items-center gap-1 rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-200"
					>
						{item}
						<button
							type="button"
							aria-label={`Remove ${item}`}
							className="text-slate-400 hover:text-white"
							onClick={() => onChange(value.filter((v) => v !== item))}
						>
							×
						</button>
					</span>
				))}
				<input
					type="text"
					className={`${inputClass} min-w-32 flex-1 border-0 bg-transparent px-1 py-0.5 focus:ring-0`}
					value={input}
					list={suggestions ? listId : undefined}
					placeholder={value.length === 0 ? placeholder : undefined}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === ",") {
							e.preventDefault();
							add(input);
						} else if (e.key === "Backspace" && !input && value.length) {
							onChange(value.slice(0, -1));
						}
					}}
					onBlur={() => add(input)}
				/>
				{suggestions && (
					<datalist id={listId}>
						{suggestions
							.filter((s) => !value.includes(s))
							.map((s) => (
								<option key={s} value={s} />
							))}
					</datalist>
				)}
			</div>
		</div>
	);
}
