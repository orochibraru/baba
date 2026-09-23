import { describe, expect, test } from "bun:test";
import { hostname } from "node:os";
import type { SetupDeps } from "../../../src/lib/cli/setup";
import { setup } from "../../../src/lib/cli/setup";

// ── Helpers ───────────────────────────────────────────────────────────────────

type TestOpts = {
	prompts: string[];
	existing?: string | null;
};

type Written = { path: string; content: string };

function makeTestDeps({ prompts, existing = null }: TestOpts): {
	deps: SetupDeps;
	written: () => Written | null;
} {
	const queue = [...prompts];
	let written: Written | null = null;
	return {
		deps: {
			prompt: async () => queue.shift() ?? "",
			readExisting: () => existing,
			writeConfig: (path, content) => {
				written = { path, content };
			},
		},
		written: () => written,
	};
}

function parseWritten(written: Written | null): Record<string, unknown> {
	if (!written) {
		throw new Error("Nothing was written");
	}
	return JSON.parse(written.content) as Record<string, unknown>;
}

// ── Prompt sequences ──────────────────────────────────────────────────────────
//
// Prompt order:
//   General (4):       machineName, intervalSeconds, reminderIntervalMinutes, database.path
//   Discord (1-2):     setup? [Y/n], (if yes) webhookUrl
//   Telegram (1-3):    setup? [y/N], (if yes) botToken, (if yes) chatId
//   CPU (1-3):         enabled? [Y/n], (if yes) threshold, (if yes) breaches
//   Load (1-3):        enabled? [Y/n], (if yes) threshold, (if yes) breaches
//   Memory (1-3):      enabled? [Y/n], (if yes) threshold, (if yes) breaches
//   Disk (1-3):        enabled? [Y/n], (if yes) threshold, (if yes) volumes
//   Temperature (1-4): enabled? [y/N], (if yes) cpuC, gpuC, breaches
//   GPU (1-3):         enabled? [y/N], (if yes) vramThreshold, breaches

const DISCORD_URL = "https://discord.com/api/webhooks/123/token";

// 21 prompts: discord only, all checks at defaults, temp+gpu disabled
function discordAnswers(url = DISCORD_URL): string[] {
	return [
		"",
		"",
		"",
		"", // general defaults
		"y",
		url,
		"n", // discord yes + url, telegram no
		"",
		"",
		"", // cpu default
		"",
		"",
		"", // load default
		"",
		"",
		"", // memory default
		"",
		"",
		"", // disk default
		"",
		"", // temp disabled, gpu disabled
	];
}

// 20 prompts: no notifiers, all checks at defaults, temp+gpu disabled
function noNotifierAnswers(): string[] {
	return [
		"",
		"",
		"",
		"", // general defaults
		"n",
		"n", // no discord, no telegram
		"",
		"",
		"", // cpu default
		"",
		"",
		"", // load default
		"",
		"",
		"", // memory default
		"",
		"",
		"", // disk default
		"",
		"", // temp disabled, gpu disabled
	];
}

// ── Default values ────────────────────────────────────────────────────────────

describe("setup — default values", () => {
	test("writes config to the given path", async () => {
		const { deps, written } = makeTestDeps({ prompts: discordAnswers() });
		await setup({ configPath: "/custom/config.json", deps });
		expect(written()?.path).toBe("/custom/config.json");
	});

	test("uses system hostname when machine name is left blank", async () => {
		const { deps, written } = makeTestDeps({ prompts: discordAnswers() });
		await setup({ configPath: "/tmp/c.json", deps });
		expect(parseWritten(written()).machineName).toBe(hostname());
	});

	test("defaults to intervalSeconds = 60", async () => {
		const { deps, written } = makeTestDeps({ prompts: discordAnswers() });
		await setup({ configPath: "/tmp/c.json", deps });
		expect(parseWritten(written()).intervalSeconds).toBe(60);
	});

	test("defaults to reminderIntervalMinutes = 30", async () => {
		const { deps, written } = makeTestDeps({ prompts: discordAnswers() });
		await setup({ configPath: "/tmp/c.json", deps });
		expect(parseWritten(written()).reminderIntervalMinutes).toBe(30);
	});

	test("produces valid JSON that can be re-parsed", async () => {
		const { deps, written } = makeTestDeps({ prompts: discordAnswers() });
		await setup({ configPath: "/tmp/c.json", deps });
		expect(() => parseWritten(written())).not.toThrow();
	});

	test("includes all required top-level keys", async () => {
		const { deps, written } = makeTestDeps({ prompts: discordAnswers() });
		await setup({ configPath: "/tmp/c.json", deps });
		const cfg = parseWritten(written());
		for (const key of [
			"machineName",
			"intervalSeconds",
			"reminderIntervalMinutes",
			"database",
			"checks",
			"notifiers",
		]) {
			expect(cfg).toHaveProperty(key);
		}
	});
});

