import { AccessControlEditor } from "../components/AccessControlEditor";
import { Section } from "../components/ui";
import type { CyrusConfig } from "../types";
import { setOrDelete } from "../util";

export function AccessControl({
	config,
	update,
}: {
	config: CyrusConfig;
	update: (mutate: (next: CyrusConfig) => void) => void;
}) {
	return (
		<div className="space-y-5">
			<Section
				title="Global user access control"
				description="Controls which Linear users may delegate issues to Cyrus across all repositories. Per-repository overrides live in each repository's panel: allowedUsers overrides, blockedUsers merges."
			>
				<AccessControlEditor
					value={config.userAccessControl}
					onChange={(next) =>
						update((c) => setOrDelete(c, "userAccessControl", next))
					}
				/>
			</Section>
		</div>
	);
}
