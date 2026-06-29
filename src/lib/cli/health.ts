/** biome-ignore-all lint/suspicious/noConsole: health output goes to stdout/stderr by design */
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import si from "systeminformation";
import type { Config } from "../../config";
import { loadConfig } from "../../config";
import { setLogLevel } from "../logger";

type CheckResult = { name: string; ok: boolean; detail?: string };

type DatabaseLike = {
	query(sql: string): { get(): unknown };
	close(): void;
};

export type HealthDeps = {
	loadConfig(path: string): Promise<Config>;
	existsSync(path: string): boolean;
	createDb(path: string): DatabaseLike;
	siMem(): Promise<{ total: number }>;
};

const defaultDeps: HealthDeps = {
	loadConfig,
	existsSync,
	createDb: (path) => new Database(path, { readonly: true }),
	siMem: () => si.mem(),
};

export async function runChecks(
	configPath: string,
	deps: HealthDeps = defaultDeps,
): Promise<CheckResult[]> {
	const results: CheckResult[] = [];

	// 1. Config is valid and has at least one notifier configured
	let dbPath = "/var/lib/baba/baba.db";
	try {
		const config = await deps.loadConfig(configPath);
		dbPath = config.database.path;
		results.push({ name: "config", ok: true });
	} catch (err) {
		results.push({ name: "config", ok: false, detail: String(err) });
	}

	// 2. Database is accessible and the schema is initialised
	try {
		if (!deps.existsSync(dbPath)) {
			throw new Error(
				`not found at "${dbPath}" — has the service started at least once?`,
			);
		}
		const db = deps.createDb(dbPath);
		db.query("SELECT COUNT(*) FROM incidents").get();
		db.close();
		results.push({ name: "database", ok: true });
	} catch (err) {
		results.push({ name: "database", ok: false, detail: String(err) });
	}

	// 3. Host system metrics are readable (validates --pid=host and /proc access)
	try {
		const mem = await deps.siMem();
		if (!mem.total) throw new Error("mem.total is 0 — is --pid=host set?");
		results.push({ name: "system", ok: true });
	} catch (err) {
		results.push({ name: "system", ok: false, detail: String(err) });
	}

	return results;
}

interface HealthProps {
	exit: (code: number) => void;
	deps: HealthDeps;
}

export async function health(
	configPath: string,
	props: HealthProps = { exit: process.exit, deps: defaultDeps },
): Promise<void> {
	setLogLevel("error");

	const results = await runChecks(configPath, props.deps);
	const allOk = results.every((r) => r.ok);

	for (const r of results) {
		const line = r.detail ? `${r.name}: ${r.detail}` : r.name;
		(r.ok ? console.log : console.error)(`${r.ok ? "✓" : "✗"} ${line}`);
	}

	props.exit(allOk ? 0 : 1);
}
