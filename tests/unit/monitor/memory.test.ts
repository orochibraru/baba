import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
	Incident,
	IncidentStore,
	Notification,
	OpenIncidentOpts,
	RecordNotificationOpts,
} from "../../../src/lib/incident-store";

const GB = 1024 ** 3;
let memData = { total: 16 * GB, used: 8 * GB };

const notifySpy = mock(async (_msg: string) => {});

mock.module("systeminformation", () => ({
	default: {
		currentLoad: async () => ({ currentLoad: 50, avgLoad: 2.5 }),
		fsSize: async () => [],
		mem: async () => memData,
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
import { MemoryCheck } from "../../../src/lib/monitor/checks/memory";

function fakeIncident(overrides: Partial<Incident> = {}): Incident {
	return {
		id: 1,
		metric: "memory",
		volume: null,
		started_at: Date.now() - 60_000,
		resolved_at: null,
		peak_value: 94,
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
	memData = { total: 16 * GB, used: 8 * GB };
	notifySpy.mockClear();
	for (const spy of Object.values(incidentStoreMock)) spy.mockClear();
	incidentStoreMock.getActiveIncident.mockImplementation(() => null);
	incidentStoreMock.openIncident.mockImplementation(() => fakeIncident());
	incidentStoreMock.getLastNotification.mockImplementation(() => null);
});

describe("MemoryCheck", () => {
	test("returns formatted memory usage string", async () => {
		memData = { total: 16 * GB, used: 8 * GB };
		const check = new MemoryCheck(
			{ enabled: true, usageThresholdPercent: 90, consecutiveBreaches: 1 },
			makeDeps(),
		);
		expect(await check.run()).toBe("Memory: 50%");
	});

	test("does not notify when usage is below threshold", async () => {
		memData = { total: 16 * GB, used: 14 * GB };
		const check = new MemoryCheck(
			{ enabled: true, usageThresholdPercent: 90, consecutiveBreaches: 1 },
			makeDeps(),
		);
		await check.run();
		expect(notifySpy).not.toHaveBeenCalled();
	});

	test("opens incident when usage exceeds threshold", async () => {
		memData = { total: 16 * GB, used: 15 * GB };
		const check = new MemoryCheck(
			{ enabled: true, usageThresholdPercent: 90, consecutiveBreaches: 1 },
			makeDeps(),
		);
		await check.run();
		expect(notifySpy).toHaveBeenCalledTimes(1);
		expect(notifySpy.mock.calls[0]?.[0]).toContain("94%");
	});
});
