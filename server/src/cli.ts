#!/usr/bin/env node
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { hashPassword } from "./auth.js";
import { loadUiConfig, saveUiConfig } from "./uiConfig.js";

function promptHidden(question: string): Promise<string> {
	return new Promise((resolve) => {
		process.stdout.write(question);
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
		rl.question("", (answer) => {
			rl.close();
			process.stdout.write("\n");
			resolve(answer);
		});
	});
}

async function setPassword(argPassword: string | undefined): Promise<void> {
	let password = argPassword;
	if (!password) {
		password = await promptHidden("New password: ");
		const confirm = await promptHidden("Confirm password: ");
		if (password !== confirm) {
			console.error("Passwords do not match.");
			process.exit(1);
		}
	}
	if (!password || password.length < 8) {
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
} else {
	console.log("Usage: cli.js set-password [password]");
	process.exit(command ? 1 : 0);
}