// ── Custom values ─────────────────────────────────────────────────────────────

describe("setup — custom values", () => {
	test("uses provided machine name", async () => {
		const answers = ["my-server", ...discordAnswers().slice(1)];
		const { deps, written } = makeTestDeps({ prompts: answers });
		await setup({ configPath: "/tmp/c.json", deps });
		expect(parseWritten(written()).machineName).toBe("my-server");
	});

	test("uses custom intervalSeconds", async () => {
		const answers = ["", "120", ...discordAnswers().slice(2)];
		const { deps, written } = makeTestDeps({ prompts: answers });
		await setup({ configPath: "/tmp/c.json", deps });
		expect(parseWritten(written()).intervalSeconds).toBe(120);
	});

	test("falls back to default for non-numeric interval input", async () => {
		const answers = ["", "not-a-number", ...discordAnswers().slice(2)];
		const { deps, written } = makeTestDeps({ prompts: answers });
		await setup({ configPath: "/tmp/c.json", deps });
		expect(parseWritten(written()).intervalSeconds).toBe(60);
	});
});

// ── Notifiers ─────────────────────────────────────────────────────────────────

describe("setup — Discord notifier", () => {
	test("adds discord notifier with provided webhook URL", async () => {
		const { deps, written } = makeTestDeps({ prompts: discordAnswers() });
		await setup({ configPath: "/tmp/c.json", deps });
		const notifiers = parseWritten(written()).notifiers as {
			type: string;
			webhookUrl: string;
		}[];
		expect(notifiers).toHaveLength(1);
		expect(notifiers[0]?.type).toBe("discord");
		expect(notifiers[0]?.webhookUrl).toBe(DISCORD_URL);
	});

	test("omits discord notifier when user declines", async () => {
		const { deps, written } = makeTestDeps({ prompts: noNotifierAnswers() });
		await setup({ configPath: "/tmp/c.json", deps });
		const notifiers = parseWritten(written()).notifiers as { type: string }[];
		expect(notifiers.find((n) => n.type === "discord")).toBeUndefined();
	});
});

describe("setup — Telegram notifier", () => {
	// 22 prompts: no discord, yes telegram with both fields, all checks default, temp+gpu disabled
	const telegramAnswers = [
		"",
		"",
		"",
		"", // general
		"n", // no discord
		"y",
		"123456:TOKEN",
		"-1001234567890", // telegram yes + credentials
		"",
		"",
		"", // cpu
		"",
		"",
		"", // load
		"",
		"",
		"", // memory
		"",
		"",
		"", // disk
		"",
		"", // temp disabled, gpu disabled
	];

	test("adds telegram notifier with both credentials", async () => {
		const { deps, written } = makeTestDeps({ prompts: telegramAnswers });
		await setup({ configPath: "/tmp/c.json", deps });
		const notifiers = parseWritten(written()).notifiers as {
			type: string;
			botToken: string;
			chatId: string;
		}[];
		expect(notifiers).toHaveLength(1);
		expect(notifiers[0]?.type).toBe("telegram");
		expect(notifiers[0]?.botToken).toBe("123456:TOKEN");
		expect(notifiers[0]?.chatId).toBe("-1001234567890");
	});
});

