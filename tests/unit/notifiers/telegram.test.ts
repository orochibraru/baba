import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { logger } from "../../../src/lib/logger";
import { TelegramNotifier } from "../../../src/lib/notifiers/telegram";

const BOT_TOKEN = "123456789:ABC-DEFghijklmno";
const CHAT_ID = "-1001234567890";
const EXPECTED_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

beforeEach(() => {
	fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
		(async () =>
			new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			})) as unknown as typeof fetch,
	);
});

afterEach(() => {
	fetchSpy.mockRestore();
});

describe("TelegramNotifier", () => {
	describe("sendAlert", () => {
		test("POSTs to the correct Telegram API URL with the bot token", async () => {
			const notifier = new TelegramNotifier({
				botToken: BOT_TOKEN,
				chatId: CHAT_ID,
			});
			await notifier.sendAlert("Server is on fire");
			expect(fetchSpy).toHaveBeenCalledTimes(1);
			expect(fetchSpy.mock.calls[0]?.[0]).toBe(EXPECTED_URL);
		});

		test("sends chat_id and text in the request body", async () => {
			const notifier = new TelegramNotifier({
				botToken: BOT_TOKEN,
				chatId: CHAT_ID,
			});
			await notifier.sendAlert("Server is on fire");
			const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
			const body = JSON.parse(init.body as string);
			expect(body.chat_id).toBe(CHAT_ID);
			expect(body.text).toBe("Server is on fire");
		});

		test("sets Content-Type header to application/json", async () => {
			const notifier = new TelegramNotifier({
				botToken: BOT_TOKEN,
				chatId: CHAT_ID,
			});
			await notifier.sendAlert("test");
			const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
			expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
				"application/json",
			);
		});

		test("resolves without throwing on 2xx response", async () => {
			const notifier = new TelegramNotifier({
				botToken: BOT_TOKEN,
				chatId: CHAT_ID,
			});
			await expect(notifier.sendAlert("ok")).resolves.toBeUndefined();
		});

		describe("error handling", () => {
			let loggerErrorSpy: ReturnType<typeof spyOn>;

			beforeEach(() => {
				loggerErrorSpy = spyOn(logger, "error").mockImplementation(
					() => logger as never,
				);
			});

			afterEach(() => {
				loggerErrorSpy.mockRestore();
			});

			test("logs the Telegram error description when the API returns a non-ok response", async () => {
				fetchSpy.mockImplementation(
					(async () =>
						new Response(
							JSON.stringify({
								ok: false,
								description: "Bad Request: chat not found",
							}),
							{ status: 400, headers: { "Content-Type": "application/json" } },
						)) as unknown as typeof fetch,
				);
				const notifier = new TelegramNotifier({
					botToken: BOT_TOKEN,
					chatId: CHAT_ID,
				});
				await notifier.sendAlert("test");
				expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
				expect(String(loggerErrorSpy.mock.calls[0]?.[0])).toContain(
					"chat not found",
				);
			});

			test("logs the status code when no description is present", async () => {
				fetchSpy.mockImplementation(
					(async () =>
						new Response(JSON.stringify({ ok: false }), {
							status: 500,
							headers: { "Content-Type": "application/json" },
						})) as unknown as typeof fetch,
				);
				const notifier = new TelegramNotifier({
					botToken: BOT_TOKEN,
					chatId: CHAT_ID,
				});
				await notifier.sendAlert("test");
				expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
				expect(String(loggerErrorSpy.mock.calls[0]?.[0])).toContain("500");
			});

			test("logs an error message when fetch throws a network error", async () => {
				fetchSpy.mockImplementation((async () => {
					throw new Error("Network unreachable");
				}) as unknown as typeof fetch);
				const notifier = new TelegramNotifier({
					botToken: BOT_TOKEN,
					chatId: CHAT_ID,
				});
				await notifier.sendAlert("test");
				expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
				expect(String(loggerErrorSpy.mock.calls[0]?.[0])).toContain(
					"Network unreachable",
				);
			});
		});
	});

	describe("validate", () => {
		test("sends the validation message to Telegram", async () => {
			const notifier = new TelegramNotifier({
				botToken: BOT_TOKEN,
				chatId: CHAT_ID,
			});
			await notifier.validate();
			const body = JSON.parse(
				(fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string,
			);
			expect(body.text).toBe("Validation message for Telegram");
		});
	});
});
