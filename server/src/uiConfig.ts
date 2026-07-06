import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "./env.js";

export interface UiConfig {
	passwordHash?: string;
	sessionSecret: string;
}

function configPath(): string {
	return join(env.dataDir, "ui-config.json");
}

export function loadUiConfig(): UiConfig {
	mkdirSync(env.dataDir, { recursive: true, mode: 0o700 });
	const path = configPath();
	if (existsSync(path)) {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as UiConfig;
		if (!parsed.sessionSecret) {
			parsed.sessionSecret = randomBytes(32).toString("hex");
			saveUiConfig(parsed);
		}
		return parsed;
	}
	const fresh: UiConfig = { sessionSecret: randomBytes(32).toString("hex") };
	saveUiConfig(fresh);
	return fresh;
}

export function saveUiConfig(config: UiConfig): void {
	mkdirSync(env.dataDir, { recursive: true, mode: 0o700 });
	writeFileSync(configPath(), `${JSON.stringify(config, null, "\t")}\n`, {
		mode: 0o600,
	});
}