describe("setup — both notifiers", () => {
	// 24 prompts: discord yes, telegram yes, all checks default, temp+gpu disabled
	const bothAnswers = [
		"",
		"",
		"",
		"", // general
		"y",
		DISCORD_URL, // discord
		"y",
		"123456:TOKEN",
		"-1001234567890", // telegram
		"",
		"",
		"", // cpu
		"",
		"",
		"", // load
		"",
		"",
		"", // memory
		"",
		"",
		"", // disk
		"",
		"", // temp disabled, gpu disabled
	];

	test("adds both notifiers when both are confirmed", async () => {
		const { deps, written } = makeTestDeps({ prompts: bothAnswers });
		await setup({ configPath: "/tmp/c.json", deps });
		const notifiers = parseWritten(written()).notifiers as { type: string }[];
		expect(notifiers).toHaveLength(2);
		expect(notifiers.map((n) => n.type)).toContain("discord");
		expect(notifiers.map((n) => n.type)).toContain("telegram");
	});
});

describe("setup — no notifiers", () => {
	test("writes empty notifiers array", async () => {
		const { deps, written } = makeTestDeps({ prompts: noNotifierAnswers() });
		await setup({ configPath: "/tmp/c.json", deps });
		expect(parseWritten(written()).notifiers).toEqual([]);
	});
});

// ── Checks ────────────────────────────────────────────────────────────────────

describe("setup — check configuration", () => {
	test("CPU disabled skips threshold and breaches prompts", async () => {
		// Replace the 3 cpu prompts with just "n" (disabled)
		const answers = [
			"",
			"",
			"",
			"", // general
			"n",
			"n", // no notifiers
			"n", // cpu disabled (skips threshold + breaches)
			"",
			"",
			"", // load default
			"",
			"",
			"", // memory default
			"",
			"",
			"", // disk default
			"",
			"", // temp, gpu disabled
		];
		const { deps, written } = makeTestDeps({ prompts: answers });
		await setup({ configPath: "/tmp/c.json", deps });
		const checks = parseWritten(written()).checks as {
			cpu: { enabled: boolean; usageThresholdPercent: number };
		};
		expect(checks.cpu.enabled).toBe(false);
		expect(checks.cpu.usageThresholdPercent).toBe(90); // hardcoded default when disabled
	});

	test("custom CPU threshold is written", async () => {
		const answers = [
			"",
			"",
			"",
			"", // general
			"n",
			"n", // no notifiers
			"",
			"85",
			"", // cpu enabled, custom threshold, default breaches
			"",
			"",
			"", // load
			"",
			"",
			"", // memory
			"",
			"",
			"", // disk
			"",
			"", // temp, gpu
		];
		const { deps, written } = makeTestDeps({ prompts: answers });
		await setup({ configPath: "/tmp/c.json", deps });
		const checks = parseWritten(written()).checks as {
			cpu: { usageThresholdPercent: number };
		};
		expect(checks.cpu.usageThresholdPercent).toBe(85);
	});

	test("disk volumes parsed from comma-separated input", async () => {
		const answers = [
			"",
			"",
			"",
			"", // general
			"n",
			"n", // no notifiers
			"",
			"",
			"", // cpu
			"",
			"",
			"", // load
			"",
			"",
			"", // memory
			"",
			"",
			"/, /data", // disk enabled, default threshold, custom volumes
			"",
			"", // temp, gpu
		];
		const { deps, written } = makeTestDeps({ prompts: answers });
		await setup({ configPath: "/tmp/c.json", deps });
		const checks = parseWritten(written()).checks as {
			disk: { volumes: string[] };
		};
		expect(checks.disk.volumes).toEqual(["/", "/data"]);
	});

	test("temperature enabled with custom thresholds", async () => {
		const answers = [
			"",
			"",
			"",
			"", // general
			"n",
			"n", // no notifiers
			"",
			"",
			"", // cpu
			"",
			"",
			"", // load
			"",
			"",
			"", // memory
			"",
			"",
			"", // disk
			"y",
			"80",
			"75",
			"2", // temp enabled, cpu 80, gpu 75, 2 breaches
			"",
			"", // gpu disabled
		];
		const { deps, written } = makeTestDeps({ prompts: answers });
		await setup({ configPath: "/tmp/c.json", deps });
		const checks = parseWritten(written()).checks as {
			temperature: {
				enabled: boolean;
				cpuThresholdCelsius: number;
				gpuThresholdCelsius: number;
				consecutiveBreaches: number;
			};
		};
		expect(checks.temperature.enabled).toBe(true);
		expect(checks.temperature.cpuThresholdCelsius).toBe(80);
		expect(checks.temperature.gpuThresholdCelsius).toBe(75);
		expect(checks.temperature.consecutiveBreaches).toBe(2);
	});
});

