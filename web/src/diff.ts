export interface DiffLine {
	type: "same" | "add" | "del" | "skip";
	text: string;
}

/** Simple LCS line diff with unchanged runs collapsed to a "skip" marker. */
export function diffLines(before: string, after: string): DiffLine[] {
	const a = before.split("\n");
	const b = after.split("\n");
	if (a.length * b.length > 4_000_000) {
		// Too large for the DP table; show a trivial full replacement.
		return [
			...a.map((text) => ({ type: "del", text }) as DiffLine),
			...b.map((text) => ({ type: "add", text }) as DiffLine),
		];
	}
	const n = a.length;
	const m = b.length;
	const lcs: Uint32Array[] = Array.from(
		{ length: n + 1 },
		() => new Uint32Array(m + 1),
	);
	for (let i = n - 1; i >= 0; i--) {
		const row = lcs[i] as Uint32Array;
		const next = lcs[i + 1] as Uint32Array;
		for (let j = m - 1; j >= 0; j--) {
			row[j] =
				a[i] === b[j]
					? (next[j + 1] as number) + 1
					: Math.max(next[j] as number, row[j + 1] as number);
		}
	}
	const raw: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			raw.push({ type: "same", text: a[i] as string });
			i++;
			j++;
		} else if (
			((lcs[i + 1] as Uint32Array)[j] as number) >=
			((lcs[i] as Uint32Array)[j + 1] as number)
		) {
			raw.push({ type: "del", text: a[i] as string });
			i++;
		} else {
			raw.push({ type: "add", text: b[j] as string });
			j++;
		}
	}
	while (i < n) raw.push({ type: "del", text: a[i++] as string });
	while (j < m) raw.push({ type: "add", text: b[j++] as string });

	// Collapse long unchanged runs, keeping 2 lines of context.
	const out: DiffLine[] = [];
	const CONTEXT = 2;
	let run: DiffLine[] = [];
	const flushRun = (isEnd: boolean, isStart: boolean) => {
		if (run.length <= CONTEXT * 2 + 1) {
			out.push(...run);
		} else {
			if (!isStart) out.push(...run.slice(0, CONTEXT));
			out.push({
				type: "skip",
				text: `··· ${run.length - (isStart ? 0 : CONTEXT) - (isEnd ? 0 : CONTEXT)} unchanged lines ···`,
			});
			if (!isEnd) out.push(...run.slice(-CONTEXT));
		}
		run = [];
	};
	let seenChange = false;
	for (const line of raw) {
		if (line.type === "same") {
			run.push(line);
		} else {
			if (run.length) flushRun(false, !seenChange);
			seenChange = true;
			out.push(line);
		}
	}
	if (run.length) flushRun(true, !seenChange);
	return out;
}
