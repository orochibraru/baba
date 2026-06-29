import { describe, expect, test } from "bun:test";
import type { Config } from "../../../src/config";
import {
	type HealthDeps,
	health,
	runChecks,
} from "../../../src/lib/cli/health";

const VALID_WEBHOOK =
	"https://discord.com/api/webhooks/123456789/abcdefghijklmno";

const fakeConfig: Config = {
	machineName: "test",
	logLevel: "info",
	intervalSeconds: 60,
	reminderIntervalMinutes: 30,
	database: { path: "/tmp/baba-health.db" },
	checks: {
		cpu: { enabled: true, usageThresholdPercent: 90, consecutiveBreaches: 3 },
		load: { enabled: true, threshold: 8, consecutiveBreaches: 3 },
		memory: {
			enabled: true,
			usageThresholdPercent: 90,
			consecutiveBreaches: 3,
		},
		disk: {
			enabled: true,
			usageThresholdPercent: 90,
			volumes: ["/"],
			consecutiveBreaches: 3,
		},
		temperature: {
			enabled: false,
			cpuThresholdCelsius: 85,
			gpuThresholdCelsius: 85,
			consecutiveBreaches: 3,
		},
		gpu: { enabled: false, vramThresholdPercent: 90, consecutiveBreaches: 3 },
	},
	notifiers: [{ type: "discord", webhookUrl: VALID_WEBHOOK }],
};

const okDb = {
	query: (_sql: string) => ({ get: () => ({}) }),
	close: () => {},
};

const okDeps: HealthDeps = {
	loadConfig: async () => fakeConfig,
	existsSync: () => true,
	createDb: () => okDb,
	siMem: async () => ({ total: 8_000_000_000 }),
};

describe("runChecks", () => {
	test("returns three passing checks when everything is healthy", async () => {
		const results = await runChecks("/any/config.json", okDeps);
		expect(results).toHaveLength(3);
		expect(results.every((r) => r.ok)).toBe(true);
		expect(results.map((r) => r.name)).toEqual([
			"config",
			"database",
			"system",
		]);
	});

	describe("config check", () => {
		test("fails and records detail when loadConfig throws", async () => {
			const results = await runChecks("/any/config.json", {
				...okDeps,
				loadConfig: async () => {
					throw new Error("Invalid config: no notifiers");
				},
			});
			const check = results.find((r) => r.name === "config");
			expect(check?.ok).toBe(false);
			expect(check?.detail).toContain("Invalid config");
		});
	});

	describe("database check", () => {
		test("fails when the db file does not exist", async () => {
			const results = await runChecks("/any/config.json", {
				...okDeps,
				existsSync: () => false,
			});
			const check = results.find((r) => r.name === "database");
			expect(check?.ok).toBe(false);
			expect(check?.detail).toContain("not found");
		});

		test("fails when the db query throws", async () => {
			const results = await runChecks("/any/config.json", {
				...okDeps,
				createDb: () => ({
					query: () => {
						throw new Error("no such table: incidents");
					},
					close: () => {},
				}),
			});
			const check = results.find((r) => r.name === "database");
			expect(check?.ok).toBe(false);
			expect(check?.detail).toContain("no such table: incidents");
		});
	});

	describe("system check", () => {
		test("fails when mem.total is 0", async () => {
			const results = await runChecks("/any/config.json", {
				...okDeps,
				siMem: async () => ({ total: 0 }),
			});
			const check = results.find((r) => r.name === "system");
			expect(check?.ok).toBe(false);
			expect(check?.detail).toContain("--pid=host");
		});

		test("fails when siMem throws", async () => {
			const results = await runChecks("/any/config.json", {
				...okDeps,
				siMem: async () => {
					throw new Error("permission denied");
				},
			});
			const check = results.find((r) => r.name === "system");
			expect(check?.ok).toBe(false);
			expect(check?.detail).toContain("permission denied");
		});
	});
});

describe("runChecks (default deps)", () => {
	test("returns three results using real system when no deps provided", async () => {
		// Exercises defaultDeps: real loadConfig, real existsSync, real si.mem()
		// Config check fails (no notifiers configured), but we get 3 results back
		const results = await runChecks("/nonexistent/path/config.json");
		expect(results).toHaveLength(3);
		const config = results.find((r) => r.name === "config");
		expect(config?.ok).toBe(false); // fails: invalid config
	});
});

describe("health", () => {
	test("exits 0 when all checks pass", async () => {
		let code: number | undefined;
		await health("/any/config.json", {
			deps: okDeps,
			exit: (c) => {
				code = c;
			},
		});
		expect(code).toBe(0);
	});

	test("exits 1 when any check fails", async () => {
		let code: number | undefined;
		await health("/any/config.json", {
			deps: { ...okDeps, siMem: async () => ({ total: 0 }) },
			exit: (c) => {
				code = c;
			},
		});
		expect(code).toBe(1);
	});

	test("prints ✓ lines for passing checks and ✗ for failing ones", async () => {
		const lines: string[] = [];
		// biome-ignore lint/suspicious/noConsole: test file
		const origLog = console.log;
		// biome-ignore lint/suspicious/noConsole: test file
		const origErr = console.error;
		console.log = (s: string) => {
			lines.push(s);
		};
		console.error = (s: string) => {
			lines.push(s);
		};
		try {
			await health("/any/config.json", {
				deps: { ...okDeps, siMem: async () => ({ total: 0 }) },
				exit: () => {},
			});
			expect(lines.some((l) => l.startsWith("✓"))).toBe(true);
			expect(lines.some((l) => l.startsWith("✗"))).toBe(true);
		} finally {
			console.log = origLog;
			console.error = origErr;
		}
	});
});
