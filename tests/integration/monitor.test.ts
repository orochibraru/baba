/**
 * Integration tests: real in-memory SQLite + real breach logic + real HTTP notifiers.
 * A Bun test server captures Discord webhooks and Telegram API calls.
 */

// --- Mutable system metric state ---

let siCpuLoad = 50;
let siCpuTemp: {
	main: number | null;
	max: number | null;
	cores: number[];
	socket: number[];
	chipset: number | null;
} = { main: null, max: null, cores: [], socket: [], chipset: null };

// biome-ignore lint/suspicious/noExplicitAny: integration config mock
const integConfig: any = {
	machineName: "test-host",
	reminderIntervalMinutes: 30,
	database: { path: ":memory:" },
	checks: {
		cpu: { enabled: true, usageThresholdPercent: 80, consecutiveBreaches: 1 },
		load: { enabled: false, threshold: 8, consecutiveBreaches: 1 },
		memory: {
			enabled: false,
			usageThresholdPercent: 90,
			consecutiveBreaches: 1,
		},
		disk: { enabled: false, usageThresholdPercent: 90, volumes: ["/"] },
		temperature: {
			enabled: false,
			cpuThresholdCelsius: 85,
			gpuThresholdCelsius: 85,
			consecutiveBreaches: 1,
		},
		gpu: { enabled: false, vramThresholdPercent: 90, consecutiveBreaches: 1 },
	},
	notifiers: [],
};

mock.module("../../src/config", () => ({
	config: integConfig,
	getConfig: () => integConfig,
}));

mock.module("systeminformation", () => ({
	default: {
		currentLoad: async () => ({ currentLoad: siCpuLoad, avgLoad: 1.0 }),
		mem: async () => ({ total: 16 * 1024 ** 3, used: 8 * 1024 ** 3 }),
		fsSize: async () => [],
		cpuTemperature: async () => siCpuTemp,
		graphics: async () => ({ controllers: [] }),
	},
}));

import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { initDb } from "../../src/lib/db";
import { IncidentStore } from "../../src/lib/incident-store";
import { Monitor } from "../../src/lib/monitor/index";

// --- Dummy HTTP server ---

type HttpRecord = { method: string; path: string; body: unknown };
const httpLog: HttpRecord[] = [];
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
	server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		async fetch(req) {
			const body = await req.json().catch(() => null);
			httpLog.push({
				method: req.method,
				path: new URL(req.url).pathname,
				body,
			});
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		},
	});

	// Redirect Telegram API calls to our test server
	const realFetch = globalThis.fetch;
	globalThis.fetch = (async (input, init) => {
		const url = String(input);
		if (url.includes("api.telegram.org")) {
			return realFetch(
				`http://127.0.0.1:${server.port}${new URL(url).pathname}`,
				init,
			);
		}
		return realFetch(input as Parameters<typeof fetch>[0], init);
	}) as typeof fetch;
});

afterAll(() => {
	server.stop();
});

beforeEach(() => {
	httpLog.length = 0;
	siCpuLoad = 50;
	siCpuTemp = { main: null, max: null, cores: [], socket: [], chipset: null };
	integConfig.checks.cpu.consecutiveBreaches = 1;
	integConfig.checks.cpu.usageThresholdPercent = 80;
	integConfig.checks.temperature.enabled = false;
	integConfig.notifiers = [];
	initDb(); // fresh in-memory db for each test
});

// --- Helpers ---

function makeStore(): IncidentStore {
	return new IncidentStore();
}

// --- Discord ---

