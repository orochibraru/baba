import { afterEach, describe, expect, test } from "bun:test";
import { unlink } from "node:fs/promises";
import {
	ConfigSchema,
	getConfig,
	isConfigLoaded,
	loadConfig,
} from "../../src/config";

const VALID_WEBHOOK =
	"https://discord.com/api/webhooks/123456789/abcdefghijklmno";

const minimal = {
	notifiers: [{ type: "discord", webhookUrl: VALID_WEBHOOK }],
};

describe("ConfigSchema", () => {
	describe("defaults", () => {
		test("applies default logLevel of info", () => {
			const r = ConfigSchema.safeParse(minimal);
			expect(r.success).toBe(true);
			if (r.success) expect(r.data.logLevel).toBe("info");
		});

		test("applies default intervalSeconds of 60", () => {
			const r = ConfigSchema.safeParse(minimal);
			expect(r.success).toBe(true);
			if (r.success) expect(r.data.intervalSeconds).toBe(60);
		});

		test("applies default cpu check values", () => {
			const r = ConfigSchema.safeParse(minimal);
			expect(r.success).toBe(true);
			if (r.success) {
				expect(r.data.checks.cpu.enabled).toBe(true);
				expect(r.data.checks.cpu.usageThresholdPercent).toBe(90);
				expect(r.data.checks.cpu.consecutiveBreaches).toBe(3);
			}
		});

		test("applies default load check values", () => {
			const r = ConfigSchema.safeParse(minimal);
			expect(r.success).toBe(true);
			if (r.success) {
				expect(r.data.checks.load.enabled).toBe(true);
				expect(r.data.checks.load.threshold).toBe(8);
				expect(r.data.checks.load.consecutiveBreaches).toBe(3);
			}
		});

		test("applies default memory check values", () => {
			const r = ConfigSchema.safeParse(minimal);
			expect(r.success).toBe(true);
			if (r.success) {
				expect(r.data.checks.memory.enabled).toBe(true);
				expect(r.data.checks.memory.usageThresholdPercent).toBe(90);
				expect(r.data.checks.memory.consecutiveBreaches).toBe(3);
			}
		});

		test("applies default disk check values", () => {
			const r = ConfigSchema.safeParse(minimal);
			expect(r.success).toBe(true);
			if (r.success) {
				expect(r.data.checks.disk.enabled).toBe(true);
				expect(r.data.checks.disk.usageThresholdPercent).toBe(90);
				expect(r.data.checks.disk.volumes).toEqual(["/"]);
			}
		});

		test("applies default temperature check values", () => {
			const r = ConfigSchema.safeParse(minimal);
			expect(r.success).toBe(true);
			if (r.success) {
				expect(r.data.checks.temperature.enabled).toBe(false);
				expect(r.data.checks.temperature.cpuThresholdCelsius).toBe(85);
				expect(r.data.checks.temperature.gpuThresholdCelsius).toBe(85);
				expect(r.data.checks.temperature.consecutiveBreaches).toBe(3);
			}
		});

		test("applies default gpu check values", () => {
			const r = ConfigSchema.safeParse(minimal);
			expect(r.success).toBe(true);
			if (r.success) {
				expect(r.data.checks.gpu.enabled).toBe(false);
				expect(r.data.checks.gpu.vramThresholdPercent).toBe(90);
				expect(r.data.checks.gpu.consecutiveBreaches).toBe(3);
			}
		});

		test("applies default reminderIntervalMinutes of 30", () => {
			const r = ConfigSchema.safeParse(minimal);
			expect(r.success).toBe(true);
			if (r.success) expect(r.data.reminderIntervalMinutes).toBe(30);
		});

		test("applies default database path", () => {
			const r = ConfigSchema.safeParse(minimal);
			expect(r.success).toBe(true);
			if (r.success) expect(r.data.database.path).toBe("./tmp/baba.db");
		});
	});

	describe("custom values", () => {
		test("accepts custom intervalSeconds", () => {
			const r = ConfigSchema.safeParse({ ...minimal, intervalSeconds: 30 });
			expect(r.success).toBe(true);
			if (r.success) expect(r.data.intervalSeconds).toBe(30);
		});

		test("accepts valid logLevel values", () => {
			for (const level of [
				"trace",
				"debug",
				"info",
				"warn",
				"error",
			] as const) {
				const r = ConfigSchema.safeParse({ ...minimal, logLevel: level });
				expect(r.success).toBe(true);
				if (r.success) expect(r.data.logLevel).toBe(level);
			}
		});

		test("accepts $schema field without failing", () => {
			const r = ConfigSchema.safeParse({
				...minimal,
				$schema: "./schema/config.schema.json",
			});
			expect(r.success).toBe(true);
		});

		test("accepts partial checks override while keeping other defaults", () => {
			const r = ConfigSchema.safeParse({
				...minimal,
				checks: { cpu: { usageThresholdPercent: 70 } },
			});
			expect(r.success).toBe(true);
			if (r.success) {
				expect(r.data.checks.cpu.usageThresholdPercent).toBe(70);
				expect(r.data.checks.cpu.enabled).toBe(true);
				expect(r.data.checks.cpu.consecutiveBreaches).toBe(3);
			}
		});

		test("accepts multiple notifiers of the same type", () => {
			const r = ConfigSchema.safeParse({
				...minimal,
				notifiers: [
					{ type: "discord", webhookUrl: VALID_WEBHOOK },
					{
						type: "discord",
						webhookUrl: "https://discord.com/api/webhooks/987/xyz",
					},
				],
			});
			expect(r.success).toBe(true);
			if (r.success) expect(r.data.notifiers).toHaveLength(2);
		});

		test("accepts a valid Telegram notifier", () => {
			const r = ConfigSchema.safeParse({
				notifiers: [
					{ type: "telegram", botToken: "123:ABC", chatId: "-100123" },
				],
			});
			expect(r.success).toBe(true);
			if (r.success) {
				const n = r.data.notifiers[0];
				expect(n?.type).toBe("telegram");
				if (n?.type === "telegram") {
					expect(n.botToken).toBe("123:ABC");
					expect(n.chatId).toBe("-100123");
				}
			}
		});

		test("accepts mixed Discord and Telegram notifiers together", () => {
			const r = ConfigSchema.safeParse({
				notifiers: [
					{ type: "discord", webhookUrl: VALID_WEBHOOK },
					{ type: "telegram", botToken: "123:ABC", chatId: "-100123" },
				],
			});
			expect(r.success).toBe(true);
			if (r.success) expect(r.data.notifiers).toHaveLength(2);
		});

		test("accepts disabled checks", () => {
			const r = ConfigSchema.safeParse({
				...minimal,
				checks: { cpu: { enabled: false } },
			});
			expect(r.success).toBe(true);
			if (r.success) expect(r.data.checks.cpu.enabled).toBe(false);
		});
	});

	describe("validation errors", () => {
		describe("Discord notifier", () => {
			test("rejects an invalid webhook URL", () => {
				const r = ConfigSchema.safeParse({
					notifiers: [{ type: "discord", webhookUrl: "not-a-url" }],
				});
				expect(r.success).toBe(false);
				if (!r.success)
					expect(r.error.issues[0]?.message).toContain(
						"Must be a valid Discord webhook URL",
					);
			});

			test("rejects a missing webhookUrl", () => {
				const r = ConfigSchema.safeParse({
					notifiers: [{ type: "discord" }],
				});
				expect(r.success).toBe(false);
			});

			test("rejects extra unknown fields", () => {
				const r = ConfigSchema.safeParse({
					notifiers: [
						{ type: "discord", webhookUrl: VALID_WEBHOOK, extra: true },
					],
				});
				expect(r.success).toBe(false);
			});
		});

		describe("Telegram notifier", () => {
			test("rejects a missing botToken", () => {
				const r = ConfigSchema.safeParse({
					notifiers: [{ type: "telegram", chatId: "-100123" }],
				});
				expect(r.success).toBe(false);
			});

			test("rejects an empty botToken", () => {
				const r = ConfigSchema.safeParse({
					notifiers: [{ type: "telegram", botToken: "", chatId: "-100123" }],
				});
				expect(r.success).toBe(false);
				if (!r.success)
					expect(r.error.issues[0]?.message).toContain(
						"Bot token cannot be empty",
					);
			});

			test("rejects a missing chatId", () => {
				const r = ConfigSchema.safeParse({
					notifiers: [{ type: "telegram", botToken: "123:ABC" }],
				});
				expect(r.success).toBe(false);
			});

			test("rejects an empty chatId", () => {
				const r = ConfigSchema.safeParse({
					notifiers: [{ type: "telegram", botToken: "123:ABC", chatId: "" }],
				});
				expect(r.success).toBe(false);
				if (!r.success)
					expect(r.error.issues[0]?.message).toContain(
						"Chat ID cannot be empty",
					);
			});

			test("rejects extra unknown fields", () => {
				const r = ConfigSchema.safeParse({
					notifiers: [
						{
							type: "telegram",
							botToken: "123:ABC",
							chatId: "-100123",
							extra: true,
						},
					],
				});
				expect(r.success).toBe(false);
			});
		});

		test("rejects an unknown notifier type with an explanatory message", () => {
			const r = ConfigSchema.safeParse({
				notifiers: [{ type: "slack", webhookUrl: VALID_WEBHOOK }],
			});
			expect(r.success).toBe(false);
			if (!r.success) {
				expect(r.error.issues[0]?.message).toContain("Unknown notifier type");
				expect(r.error.issues[0]?.message).toContain("slack");
				expect(r.error.issues[0]?.message).toContain("discord");
				expect(r.error.issues[0]?.message).toContain("telegram");
			}
		});

		test("rejects empty notifiers array", () => {
			const r = ConfigSchema.safeParse({ ...minimal, notifiers: [] });
			expect(r.success).toBe(false);
			if (!r.success) {
				expect(r.error.issues[0]?.message).toContain(
					"At least one notifier must be configured",
				);
			}
		});

		test("rejects missing notifiers", () => {
			const r = ConfigSchema.safeParse({});
			expect(r.success).toBe(false);
		});

		test("rejects an invalid logLevel", () => {
			const r = ConfigSchema.safeParse({ ...minimal, logLevel: "verbose" });
			expect(r.success).toBe(false);
			if (!r.success)
				expect(r.error.issues[0]?.message).toContain(
					'Must be one of: "trace", "debug"',
				);
		});

		test("rejects zero intervalSeconds", () => {
			const r = ConfigSchema.safeParse({ ...minimal, intervalSeconds: 0 });
			expect(r.success).toBe(false);
			if (!r.success) {
				expect(r.error.issues[0]?.message).toContain(
					"Must be a positive number of seconds",
				);
			}
		});

		test("rejects negative intervalSeconds", () => {
			const r = ConfigSchema.safeParse({ ...minimal, intervalSeconds: -10 });
			expect(r.success).toBe(false);
		});

		test("rejects cpu usageThresholdPercent above 100", () => {
			const r = ConfigSchema.safeParse({
				...minimal,
				checks: { cpu: { usageThresholdPercent: 101 } },
			});
			expect(r.success).toBe(false);
			if (!r.success) {
				expect(r.error.issues[0]?.message).toBe("Must be at most 100");
			}
		});

		test("rejects cpu usageThresholdPercent below 0", () => {
			const r = ConfigSchema.safeParse({
				...minimal,
				checks: { cpu: { usageThresholdPercent: -1 } },
			});
			expect(r.success).toBe(false);
			if (!r.success) {
				expect(r.error.issues[0]?.message).toBe("Must be at least 0");
			}
		});

		test("rejects non-positive load threshold", () => {
			const r = ConfigSchema.safeParse({
				...minimal,
				checks: { load: { threshold: 0 } },
			});
			expect(r.success).toBe(false);
		});

		test("rejects empty disk volumes array", () => {
			const r = ConfigSchema.safeParse({
				...minimal,
				checks: { disk: { volumes: [] } },
			});
			expect(r.success).toBe(false);
			if (!r.success) {
				expect(r.error.issues[0]?.message).toContain(
					"Must include at least one",
				);
			}
		});

		test("rejects non-boolean enabled flag with explicit error message", () => {
			const r = ConfigSchema.safeParse({
				...minimal,
				checks: { cpu: { enabled: "yes" } },
			});
			expect(r.success).toBe(false);
			if (!r.success) {
				expect(r.error.issues[0]?.message).toBe("Must be true or false");
			}
		});

		test("rejects non-numeric threshold", () => {
			const r = ConfigSchema.safeParse({
				...minimal,
				checks: { load: { threshold: "high" } },
			});
			expect(r.success).toBe(false);
			if (!r.success) {
				expect(r.error.issues[0]?.message).toBe("Must be a number");
			}
		});
	});
});

