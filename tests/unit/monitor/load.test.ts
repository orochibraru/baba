import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
	Incident,
	IncidentStore,
	Notification,
	OpenIncidentOpts,
	RecordNotificationOpts,
} from "../../../src/lib/incident-store";

let cpuLoadData = { currentLoad: 50, avgLoad: 2.5 };

const notifySpy = mock(async (_msg: string) => {});

mock.module("systeminformation", () => ({
	default: {
		currentLoad: async () => cpuLoadData,
		fsSize: async () => [],
		mem: async () => ({ total: 16 * 1024 ** 3, used: 8 * 1024 ** 3 }),
		cpuTemperature: async () => ({
			main: null,
			max: null,
			cores: [],
			socket: [],
			chipset: null,
		}),
		graphics: async () => ({ controllers: [] }),
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
import { LoadCheck } from "../../../src/lib/monitor/checks/load";

function fakeIncident(overrides: Partial<Incident> = {}): Incident {
	return {
		id: 1,
		metric: "load",
		volume: null,
		started_at: Date.now() - 60_000,
		resolved_at: null,
		peak_value: 9.5,
		threshold: 8.0,
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
	cpuLoadData = { currentLoad: 50, avgLoad: 2.5 };
	notifySpy.mockClear();
	for (const spy of Object.values(incidentStoreMock)) spy.mockClear();
	incidentStoreMock.getActiveIncident.mockImplementation(() => null);
	incidentStoreMock.openIncident.mockImplementation(() => fakeIncident());
	incidentStoreMock.getLastNotification.mockImplementation(() => null);
});

describe("LoadCheck", () => {
	test("returns formatted load average string", async () => {
		cpuLoadData = { currentLoad: 50, avgLoad: Math.PI };
		const check = new LoadCheck(
			{ enabled: true, threshold: 8.0, consecutiveBreaches: 1 },
			makeDeps(),
		);
		expect(await check.run()).toBe("Load: 3.14");
	});

	test("does not notify when load is below threshold", async () => {
		cpuLoadData = { currentLoad: 50, avgLoad: 7.99 };
		const check = new LoadCheck(
			{ enabled: true, threshold: 8.0, consecutiveBreaches: 1 },
			makeDeps(),
		);
		await check.run();
		expect(notifySpy).not.toHaveBeenCalled();
	});

	test("opens incident when load exceeds threshold", async () => {
		cpuLoadData = { currentLoad: 50, avgLoad: 9.5 };
		const check = new LoadCheck(
			{ enabled: true, threshold: 8.0, consecutiveBreaches: 1 },
			makeDeps(),
		);
		await check.run();
		expect(notifySpy).toHaveBeenCalledTimes(1);
		expect(notifySpy.mock.calls[0]?.[0]).toContain("9.50");
	});
});
