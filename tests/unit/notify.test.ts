import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";

const WEBHOOK = "https://discord.com/api/webhooks/123456789/token";

const notifyCfg = { notifiers: [{ type: "discord", webhookUrl: WEBHOOK }] };
mock.module("../../src/config", () => ({
	config: notifyCfg,
	getConfig: () => notifyCfg,
}));

import { logger } from "../../src/lib/logger";
import { Notifiers } from "../../src/lib/notifiers";

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

beforeEach(() => {
	fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
		(async () => new Response("", { status: 204 })) as unknown as typeof fetch,
	);
});

afterEach(() => {
	fetchSpy.mockRestore();
});

describe("notify", () => {
	test("dispatches to the discord webhook with the correct URL and message", async () => {
		const notifiers = new Notifiers();
		await notifiers.alert("CPU is too hot");
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy.mock.calls[0]?.[0]).toBe(WEBHOOK);
		const body = JSON.parse(
			(fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string,
		);
		expect(body.content).toBe("CPU is too hot");
	});

	test("logs the alert message to console before dispatching", async () => {
		const loggerSpy = spyOn(logger, "info").mockImplementation(
			() => logger as never,
		);
		const notifiers = new Notifiers();
		await notifiers.alert("Disk full");
		expect(
			loggerSpy.mock.calls.some((args) =>
				String(args[0]).includes("Disk full"),
			),
		).toBe(true);
		loggerSpy.mockRestore();
	});
});
