/** Sets a key, or removes it when the value is empty — keeps config.json minimal. */
export function setOrDelete(
	obj: Record<string, unknown>,
	key: string,
	value: unknown,
): void {
	const empty =
		value === undefined ||
		value === null ||
		value === "" ||
		(Array.isArray(value) && value.length === 0);
	if (empty) {
		delete obj[key];
	} else {
		obj[key] = value;
	}
}

export function formatTime(ms: number | null | undefined): string {
	if (!ms) return "—";
	return new Date(ms).toLocaleString();
}
