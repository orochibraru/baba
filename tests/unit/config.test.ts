import { afterEach, describe, expect, test } from "bun:test";
import { unlink } from "node:fs/promises";
import { ConfigSchema, loadConfig } from "../../src/config";

const VALID_WEBHOOK =
	"https://discord.com/api/webhooks/123456789/abcdefghijklmno";

const minimal = {
	notifiers: [{ type: "discord", webhookUrl: VALID_WEBHOOK }],
};

describe("ConfigSchema", () => {
	describe("defaults", () => {
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
				expect(r.data.checks.cpu.tempThresholdCelsius).toBe(85);
			}
		});

		test("applies default load check values", () => {
			const r = ConfigSchema.safeParse(minimal);
			expect(r.success).toBe(true);
			if (r.success) {
				expect(r.data.checks.load.enabled).toBe(true);
				expect(r.data.checks.load.threshold).toBe(8);
			}
		});

		test("applies default memory check values", () => {
			const r = ConfigSchema.safeParse(minimal);
			expect(r.success).toBe(true);
			if (r.success) {
				expect(r.data.checks.memory.enabled).toBe(true);
				expect(r.data.checks.memory.usageThresholdPercent).toBe(90);
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
	});

	describe("custom values", () => {
		test("accepts custom intervalSeconds", () => {
			const r = ConfigSchema.safeParse({ ...minimal, intervalSeconds: 30 });
			expect(r.success).toBe(true);
			if (r.success) expect(r.data.intervalSeconds).toBe(30);
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
				expect(r.data.checks.cpu.tempThresholdCelsius).toBe(85);
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
	const TMP = "/tmp/homelab-alerter-test-config.json";

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

	test("throws when config file does not exist", async () => {
		expect(loadConfig("/nonexistent/path/config.json")).rejects.toThrow(
			"Config file not found",
		);
	});

	test("throws with a formatted message listing all validation errors", async () => {
		await Bun.write(TMP, JSON.stringify({ notifiers: [] }));
		expect(loadConfig(TMP)).rejects.toThrow(
			"At least one notifier must be configured",
		);
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
});
