import { afterEach, describe, expect, test } from "bun:test";
import type { ValidateDeps } from "../../../src/lib/cli/validate";
import { validate } from "../../../src/lib/cli/validate";

const VALID_WEBHOOK =
	"https://discord.com/api/webhooks/123456789/abcdefghijklmno";
// biome-ignore lint/suspicious/noExplicitAny: test file
const fakeConfig = {} as any;

describe("validate", () => {
	test("sends a test alert when config is valid", async () => {
		let alerted = false;
		const deps: ValidateDeps = {
			loadConfig: async () => fakeConfig,
			createNotifiers: () => ({
				alert: async () => {
					alerted = true;
				},
			}),
		};
		await validate(deps);
		expect(alerted).toBe(true);
	});

	test("logs error and does not throw when alert fails", async () => {
		const deps: ValidateDeps = {
			loadConfig: async () => fakeConfig,
			createNotifiers: () => ({
				alert: async () => {
					throw new Error("webhook unreachable");
				},
			}),
		};
		await expect(validate(deps)).resolves.toBeUndefined();
	});

	test("propagates config load errors", async () => {
		const deps: ValidateDeps = {
			loadConfig: async () => {
				throw new Error("Invalid config:\n  • notifiers: required");
			},
			createNotifiers: () => ({ alert: async () => {} }),
		};
		await expect(validate(deps)).rejects.toThrow("Invalid config");
	});

	describe("default deps (production path)", () => {
		afterEach(() => {
			delete process.env.BABA_NOTIFIERS_DISCORD_WEBHOOK_URL;
		});

		test("calls real loadConfig and real Notifiers when no deps provided", async () => {
			process.env.BABA_NOTIFIERS_DISCORD_WEBHOOK_URL = VALID_WEBHOOK;
			// Uses defaultDeps: real loadConfig (env-var based) + real Notifiers (network fails gracefully)
			await expect(validate()).resolves.toBeUndefined();
		});
	});
});
