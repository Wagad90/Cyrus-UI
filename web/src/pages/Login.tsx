import { useState } from "react";
import { api } from "../api";
import { Button, inputClass } from "../components/ui";

export function Login({
	passwordConfigured,
	onLogin,
}: {
	passwordConfigured: boolean;
	onLogin: () => void;
}) {
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const submit = async () => {
		setBusy(true);
		setError(null);
		try {
			await api.login(password);
			onLogin();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="flex min-h-screen items-center justify-center p-6">
			<div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900/80 p-8">
				<div className="mb-6 text-center">
					<div className="text-3xl">🎛️</div>
					<h1 className="mt-2 text-xl font-semibold text-white">
						Cyrus Control
					</h1>
					<p className="text-sm text-slate-500">
						Settings panel for your self-hosted Cyrus agent
					</p>
				</div>
				{!passwordConfigured ? (
					<div className="rounded-md border border-amber-900 bg-amber-950/40 px-3 py-2 text-sm text-amber-300">
						No password is configured yet. On the server, run{" "}
						<code className="font-mono">npm run set-password</code> in the
						cyrus-ui directory, then reload this page.
					</div>
				) : (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							submit();
						}}
						className="space-y-3"
					>
						<input
							type="password"
							autoFocus
							className={inputClass}
							placeholder="Password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
						{error && <p className="text-sm text-red-400">{error}</p>}
						<Button kind="primary" type="submit" disabled={busy || !password}>
							{busy ? "Signing in…" : "Sign in"}
						</Button>
					</form>
				)}
			</div>
		</div>
	);
}
