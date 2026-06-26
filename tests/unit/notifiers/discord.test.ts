import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { DiscordNotifier } from "../../../src/lib/notifiers/discord";

const WEBHOOK = "https://discord.com/api/webhooks/123456789/token";

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

beforeEach(() => {
	fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
		(async () => new Response("", { status: 204 })) as unknown as typeof fetch,
	);
});

afterEach(() => {
	fetchSpy.mockRestore();
});

describe("sendDiscordAlert", () => {
	test("POSTs to the webhook URL with content and username", async () => {
		const notifier = new DiscordNotifier({ webhookUrl: WEBHOOK });
		await notifier.sendAlert("Server is on fire");
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy.mock.calls[0]?.[0]).toBe(WEBHOOK);
		const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
		expect(init.method).toBe("POST");
		const body = JSON.parse(init.body as string);
		expect(body.content).toBe("Server is on fire");
		expect(body.username).toBe("Baba");
	});

	test("sets Content-Type header to application/json", async () => {
		const notifier = new DiscordNotifier({ webhookUrl: WEBHOOK });
		await notifier.sendAlert("test");
		const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
		expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
			"application/json",
		);
	});

	test("resolves without throwing on 2xx response", async () => {
		const notifier = new DiscordNotifier({ webhookUrl: WEBHOOK });
		expect(notifier.sendAlert("ok")).resolves.toBeUndefined();
	});

	describe("error handling", () => {
		let consoleErrorSpy: ReturnType<typeof spyOn>;

		beforeEach(() => {
			consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
		});

		afterEach(() => {
			consoleErrorSpy.mockRestore();
		});

		test("logs the status code when webhook returns a non-ok response", async () => {
			fetchSpy.mockImplementation(
				(async () =>
					new Response("Bad Request", {
						status: 400,
					})) as unknown as typeof fetch,
			);
			const notifier = new DiscordNotifier({ webhookUrl: WEBHOOK });
			await notifier.sendAlert("test");
			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
			expect(String(consoleErrorSpy.mock.calls[0]?.[0])).toContain("400");
		});

		test("logs an error message when fetch throws a network error", async () => {
			fetchSpy.mockImplementation((async () => {
				throw new Error("Network unreachable");
			}) as unknown as typeof fetch);
			const notifier = new DiscordNotifier({ webhookUrl: WEBHOOK });
			await notifier.sendAlert("test");
			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
			expect(String(consoleErrorSpy.mock.calls[0]?.[0])).toContain(
				"Failed to send alert to Discord",
			);
		});
	});

	describe("validate", () => {
		test("sends the validation message to the webhook", async () => {
			const notifier = new DiscordNotifier({ webhookUrl: WEBHOOK });
			await notifier.validate();
			expect(fetchSpy).toHaveBeenCalledTimes(1);
			const body = JSON.parse(
				(fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string,
			);
			expect(body.content).toBe("Validation message for Discord");
		});

		test("resolves without throwing even when the webhook call fails (sendAlert handles errors internally)", async () => {
			fetchSpy.mockImplementation((async () => {
				throw new Error("Network unreachable");
			}) as unknown as typeof fetch);
			const notifier = new DiscordNotifier({ webhookUrl: WEBHOOK });
			await expect(notifier.validate()).resolves.toBeUndefined();
		});
	});
});
