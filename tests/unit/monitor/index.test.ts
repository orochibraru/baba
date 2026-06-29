import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Systeminformation } from "systeminformation";
import type {
	Incident,
	Notification,
	OpenIncidentOpts,
	RecordNotificationOpts,
} from "../../../src/lib/incident-store";

const GB = 1024 ** 3;

let cpuLoadData = { currentLoad: 50, avgLoad: 2.5 };
let memData = { total: 16 * GB, used: 8 * GB };
let diskData: Systeminformation.FsSizeData[] = [];
let cpuTempData = {
	main: null as number | null,
	max: null as number | null,
	cores: [] as number[],
	socket: [] as number[],
	chipset: null as number | null,
};
let graphicsData = {
	controllers: [] as Partial<Systeminformation.GraphicsControllerData>[],
};

const notifySpy = mock(async (_msg: string) => {});

mock.module("systeminformation", () => ({
	default: {
		currentLoad: async () => cpuLoadData,
		fsSize: async () => diskData,
		mem: async () => memData,
		cpuTemperature: async () => cpuTempData,
		graphics: async () => graphicsData,
	},
}));

const unitCfg = {
	machineName: "test-host",
	reminderIntervalMinutes: 30,
	database: { path: ":memory:" },
	notifiers: [],
	checks: {
		cpu: { enabled: true, usageThresholdPercent: 90, consecutiveBreaches: 1 },
		load: { enabled: true, threshold: 8.0, consecutiveBreaches: 1 },
		memory: {
			enabled: true,
			usageThresholdPercent: 90,
			consecutiveBreaches: 1,
		},
		disk: { enabled: true, usageThresholdPercent: 90, volumes: ["/"] },
		temperature: {
			enabled: false,
			cpuThresholdCelsius: 85,
			gpuThresholdCelsius: 85,
			consecutiveBreaches: 2,
		},
		gpu: { enabled: false, vramThresholdPercent: 90, consecutiveBreaches: 3 },
	},
};

mock.module("../../../src/config", () => ({
	config: unitCfg,
	getConfig: () => unitCfg,
}));

import { initDb } from "../../../src/lib/db";
import { logger } from "../../../src/lib/logger";
import { Monitor } from "../../../src/lib/monitor/index";

function fakeIncident(overrides: Partial<Incident> = {}): Incident {
	return {
		id: 1,
		metric: "cpu",
		volume: null,
		started_at: Date.now() - 60_000,
		resolved_at: null,
		peak_value: 95,
		threshold: 90,
		...overrides,
	};
}

const incidentStoreMock = {
	getActiveIncident: mock(
		(_metric: string, _volume?: string | null) => null as Incident | null,
	),
	openIncident: mock((_opts: OpenIncidentOpts) => fakeIncident()),
	resolveIncident: mock((_id: number) => {}),
	recordNotification: mock((_opts: RecordNotificationOpts) => {}),
	getLastNotification: mock((_id: number) => null as Notification | null),
	listIncidents: mock((_limit?: number) => []),
	getIncident: mock((_id: number) => null),
};

let monitor: Monitor;

beforeEach(async () => {
	cpuLoadData = { currentLoad: 50, avgLoad: 2.5 };
	memData = { total: 16 * GB, used: 8 * GB };
	diskData = [];
	cpuTempData = { main: null, max: null, cores: [], socket: [], chipset: null };
	graphicsData = { controllers: [] };
	notifySpy.mockClear();
	for (const spy of Object.values(incidentStoreMock)) spy.mockClear();
	incidentStoreMock.getActiveIncident.mockImplementation(() => null);
	incidentStoreMock.openIncident.mockImplementation(() => fakeIncident());
	incidentStoreMock.getLastNotification.mockImplementation(() => null);
	initDb();
	monitor = new Monitor();
});

describe("Monitor.runAllParallel", () => {
	test("logs a combined status line containing all enabled check results", async () => {
		diskData = [
			{
				fs: "/",
				used: 50 * GB,
				size: 100 * GB,
			} as unknown as Systeminformation.FsSizeData,
		];
		const loggerSpy = spyOn(logger, "info").mockImplementation(
			() => logger as never,
		);
		await monitor.runAllParallel();
		const statusLine = loggerSpy.mock.calls
			.map((args) => String(args[0]))
			.find((line) => line.includes("CPU:"));
		expect(statusLine).toBeDefined();
		expect(statusLine).toContain("Load:");
		expect(statusLine).toContain("Memory:");
		expect(statusLine).toContain("Disk:");
		loggerSpy.mockRestore();
	});

	test("omits disabled checks from the status line", async () => {
		diskData = [
			{
				fs: "/",
				used: 50 * GB,
				size: 100 * GB,
			} as unknown as Systeminformation.FsSizeData,
		];
		const loggerSpy = spyOn(logger, "info").mockImplementation(
			() => logger as never,
		);
		await monitor.runAllParallel();
		const statusLine = loggerSpy.mock.calls
			.map((args) => String(args[0]))
			.find((line) => line.includes("CPU:"));
		expect(statusLine).toContain("Temp: N/A");
		expect(statusLine).not.toContain("GPU:");
		loggerSpy.mockRestore();
	});
});
