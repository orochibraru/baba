import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Systeminformation } from "systeminformation";
import type {
	Incident,
	IncidentStore,
	Notification,
	OpenIncidentOpts,
	RecordNotificationOpts,
} from "../../src/lib/incident-store";
import { logger } from "../../src/lib/logger";

// --- Mutable mock state ---

let cpuLoadData = { currentLoad: 50, avgLoad: 2.5 };
let memData = { total: 16 * 1024 ** 3, used: 8 * 1024 ** 3 };
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

// --- Module mocks (hoisted by Bun before imports) ---

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

mock.module("../../src/config", () => ({
	config: unitCfg,
	getConfig: () => unitCfg,
}));

import { initDb } from "../../src/lib/db";
import type { CheckDeps } from "../../src/lib/monitor/base-check";
import { CpuCheck } from "../../src/lib/monitor/checks/cpu";
import { DiskCheck } from "../../src/lib/monitor/checks/disk";
import { GpuCheck } from "../../src/lib/monitor/checks/gpu";
import { LoadCheck } from "../../src/lib/monitor/checks/load";
import { MemoryCheck } from "../../src/lib/monitor/checks/memory";
import { TemperatureCheck } from "../../src/lib/monitor/checks/temperature";
import { Monitor } from "../../src/lib/monitor/index";

// --- Helpers ---

const GB = 1024 ** 3;

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
		metric: "cpu",
		volume: null,
		started_at: Date.now() - 60_000,
		resolved_at: null,
		peak_value: 95,
		threshold: 90,
		...overrides,
	};
}

// --- IncidentStore mock ---

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

// --- Shared deps factory ---

function makeDeps(overrides?: Partial<CheckDeps>): CheckDeps {
	return {
		incidentStore: incidentStoreMock as unknown as IncidentStore,
		notifiers: { alert: notifySpy },
		reminderIntervalMs: 30 * 60_000,
		breachCounter: new Map(),
		...overrides,
	};
}

// --- Setup ---

let monitor: Monitor;

beforeEach(async () => {
	notifySpy.mockClear();
	cpuLoadData = { currentLoad: 50, avgLoad: 2.5 };
	memData = { total: 16 * GB, used: 8 * GB };
	diskData = [];
	cpuTempData = { main: null, max: null, cores: [], socket: [], chipset: null };
	graphicsData = { controllers: [] };

	for (const spy of Object.values(incidentStoreMock)) {
		spy.mockClear();
	}
	incidentStoreMock.getActiveIncident.mockImplementation(() => null);
	incidentStoreMock.openIncident.mockImplementation(() => fakeIncident());
	incidentStoreMock.getLastNotification.mockImplementation(() => null);

	initDb();
	monitor = new Monitor();
});

// --- CpuCheck ---

describe("checkCpu", () => {
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

	test("sends reminder when incident is active and reminder interval has elapsed", async () => {
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

// --- breach counter ---

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

// --- LoadCheck ---

describe("checkLoad", () => {
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

// --- MemoryCheck ---

describe("checkMemory", () => {
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

// --- DiskCheck ---

describe("checkDisk", () => {
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

// --- TemperatureCheck ---

describe("checkTemperature", () => {
	test("returns 'Temp: N/A' when no readings available (disabled check, macOS)", async () => {
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
		cpuTempData = {
			main: null,
			max: null,
			cores: [],
			socket: [],
			chipset: null,
		};
		graphicsData = { controllers: [] };
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

// --- GpuCheck ---

describe("checkGpu", () => {
	test("returns undefined when GPU check is disabled", async () => {
		const check = new GpuCheck(
			{ enabled: false, vramThresholdPercent: 90, consecutiveBreaches: 3 },
			makeDeps(),
		);
		expect(await check.run()).toBeUndefined();
	});

	test("returns 'GPU: N/A' when no controllers have utilization data", async () => {
		graphicsData = {
			controllers: [{ name: "RTX4090", utilizationGpu: undefined }],
		};
		const check = new GpuCheck(
			{ enabled: true, vramThresholdPercent: 90, consecutiveBreaches: 3 },
			makeDeps(),
		);
		expect(await check.run()).toBe("GPU: N/A");
	});

	test("returns usage string when data is available", async () => {
		graphicsData = { controllers: [{ name: "RTX4090", utilizationGpu: 45 }] };
		const check = new GpuCheck(
			{ enabled: true, vramThresholdPercent: 90, consecutiveBreaches: 3 },
			makeDeps(),
		);
		const result = await check.run();
		expect(result).toContain("RTX4090");
		expect(result).toContain("45%");
	});

	test("opens incident when GPU usage exceeds threshold", async () => {
		graphicsData = { controllers: [{ name: "RTX4090", utilizationGpu: 95 }] };
		const check = new GpuCheck(
			{ enabled: true, vramThresholdPercent: 80, consecutiveBreaches: 1 },
			makeDeps(),
		);
		await check.run();
		expect(incidentStoreMock.openIncident).toHaveBeenCalledWith({
			metric: "gpu:RTX4090",
			volume: null,
			value: 95,
			threshold: 80,
		});
	});
});

// --- runAllParallel ---

describe("runAllParallel", () => {
	test("logs a combined status line containing all enabled check results", async () => {
		diskData = [fakeVolume("/", 50)];
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
		diskData = [fakeVolume("/", 50)];
		const loggerSpy = spyOn(logger, "info").mockImplementation(
			() => logger as never,
		);
		await monitor.runAllParallel();
		const statusLine = loggerSpy.mock.calls
			.map((args) => String(args[0]))
			.find((line) => line.includes("CPU:"));
		// Temperature always logged (N/A when no readings); GPU disabled → absent
		expect(statusLine).toContain("Temp: N/A");
		expect(statusLine).not.toContain("GPU:");
		loggerSpy.mockRestore();
	});
});