describe("setup — disk and GPU", () => {
	test("disabled disk monitoring keeps the root volume", async () => {
		const answers = discordAnswers();
		// disk: disabled instead of enabled + threshold + volumes
		answers.splice(16, 3, "n");
		const { deps, written } = makeTestDeps({ prompts: answers });
		await setup({ configPath: "/tmp/c.json", deps });
		const checks = parseWritten(written()).checks as {
			disk: { enabled: boolean; volumes: string[] };
		};
		expect(checks.disk.enabled).toBe(false);
		expect(checks.disk.volumes).toEqual(["/"]);
	});

	test("GPU enabled with custom thresholds", async () => {
		const answers = discordAnswers();
		// gpu: enabled, 80% VRAM, 4 breaches
		answers.splice(-1, 1, "y", "80", "4");
		const { deps, written } = makeTestDeps({ prompts: answers });
		await setup({ configPath: "/tmp/c.json", deps });
		const checks = parseWritten(written()).checks as {
			gpu: {
				enabled: boolean;
				vramThresholdPercent: number;
				consecutiveBreaches: number;
			};
		};
		expect(checks.gpu).toEqual({
			enabled: true,
			vramThresholdPercent: 80,
			consecutiveBreaches: 4,
		});
	});
});

// ── Existing config ───────────────────────────────────────────────────────────

describe("setup — existing config as defaults", () => {
	const existingConfig = JSON.stringify({
		machineName: "production-server",
		intervalSeconds: 30,
		reminderIntervalMinutes: 60,
		notifiers: [
			{ type: "discord", webhookUrl: "https://existing-webhook.url" },
		],
		checks: {
			cpu: { enabled: true, usageThresholdPercent: 75, consecutiveBreaches: 5 },
		},
	});

	test("uses existing machineName as default when blank is entered", async () => {
		const { deps, written } = makeTestDeps({
			prompts: discordAnswers(),
			existing: existingConfig,
		});
		await setup({ configPath: "/tmp/c.json", deps });
		expect(parseWritten(written()).machineName).toBe("production-server");
	});

	test("uses existing intervalSeconds as default", async () => {
		const { deps, written } = makeTestDeps({
			prompts: discordAnswers(),
			existing: existingConfig,
		});
		await setup({ configPath: "/tmp/c.json", deps });
		expect(parseWritten(written()).intervalSeconds).toBe(30);
	});

	test("uses existing discord URL as default when blank is entered", async () => {
		// Discord is pre-existing, so default for "Set up Discord?" is Y
		// Pressing "" for URL should use existing URL
		const { deps, written } = makeTestDeps({
			prompts: discordAnswers(""),
			existing: existingConfig,
		});
		await setup({ configPath: "/tmp/c.json", deps });
		const notifiers = parseWritten(written()).notifiers as {
			type: string;
			webhookUrl: string;
		}[];
		expect(notifiers.find((n) => n.type === "discord")?.webhookUrl).toBe(
			"https://existing-webhook.url",
		);
	});

	test("gracefully handles corrupted existing JSON", async () => {
		const { deps, written } = makeTestDeps({
			prompts: discordAnswers(),
			existing: "{ invalid json }",
		});
		await expect(
			setup({ configPath: "/tmp/c.json", deps }),
		).resolves.toBeUndefined();
		expect(written()).not.toBeNull();
	});
});
