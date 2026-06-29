import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Systeminformation } from "systeminformation";
import type {
	Incident,
	IncidentStore,
	Notification,
	OpenIncidentOpts,
	RecordNotificationOpts,
} from "../../../src/lib/incident-store";

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
		currentLoad: async () => ({ currentLoad: 50, avgLoad: 2.5 }),
		fsSize: async () => [],
		mem: async () => ({ total: 16 * 1024 ** 3, used: 8 * 1024 ** 3 }),
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

import type { CheckDeps } from "../../../src/lib/monitor/base-check";
import { TemperatureCheck } from "../../../src/lib/monitor/checks/temperature";

function fakeIncident(overrides: Partial<Incident> = {}): Incident {
	return {
		id: 1,
		metric: "temp:cpu",
		volume: null,
		started_at: Date.now() - 60_000,
		resolved_at: null,
		peak_value: 78,
		threshold: 70,
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

function makeDeps(overrides?: Partial<CheckDeps>): CheckDeps {
	return {
		incidentStore: incidentStoreMock as unknown as IncidentStore,
		notifiers: { alert: notifySpy },
		reminderIntervalMs: 30 * 60_000,
		breachCounter: new Map(),
		...overrides,
	};
}

beforeEach(() => {
	cpuTempData = { main: null, max: null, cores: [], socket: [], chipset: null };
	graphicsData = { controllers: [] };
	notifySpy.mockClear();
	for (const spy of Object.values(incidentStoreMock)) spy.mockClear();
	incidentStoreMock.getActiveIncident.mockImplementation(() => null);
	incidentStoreMock.openIncident.mockImplementation(() => fakeIncident());
	incidentStoreMock.getLastNotification.mockImplementation(() => null);
});

describe("TemperatureCheck", () => {
	test("returns 'Temp: N/A' when disabled (no readings available)", async () => {
		const check = new TemperatureCheck(
			{
				enabled: false,
				cpuThresholdCelsius: 85,
				gpuThresholdCelsius: 85,
				consecutiveBreaches: 1,
			},
			makeDeps(),
		);
		expect(await check.run()).toBe("Temp: N/A");
	});

	test("returns 'Temp: N/A' when enabled but no readings available", async () => {
		const check = new TemperatureCheck(
			{
				enabled: true,
				cpuThresholdCelsius: 85,
				gpuThresholdCelsius: 85,
				consecutiveBreaches: 1,
			},
			makeDeps(),
		);
		expect(await check.run()).toBe("Temp: N/A");
	});

	test("returns CPU temp string when reading is available", async () => {
		cpuTempData = { main: 72, max: 75, cores: [], socket: [], chipset: null };
		const check = new TemperatureCheck(
			{
				enabled: true,
				cpuThresholdCelsius: 85,
				gpuThresholdCelsius: 85,
				consecutiveBreaches: 1,
			},
			makeDeps(),
		);
		expect(await check.run()).toContain("75°C");
	});

	test("opens incident when CPU temp exceeds threshold", async () => {
		cpuTempData = { main: 75, max: 78, cores: [], socket: [], chipset: null };
		const check = new TemperatureCheck(
			{
				enabled: true,
				cpuThresholdCelsius: 70,
				gpuThresholdCelsius: 85,
				consecutiveBreaches: 1,
			},
			makeDeps(),
		);
		await check.run();
		expect(incidentStoreMock.openIncident).toHaveBeenCalledWith({
			metric: "temp:cpu",
			volume: null,
			value: 78,
			threshold: 70,
		});
		expect(notifySpy).toHaveBeenCalledTimes(1);
	});

	test("opens incident when GPU temp exceeds threshold", async () => {
		cpuTempData = {
			main: null,
			max: null,
			cores: [],
			socket: [],
			chipset: null,
		};
		graphicsData = { controllers: [{ name: "RTX4090", temperatureGpu: 80 }] };
		const check = new TemperatureCheck(
			{
				enabled: true,
				cpuThresholdCelsius: 85,
				gpuThresholdCelsius: 70,
				consecutiveBreaches: 1,
			},
			makeDeps(),
		);
		await check.run();
		expect(incidentStoreMock.openIncident).toHaveBeenCalledWith({
			metric: "temp:gpu:RTX4090",
			volume: null,
			value: 80,
			threshold: 70,
		});
	});
});
