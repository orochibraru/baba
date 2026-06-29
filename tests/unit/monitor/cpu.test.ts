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
import { CpuCheck } from "../../../src/lib/monitor/checks/cpu";

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

describe("CpuCheck", () => {
	test("returns formatted CPU usage string", async () => {
		cpuLoadData = { currentLoad: 50.4, avgLoad: 2.5 };
		const check = new CpuCheck(
			{ enabled: true, usageThresholdPercent: 90, consecutiveBreaches: 1 },
			makeDeps(),
		);
		expect(await check.run()).toBe("CPU: 50%");
	});

	test("rounds up fractional CPU usage", async () => {
		cpuLoadData = { currentLoad: 72.6, avgLoad: 2.5 };
		const check = new CpuCheck(
			{ enabled: true, usageThresholdPercent: 90, consecutiveBreaches: 1 },
			makeDeps(),
		);
		expect(await check.run()).toBe("CPU: 73%");
	});

	test("returns undefined when disabled", async () => {
		const check = new CpuCheck(
			{ enabled: false, usageThresholdPercent: 90, consecutiveBreaches: 1 },
			makeDeps(),
		);
		expect(await check.run()).toBeUndefined();
	});

	test("does not notify when usage is below threshold", async () => {
		cpuLoadData = { currentLoad: 89, avgLoad: 2.5 };
		const check = new CpuCheck(
			{ enabled: true, usageThresholdPercent: 90, consecutiveBreaches: 1 },
			makeDeps(),
		);
		await check.run();
		expect(notifySpy).not.toHaveBeenCalled();
	});

	test("does not notify when usage equals threshold", async () => {
		cpuLoadData = { currentLoad: 90, avgLoad: 2.5 };
		const check = new CpuCheck(
			{ enabled: true, usageThresholdPercent: 90, consecutiveBreaches: 1 },
			makeDeps(),
		);
		await check.run();
		expect(notifySpy).not.toHaveBeenCalled();
	});

	test("opens an incident and alerts on first breach", async () => {
		cpuLoadData = { currentLoad: 95, avgLoad: 2.5 };
		const check = new CpuCheck(
			{ enabled: true, usageThresholdPercent: 90, consecutiveBreaches: 1 },
			makeDeps(),
		);
		await check.run();
		expect(incidentStoreMock.openIncident).toHaveBeenCalledTimes(1);
		expect(notifySpy).toHaveBeenCalledTimes(1);
		expect(notifySpy.mock.calls[0]?.[0]).toContain("95%");
	});

	test("does not re-open incident when one is already active", async () => {
		cpuLoadData = { currentLoad: 95, avgLoad: 2.5 };
		incidentStoreMock.getActiveIncident.mockImplementation(() =>
			fakeIncident(),
		);
		incidentStoreMock.getLastNotification.mockImplementation(() => ({
			id: 1,
			incident_id: 1,
			sent_at: Date.now() - 1_000,
			type: "alert" as const,
			succeeded: 1,
		}));
		const check = new CpuCheck(
			{ enabled: true, usageThresholdPercent: 90, consecutiveBreaches: 1 },
			makeDeps(),
		);
		await check.run();
		expect(incidentStoreMock.openIncident).not.toHaveBeenCalled();
		expect(notifySpy).not.toHaveBeenCalled();
	});

	test("sends reminder when reminder interval has elapsed", async () => {
		cpuLoadData = { currentLoad: 95, avgLoad: 2.5 };
		incidentStoreMock.getActiveIncident.mockImplementation(() =>
			fakeIncident(),
		);
		incidentStoreMock.getLastNotification.mockImplementation(() => ({
			id: 1,
			incident_id: 1,
			sent_at: Date.now() - 31 * 60_000,
			type: "alert" as const,
			succeeded: 1,
		}));
		const check = new CpuCheck(
			{ enabled: true, usageThresholdPercent: 90, consecutiveBreaches: 1 },
			makeDeps(),
		);
		await check.run();
		expect(incidentStoreMock.recordNotification).toHaveBeenCalledWith({
			incidentId: 1,
			type: "reminder",
			succeeded: true,
		});
		expect(notifySpy.mock.calls[0]?.[0]).toContain("REMINDER");
	});

	test("resolves incident and sends recovery alert when usage drops", async () => {
		cpuLoadData = { currentLoad: 50, avgLoad: 2.5 };
		incidentStoreMock.getActiveIncident.mockImplementation(() =>
			fakeIncident(),
		);
		const check = new CpuCheck(
			{ enabled: true, usageThresholdPercent: 90, consecutiveBreaches: 1 },
			makeDeps(),
		);
		await check.run();
		expect(incidentStoreMock.resolveIncident).toHaveBeenCalledWith(1);
		expect(incidentStoreMock.recordNotification).toHaveBeenCalledWith({
			incidentId: 1,
			type: "recovery",
			succeeded: true,
		});
		expect(notifySpy.mock.calls[0]?.[0]).toContain("Back to normal");
	});
});

describe("breach counter (consecutiveBreaches = 3)", () => {
	test("does not alert before reaching consecutiveBreaches count", async () => {
		cpuLoadData = { currentLoad: 95, avgLoad: 2.5 };
		const check = new CpuCheck(
			{ enabled: true, usageThresholdPercent: 90, consecutiveBreaches: 3 },
			makeDeps(),
		);
		await check.run();
		await check.run();
		expect(incidentStoreMock.openIncident).not.toHaveBeenCalled();
		expect(notifySpy).not.toHaveBeenCalled();
	});

	test("alerts on the Nth consecutive breach", async () => {
		cpuLoadData = { currentLoad: 95, avgLoad: 2.5 };
		const check = new CpuCheck(
			{ enabled: true, usageThresholdPercent: 90, consecutiveBreaches: 3 },
			makeDeps(),
		);
		await check.run();
		await check.run();
		await check.run();
		expect(incidentStoreMock.openIncident).toHaveBeenCalledTimes(1);
		expect(notifySpy).toHaveBeenCalledTimes(1);
	});

	test("resets counter when value drops below threshold", async () => {
		cpuLoadData = { currentLoad: 95, avgLoad: 2.5 };
		const check = new CpuCheck(
			{ enabled: true, usageThresholdPercent: 90, consecutiveBreaches: 3 },
			makeDeps(),
		);
		await check.run();
		cpuLoadData = { currentLoad: 50, avgLoad: 2.5 };
		await check.run();
		cpuLoadData = { currentLoad: 95, avgLoad: 2.5 };
		await check.run();
		expect(incidentStoreMock.openIncident).not.toHaveBeenCalled();
	});
});
