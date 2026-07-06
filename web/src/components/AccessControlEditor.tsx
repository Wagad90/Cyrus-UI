import type { UserAccessControl, UserIdentifier } from "../types";
import { setOrDelete } from "../util";
import { Chips } from "./Chips";
import { Field, TextInput, inputClass } from "./ui";

function identifierToString(user: UserIdentifier): string {
	if (typeof user === "string") return user;
	if ("email" in user) return user.email;
	return user.id;
}

function stringToIdentifier(value: string): UserIdentifier {
	return value.includes("@") ? { email: value } : value;
}

/**
 * Shared editor for `userAccessControl` (global or per-repository).
 * Entries containing "@" are stored as { email }, everything else as a
 * plain Linear user-id string.
 */
export function AccessControlEditor({
	value,
	onChange,
}: {
	value: UserAccessControl | undefined;
	onChange: (next: UserAccessControl | undefined) => void;
}) {
	const current = value ?? {};

	const update = (mutate: (next: UserAccessControl) => void) => {
		const next = structuredClone(current);
		mutate(next);
		onChange(Object.keys(next).length === 0 ? undefined : next);
	};

	return (
		<div className="space-y-4">
			<Field
				label="Allowed users"
				hint="If set, ONLY these users can delegate issues. Leave empty to allow everyone. Use a Linear user ID or an email address."
			>
				<Chips
					value={(current.allowedUsers ?? []).map(identifierToString)}
					onChange={(next) =>
						update((c) =>
							setOrDelete(c, "allowedUsers", next.map(stringToIdentifier)),
						)
					}
					placeholder="usr_abc123 or user@example.com"
				/>
			</Field>
			<Field
				label="Blocked users"
				hint="Always denied, even if listed above."
			>
				<Chips
					value={(current.blockedUsers ?? []).map(identifierToString)}
					onChange={(next) =>
						update((c) =>
							setOrDelete(c, "blockedUsers", next.map(stringToIdentifier)),
						)
					}
					placeholder="usr_abc123 or user@example.com"
				/>
			</Field>
			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="When a blocked user delegates">
					<select
						className={inputClass}
						value={current.blockBehavior ?? "silent"}
						onChange={(e) =>
							update((c) =>
								setOrDelete(
									c,
									"blockBehavior",
									e.target.value === "silent" ? undefined : e.target.value,
								),
							)
						}
					>
						<option value="silent">Ignore silently (default)</option>
						<option value="comment">Post an explanatory comment</option>
					</select>
				</Field>
				<Field
					label="Block message"
					hint="Used with 'comment'. Supports {{userName}} and {{userId}}."
				>
					<TextInput
						value={current.blockMessage ?? ""}
						onChange={(next) => update((c) => setOrDelete(c, "blockMessage", next))}
						placeholder="{{userName}}, you are not authorized…"
					/>
				</Field>
			</div>
		</div>
	);
}
