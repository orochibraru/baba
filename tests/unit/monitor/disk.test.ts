import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Systeminformation } from "systeminformation";
import type {
	Incident,
	IncidentStore,
	Notification,
	OpenIncidentOpts,
	RecordNotificationOpts,
} from "../../../src/lib/incident-store";

const GB = 1024 ** 3;
let diskData: Systeminformation.FsSizeData[] = [];

const notifySpy = mock(async (_msg: string) => {});

mock.module("systeminformation", () => ({
	default: {
		currentLoad: async () => ({ currentLoad: 50, avgLoad: 2.5 }),
		fsSize: async () => diskData,
		mem: async () => ({ total: 16 * GB, used: 8 * GB }),
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
import { DiskCheck } from "../../../src/lib/monitor/checks/disk";

function fakeVolume(
	fs: string,
	usedPercent: number,
): Systeminformation.FsSizeData {
	const size = 100 * GB;
	const used = (usedPercent / 100) * size;
	return { fs, used, size } as unknown as Systeminformation.FsSizeData;
}

function fakeIncident(overrides: Partial<Incident> = {}): Incident {
	return {
		id: 1,
		metric: "disk",
		volume: "/",
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
	diskData = [];
	notifySpy.mockClear();
	for (const spy of Object.values(incidentStoreMock)) spy.mockClear();
	incidentStoreMock.getActiveIncident.mockImplementation(() => null);
	incidentStoreMock.openIncident.mockImplementation(() => fakeIncident());
	incidentStoreMock.getLastNotification.mockImplementation(() => null);
});

describe("DiskCheck", () => {
	test("returns formatted disk usage string", async () => {
		diskData = [fakeVolume("/", 50)];
		const check = new DiskCheck(
			{ enabled: true, usageThresholdPercent: 90, volumes: ["/"] },
			makeDeps(),
		);
		expect(await check.run()).toBe("Disk: 50%");
	});

	test("returns 'No volumes found' when no volumes match config paths", async () => {
		diskData = [fakeVolume("/dev/sdb", 50)];
		const check = new DiskCheck(
			{ enabled: true, usageThresholdPercent: 90, volumes: ["/"] },
			makeDeps(),
		);
		expect(await check.run()).toBe("No volumes found");
	});

	test("does not notify when usage is below threshold", async () => {
		diskData = [fakeVolume("/", 85)];
		const check = new DiskCheck(
			{ enabled: true, usageThresholdPercent: 90, volumes: ["/"] },
			makeDeps(),
		);
		await check.run();
		expect(notifySpy).not.toHaveBeenCalled();
	});

	test("opens incident immediately when disk usage exceeds threshold (no debounce)", async () => {
		diskData = [fakeVolume("/", 95)];
		const check = new DiskCheck(
			{ enabled: true, usageThresholdPercent: 90, volumes: ["/"] },
			makeDeps(),
		);
		await check.run();
		expect(incidentStoreMock.openIncident).toHaveBeenCalledTimes(1);
		expect(notifySpy).toHaveBeenCalledTimes(1);
		expect(notifySpy.mock.calls[0]?.[0]).toContain("95%");
	});

	test("only counts volumes matching configured paths", async () => {
		diskData = [fakeVolume("/", 40), fakeVolume("/dev/sdb", 80)];
		const check = new DiskCheck(
			{ enabled: true, usageThresholdPercent: 90, volumes: ["/"] },
			makeDeps(),
		);
		expect(await check.run()).toBe("Disk: 40%");
		expect(notifySpy).not.toHaveBeenCalled();
	});
});