describe("Discord alerts", () => {
	test("sends a breach alert to the Discord webhook", async () => {
		integConfig.notifiers = [
			{ type: "discord", webhookUrl: `http://127.0.0.1:${server.port}` },
		];
		siCpuLoad = 95;
		const _store = makeStore();
		const monitor = new Monitor();
		await monitor.runAllParallel();

		expect(httpLog).toHaveLength(1);
		const req = httpLog[0];
		expect(req?.method).toBe("POST");
		expect((req?.body as { content: string }).content).toContain("test-host");
		expect((req?.body as { content: string }).content).toContain("CPU");
	});

	test("does not send alert when CPU is below threshold", async () => {
		integConfig.notifiers = [
			{ type: "discord", webhookUrl: `http://127.0.0.1:${server.port}` },
		];
		siCpuLoad = 70;
		const _store = makeStore();
		const monitor = new Monitor();
		await monitor.runAllParallel();

		expect(httpLog).toHaveLength(0);
	});

	test("does not alert before reaching consecutiveBreaches count", async () => {
		integConfig.notifiers = [
			{ type: "discord", webhookUrl: `http://127.0.0.1:${server.port}` },
		];
		integConfig.checks.cpu.consecutiveBreaches = 3;
		siCpuLoad = 95;
		const store = makeStore();
		const monitor = new Monitor();

		await monitor.runAllParallel();
		await monitor.runAllParallel();

		expect(httpLog).toHaveLength(0);
		expect(store.getActiveIncident("cpu")).toBeNull();
	});

	test("opens incident and alerts on the Nth consecutive breach", async () => {
		integConfig.notifiers = [
			{ type: "discord", webhookUrl: `http://127.0.0.1:${server.port}` },
		];
		integConfig.checks.cpu.consecutiveBreaches = 3;
		siCpuLoad = 95;
		const store = makeStore();
		const monitor = new Monitor();

		await monitor.runAllParallel();
		await monitor.runAllParallel();
		await monitor.runAllParallel();

		expect(httpLog).toHaveLength(1);
		expect(store.getActiveIncident("cpu")).not.toBeNull();
	});

	test("sends recovery alert and resolves incident when CPU drops", async () => {
		integConfig.notifiers = [
			{ type: "discord", webhookUrl: `http://127.0.0.1:${server.port}` },
		];
		siCpuLoad = 95;
		const store = makeStore();
		const monitor = new Monitor();
		await monitor.runAllParallel();

		expect(httpLog).toHaveLength(1);
		const incidentAfterBreach = store.getActiveIncident("cpu");
		expect(incidentAfterBreach).not.toBeNull();

		httpLog.length = 0;
		siCpuLoad = 50;
		await monitor.runAllParallel();

		expect(httpLog).toHaveLength(1);
		expect((httpLog[0]?.body as { content: string }).content).toContain(
			"Back to normal",
		);
		expect(store.getActiveIncident("cpu")).toBeNull();
		expect(
			store.getIncident(incidentAfterBreach?.id ?? 0)?.resolved_at,
		).not.toBeNull();
	});

	test("persists incident and notifications to the database", async () => {
		integConfig.notifiers = [
			{ type: "discord", webhookUrl: `http://127.0.0.1:${server.port}` },
		];
		siCpuLoad = 95;
		const store = makeStore();
		const monitor = new Monitor();
		await monitor.runAllParallel();

		const incident = store.getActiveIncident("cpu");
		expect(incident).not.toBeNull();
		expect(incident?.metric).toBe("cpu");
		expect(incident?.peak_value).toBe(95);
		expect(incident?.threshold).toBe(80);

		const detail = store.getIncident(incident?.id ?? 0);
		expect(detail?.notifications).toHaveLength(1);
		expect(detail?.notifications[0]?.type).toBe("alert");
		expect(detail?.notifications[0]?.succeeded).toBe(1);
	});
});

// --- Telegram ---

describe("Telegram alerts", () => {
	const BOT_TOKEN = "123456789:ABC-test-token";
	const CHAT_ID = "-1001234567890";

	test("sends a breach alert to the Telegram API", async () => {
		integConfig.notifiers = [
			{ type: "telegram", botToken: BOT_TOKEN, chatId: CHAT_ID },
		];
		siCpuLoad = 95;
		const _store = makeStore();
		const monitor = new Monitor();
		await monitor.runAllParallel();

		expect(httpLog).toHaveLength(1);
		const req = httpLog[0];
		expect(req?.path).toBe(`/bot${BOT_TOKEN}/sendMessage`);
		expect((req?.body as { chat_id: string; text: string }).chat_id).toBe(
			CHAT_ID,
		);
		expect((req?.body as { text: string }).text).toContain("test-host");
		expect((req?.body as { text: string }).text).toContain("CPU");
	});

	test("sends recovery alert via Telegram when CPU drops", async () => {
		integConfig.notifiers = [
			{ type: "telegram", botToken: BOT_TOKEN, chatId: CHAT_ID },
		];
		siCpuLoad = 95;
		const _store = makeStore();
		const monitor = new Monitor();
		await monitor.runAllParallel();

		httpLog.length = 0;
		siCpuLoad = 50;
		await monitor.runAllParallel();

		expect(httpLog).toHaveLength(1);
		expect((httpLog[0]?.body as { text: string }).text).toContain(
			"Back to normal",
		);
	});
});