describe("loadConfig", () => {
	const TMP = "/tmp/baba-test-config.json";

	afterEach(async () => {
		try {
			await unlink(TMP);
		} catch {}
	});

	test("parses and returns a valid config file", async () => {
		await Bun.write(
			TMP,
			JSON.stringify({
				notifiers: [{ type: "discord", webhookUrl: VALID_WEBHOOK }],
			}),
		);
		const config = await loadConfig(TMP);
		expect(config.intervalSeconds).toBe(60);
		expect(config.notifiers).toHaveLength(1);
		expect(config.notifiers[0]?.type).toBe("discord");
	});

	test("applies schema defaults when optional fields are omitted", async () => {
		await Bun.write(
			TMP,
			JSON.stringify({
				notifiers: [{ type: "discord", webhookUrl: VALID_WEBHOOK }],
			}),
		);
		const config = await loadConfig(TMP);
		expect(config.checks.cpu.usageThresholdPercent).toBe(90);
		expect(config.checks.disk.enabled).toBe(true);
	});

	test("succeeds with env vars when no config file exists", async () => {
		process.env.BABA_NOTIFIERS = JSON.stringify([
			{ type: "discord", webhookUrl: VALID_WEBHOOK },
		]);
		try {
			const config = await loadConfig("/nonexistent/path/config.json");
			expect(config.notifiers).toHaveLength(1);
			expect(config.notifiers[0]?.type).toBe("discord");
		} finally {
			delete process.env.BABA_NOTIFIERS;
		}
	});

	test("throws validation error when no config file and no notifiers configured", async () => {
		expect(loadConfig("/nonexistent/path/config.json")).rejects.toThrow(
			"Invalid config:",
		);
	});

	test("throws with a formatted message listing all validation errors", async () => {
		await Bun.write(TMP, JSON.stringify({ notifiers: [] }));
		expect(loadConfig(TMP)).rejects.toThrow(
			"At least one notifier must be configured",
		);
	});

	describe("env var overrides", () => {
		afterEach(() => {
			for (const key of Object.keys(process.env)) {
				if (key.startsWith("BABA_")) delete process.env[key];
			}
		});

		test("applies number coercion (BABA_INTERVAL_SECONDS)", async () => {
			await Bun.write(TMP, JSON.stringify(minimal));
			process.env.BABA_INTERVAL_SECONDS = "30";
			const config = await loadConfig(TMP);
			expect(config.intervalSeconds).toBe(30);
		});

		test("applies boolean coercion via false string (BABA_CPU_ENABLED)", async () => {
			await Bun.write(TMP, JSON.stringify(minimal));
			process.env.BABA_CPU_ENABLED = "false";
			const config = await loadConfig(TMP);
			expect(config.checks.cpu.enabled).toBe(false);
		});

		test("applies boolean coercion via 1 (BABA_CPU_ENABLED)", async () => {
			await Bun.write(TMP, JSON.stringify(minimal));
			process.env.BABA_CPU_ENABLED = "1";
			const config = await loadConfig(TMP);
			expect(config.checks.cpu.enabled).toBe(true);
		});

		test("applies csv coercion (BABA_DISK_VOLUMES)", async () => {
			await Bun.write(TMP, JSON.stringify(minimal));
			process.env.BABA_DISK_VOLUMES = "/,/data,/mnt";
			const config = await loadConfig(TMP);
			expect(config.checks.disk.volumes).toEqual(["/", "/data", "/mnt"]);
		});

		test("applies json coercion (BABA_NOTIFIERS)", async () => {
			await Bun.write(TMP, JSON.stringify(minimal));
			const override = [
				{
					type: "discord",
					webhookUrl: "https://discord.com/api/webhooks/99/zz",
				},
			];
			process.env.BABA_NOTIFIERS = JSON.stringify(override);
			const config = await loadConfig(TMP);
			expect(config.notifiers).toHaveLength(1);
			expect(
				(config.notifiers[0] as { webhookUrl: string }).webhookUrl,
			).toContain("99");
		});

		test("applies string coercion (BABA_MACHINE_NAME)", async () => {
			await Bun.write(TMP, JSON.stringify(minimal));
			process.env.BABA_MACHINE_NAME = "my-server";
			const config = await loadConfig(TMP);
			expect(config.machineName).toBe("my-server");
		});

		test("silently ignores an invalid env var value", async () => {
			await Bun.write(TMP, JSON.stringify(minimal));
			process.env.BABA_NOTIFIERS = "not-valid-json{{{";
			const config = await loadConfig(TMP);
			expect(config.notifiers).toHaveLength(1);
		});
	});

	test("non-existent notifiers throw an error", async () => {
		await Bun.write(
			TMP,
			JSON.stringify({
				notifiers: [{ type: "nonexistent", webhookUrl: VALID_WEBHOOK }],
			}),
		);
		expect(loadConfig(TMP)).rejects.toThrow("Unknown notifier type");
		expect(loadConfig(TMP)).rejects.toThrow("nonexistent");
	});

	test("isConfigLoaded returns true after a successful load", async () => {
		await Bun.write(TMP, JSON.stringify(minimal));
		await loadConfig(TMP);
		expect(isConfigLoaded()).toBe(true);
	});

	test("getConfig returns an object after loading", async () => {
		await Bun.write(TMP, JSON.stringify(minimal));
		await loadConfig(TMP);
		expect(typeof getConfig()).toBe("object");
	});
});
