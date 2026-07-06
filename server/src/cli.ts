#!/usr/bin/env node
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { hashPassword } from "./auth.js";
import { loadUiConfig, saveUiConfig } from "./uiConfig.js";

/**
 * One shared prompt interface for the whole session. Lines are queued as
 * they arrive rather than read via rl.question(): with piped stdin the
 * entire input is processed in one chunk, and lines arriving while no
 * question is pending would otherwise be silently dropped. Output is muted
 * so typed passwords are never echoed.
 */
function createPrompter() {
	const muted = new Writable({
		write(_chunk, _encoding, callback) {
			callback();
		},
	});
	const rl = createInterface({
		input: process.stdin,
		output: muted,
		terminal: true,
	});
	const queued: string[] = [];
	let waiter: ((line: string) => void) | null = null;
	let closed = false;

	const fail = (): never => {
		process.stdout.write("\n");
		console.error("Input closed — password not set.");
		process.exit(1);
	};

	rl.on("line", (line) => {
		if (waiter) {
			const w = waiter;
			waiter = null;
			w(line);
		} else {
			queued.push(line);
		}
	});
	rl.on("close", () => {
		closed = true;
		if (waiter) fail();
	});

	return {
		ask(question: string): Promise<string> {
			process.stdout.write(question);
			const next = queued.shift();
			if (next !== undefined) {
				process.stdout.write("\n");
				return Promise.resolve(next);
			}
			if (closed) fail();
			return new Promise((resolve) => {
				waiter = (line) => {
					process.stdout.write("\n");
					resolve(line);
				};
			});
		},
		close() {
			rl.close();
		},
	};
}

async function setPassword(argPassword: string | undefined): Promise<void> {
	let password = argPassword;
	if (password === undefined) {
		// Interactive: re-prompt on mistakes instead of exiting, so a typo
		// doesn't abort a `set -e` install script.
		const prompter = createPrompter();
		for (;;) {
			password = await prompter.ask("New password (min 8 chars): ");
			if (password.length < 8) {
				console.error("Password must be at least 8 characters — try again.");
				continue;
			}
			const confirm = await prompter.ask("Confirm password: ");
			if (password !== confirm) {
				console.error("Passwords do not match — try again.");
				continue;
			}
			break;
		}
		prompter.close();
	} else if (password.length < 8) {
		console.error("Password must be at least 8 characters.");
		process.exit(1);
	}
	const config = loadUiConfig();
	config.passwordHash = hashPassword(password);
	saveUiConfig(config);
	console.log("Password updated.");
}

const command = process.argv[2];
if (command === "set-password") {
	await setPassword(process.argv[3]);
	process.exit(0);
} else {
	console.log("Usage: cli.js set-password [password]");
	process.exit(command ? 1 : 0);
}
