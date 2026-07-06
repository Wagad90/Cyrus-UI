import type { ReactNode } from "react";

export function Section({
	title,
	description,
	children,
}: {
	title: string;
	description?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
			<h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
				{title}
			</h2>
			{description && (
				<p className="mt-1 text-sm text-slate-500">{description}</p>
			)}
			<div className="mt-4 space-y-4">{children}</div>
		</section>
	);
}

export function Field({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: ReactNode;
	children: ReactNode;
}) {
	return (
		<label className="block">
			<span className="mb-1 block text-sm font-medium text-slate-300">
				{label}
			</span>
			{children}
			{hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
		</label>
	);
}

export const inputClass =
	"w-full rounded-md border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none";

export function TextInput({
	value,
	onChange,
	placeholder,
	list,
	mono,
}: {
	value: string;
	onChange: (next: string) => void;
	placeholder?: string;
	list?: string;
	mono?: boolean;
}) {
	return (
		<input
			type="text"
			className={`${inputClass} ${mono ? "font-mono" : ""}`}
			value={value}
			placeholder={placeholder}
			list={list}
			onChange={(e) => onChange(e.target.value)}
		/>
	);
}

export function Toggle({
	checked,
	onChange,
	label,
}: {
	checked: boolean;
	onChange: (next: boolean) => void;
	label?: string;
}) {
	return (
		<button
			type="button"
			onClick={() => onChange(!checked)}
			className="flex items-center gap-2 text-sm text-slate-300"
		>
			<span
				className={`inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
					checked ? "bg-sky-600" : "bg-slate-700"
				}`}
			>
				<span
					className={`h-4 w-4 rounded-full bg-white transition-transform ${
						checked ? "translate-x-4" : ""
					}`}
				/>
			</span>
			{label}
		</button>
	);
}

/** Select for optional booleans: unset (Cyrus default) / on / off. */
export function TriState({
	value,
	onChange,
	defaultLabel,
}: {
	value: boolean | undefined;
	onChange: (next: boolean | undefined) => void;
	defaultLabel: string;
}) {
	const current = value === undefined ? "default" : value ? "on" : "off";
	return (
		<select
			className={inputClass}
			value={current}
			onChange={(e) => {
				const v = e.target.value;
				onChange(v === "default" ? undefined : v === "on");
			}}
		>
			<option value="default">Default ({defaultLabel})</option>
			<option value="on">Enabled</option>
			<option value="off">Disabled</option>
		</select>
	);
}

export function Button({
	children,
	onClick,
	kind = "secondary",
	disabled,
	type = "button",
}: {
	children: ReactNode;
	onClick?: () => void;
	kind?: "primary" | "secondary" | "danger";
	disabled?: boolean;
	type?: "button" | "submit";
}) {
	const styles = {
		primary:
			"bg-sky-600 text-white hover:bg-sky-500 disabled:bg-slate-700 disabled:text-slate-400",
		secondary:
			"border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white",
		danger:
			"border border-red-900 text-red-400 hover:border-red-600 hover:text-red-300",
	}[kind];
	return (
		<button
			type={type}
			onClick={onClick}
			disabled={disabled}
			className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles}`}
		>
			{children}
		</button>
	);
}