// --- Multi-notifier ---

describe("multiple notifiers", () => {
	test("sends to both Discord and Telegram on a single breach", async () => {
		const BOT_TOKEN = "test-bot";
		const CHAT_ID = "test-chat";
		integConfig.notifiers = [
			{
				type: "discord",
				webhookUrl: `http://127.0.0.1:${server.port}/discord`,
			},
			{ type: "telegram", botToken: BOT_TOKEN, chatId: CHAT_ID },
		];
		siCpuLoad = 95;
		const _store = makeStore();
		const monitor = new Monitor();
		await monitor.runAllParallel();

		expect(httpLog).toHaveLength(2);
		const paths = httpLog.map((r) => r.path);
		expect(paths).toContain("/discord");
		expect(paths).toContain(`/bot${BOT_TOKEN}/sendMessage`);
	});
});

// --- Temperature ---

describe("Temperature check", () => {
	beforeEach(() => {
		integConfig.checks.temperature.enabled = true;
		integConfig.notifiers = [
			{ type: "discord", webhookUrl: `http://127.0.0.1:${server.port}` },
		];
		// Disable CPU so only temperature alerts are emitted
		integConfig.checks.cpu.enabled = false;
	});

	afterEach(() => {
		integConfig.checks.cpu.enabled = true;
	});

	test("Apple Silicon all-nulls — no alert, no incident opened", async () => {
		// siCpuTemp is already { main: null, max: null, cores: [], socket: [], chipset: null }
		const store = makeStore();
		const monitor = new Monitor();
		await monitor.runAllParallel();

		expect(httpLog).toHaveLength(0);
		expect(store.getActiveIncident("temp:cpu")).toBeNull();
	});

	test("SI sentinel -1 — treated as unavailable, no alert fired", async () => {
		siCpuTemp = { main: -1, max: -1, cores: [], socket: [], chipset: null };
		const store = makeStore();
		const monitor = new Monitor();
		await monitor.runAllParallel();

		expect(httpLog).toHaveLength(0);
		expect(store.getActiveIncident("temp:cpu")).toBeNull();
	});

	test("cores-only data below threshold — status line logged, no alert", async () => {
		siCpuTemp = {
			main: null,
			max: null,
			cores: [60, 62],
			socket: [],
			chipset: null,
		};
		const store = makeStore();
		const monitor = new Monitor();
		await monitor.runAllParallel();

		expect(httpLog).toHaveLength(0);
		expect(store.getActiveIncident("temp:cpu")).toBeNull();
	});

	test("cores-only data above threshold — fires Discord alert with highest core", async () => {
		siCpuTemp = {
			main: null,
			max: null,
			cores: [88, 90],
			socket: [],
			chipset: null,
		};
		const store = makeStore();
		const monitor = new Monitor();
		await monitor.runAllParallel();

		expect(httpLog).toHaveLength(1);
		const content = (httpLog[0]?.body as { content: string }).content;
		expect(content).toContain("CPU TEMP");
		expect(content).toContain("90°C");
		expect(content).toContain("test-host");
		expect(store.getActiveIncident("temp:cpu")).not.toBeNull();
	});

	test("max field takes priority over main when both available", async () => {
		siCpuTemp = {
			main: 87,
			max: 92,
			cores: [87, 88],
			socket: [],
			chipset: null,
		};
		const _store = makeStore();
		const monitor = new Monitor();
		await monitor.runAllParallel();

		expect(httpLog).toHaveLength(1);
		expect((httpLog[0]?.body as { content: string }).content).toContain("92°C");
	});

	test("sends recovery alert when temperature drops below threshold", async () => {
		siCpuTemp = { main: null, max: 90, cores: [], socket: [], chipset: null };
		const store = makeStore();
		const monitor = new Monitor();
		await monitor.runAllParallel();

		expect(httpLog).toHaveLength(1);
		expect(store.getActiveIncident("temp:cpu")).not.toBeNull();

		httpLog.length = 0;
		siCpuTemp = { main: null, max: 70, cores: [], socket: [], chipset: null };
		await monitor.runAllParallel();

		expect(httpLog).toHaveLength(1);
		expect((httpLog[0]?.body as { content: string }).content).toContain(
			"Back to normal",
		);
		expect(store.getActiveIncident("temp:cpu")).toBeNull();
	});
});
