import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Systeminformation } from "systeminformation";
import type {
	Incident,
	IncidentStore,
	Notification,
} from "../../src/lib/incident-store";
import { logger } from "../../src/lib/logger";

// --- Mutable mock state ---

let cpuLoadData = { currentLoad: 50, avgLoad: 2.5 };
let memData = { total: 16 * 1024 ** 3, used: 8 * 1024 ** 3 };
let cpuTempData = { main: null as number | null, max: null as number | null };
let graphicsData = {
	controllers: [] as Partial<Systeminformation.GraphicsControllerData>[],
};

const notifySpy = mock(async (_msg: string) => {});

// --- Module mocks (hoisted by Bun before imports) ---

mock.module("systeminformation", () => ({
	default: {
		currentLoad: async () => cpuLoadData,
		fsSize: async () => [] as Systeminformation.FsSizeData[],
		mem: async () => memData,
		cpuTemperature: async () => cpuTempData,
		graphics: async () => graphicsData,
	},
}));

mock.module("../../src/lib/notifiers", () => ({
	Notifiers: class {
		async alert(msg: string) {
			return notifySpy(msg);
		}
	},
}));

mock.module("../../src/config", () => ({
	config: {
		reminderIntervalMinutes: 30,
		checks: {
			// consecutiveBreaches: 1 so single-call tests keep working
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
	},
}));

import { Monitor } from "../../src/lib/monitor";

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
	openIncident: mock(
		(
			_metric: string,
			_volume: string | null,
			_value: number,
			_threshold: number,
		) => fakeIncident(),
	),
	resolveIncident: mock((_id: number) => {}),
	recordNotification: mock(
		(_id: number, _type: string, _succeeded: boolean) => {},
	),
	getLastNotification: mock((_id: number) => null as Notification | null),
	listIncidents: mock(() => []),
	getIncident: mock(() => null),
};

// --- Setup ---

let monitor: Monitor;

beforeEach(async () => {
	notifySpy.mockClear();
	cpuLoadData = { currentLoad: 50, avgLoad: 2.5 };
	memData = { total: 16 * GB, used: 8 * GB };
	cpuTempData = { main: null, max: null };
	graphicsData = { controllers: [] };

	for (const spy of Object.values(incidentStoreMock)) {
		spy.mockClear();
	}
	// Default: no active incident
	incidentStoreMock.getActiveIncident.mockImplementation(() => null);
	incidentStoreMock.openIncident.mockImplementation(() => fakeIncident());
	incidentStoreMock.getLastNotification.mockImplementation(() => null);

	monitor = new Monitor(incidentStoreMock as unknown as IncidentStore);
	await new Promise<void>((r) => setTimeout(r, 0));
});

// --- checkCpu ---

describe("checkCpu", () => {
	test("returns formatted CPU usage string", async () => {
		cpuLoadData = { currentLoad: 50.4, avgLoad: 2.5 };
		expect(await monitor.checkCpu()).toBe("CPU: 50%");
	});

	test("rounds up fractional CPU usage", async () => {
		cpuLoadData = { currentLoad: 72.6, avgLoad: 2.5 };
		expect(await monitor.checkCpu()).toBe("CPU: 73%");
	});

	test("does not notify when usage is below threshold", async () => {
		cpuLoadData = { currentLoad: 89, avgLoad: 2.5 };
		await monitor.checkCpu();
		expect(notifySpy).not.toHaveBeenCalled();
	});

	test("does not notify when usage equals threshold", async () => {
		cpuLoadData = { currentLoad: 90, avgLoad: 2.5 };
		await monitor.checkCpu();
		expect(notifySpy).not.toHaveBeenCalled();
	});

	test("opens an incident and alerts on first breach", async () => {
		cpuLoadData = { currentLoad: 95, avgLoad: 2.5 };
		await monitor.checkCpu();
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
			sent_at: Date.now() - 1_000, // 1 second ago — within reminder window
			type: "alert" as const,
			succeeded: 1,
		}));
		await monitor.checkCpu();
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
			sent_at: Date.now() - 31 * 60_000, // 31 minutes ago — past the 30-min interval
			type: "alert" as const,
			succeeded: 1,
		}));
		await monitor.checkCpu();
		expect(incidentStoreMock.recordNotification).toHaveBeenCalledWith(
			1,
			"reminder",
			true,
		);
		expect(notifySpy.mock.calls[0]?.[0]).toContain("REMINDER");
	});

	test("resolves incident and sends recovery alert when usage drops", async () => {
		cpuLoadData = { currentLoad: 50, avgLoad: 2.5 };
		incidentStoreMock.getActiveIncident.mockImplementation(() =>
			fakeIncident(),
		);
		await monitor.checkCpu();
		expect(incidentStoreMock.resolveIncident).toHaveBeenCalledWith(1);
		expect(incidentStoreMock.recordNotification).toHaveBeenCalledWith(
			1,
			"recovery",
			true,
		);
		expect(notifySpy.mock.calls[0]?.[0]).toContain("Back to normal");
	});
});

// --- breach counter ---

describe("breach counter (consecutiveBreaches = 3)", () => {
	// Create a fresh monitor with consecutiveBreaches: 3 via config manipulation.
	// Since config is module-mocked, we use a separate monitor instance where
	// we override the checks field after construction.
	test("does not alert before reaching consecutiveBreaches count", async () => {
		// Use a fresh monitor with consecutiveBreaches=3 by temporarily patching checks
		const m = new Monitor(incidentStoreMock as unknown as IncidentStore);
		// Patch the checks to require 3 breaches
		(
			m as unknown as { checks: { cpu: { consecutiveBreaches: number } } }
		).checks.cpu.consecutiveBreaches = 3;
		cpuLoadData = { currentLoad: 95, avgLoad: 2.5 };
		await m.checkCpu();
		await m.checkCpu();
		expect(incidentStoreMock.openIncident).not.toHaveBeenCalled();
		expect(notifySpy).not.toHaveBeenCalled();
	});

	test("alerts on the Nth consecutive breach", async () => {
		const m = new Monitor(incidentStoreMock as unknown as IncidentStore);
		(
			m as unknown as { checks: { cpu: { consecutiveBreaches: number } } }
		).checks.cpu.consecutiveBreaches = 3;
		cpuLoadData = { currentLoad: 95, avgLoad: 2.5 };
		await m.checkCpu();
		await m.checkCpu();
		await m.checkCpu();
		expect(incidentStoreMock.openIncident).toHaveBeenCalledTimes(1);
		expect(notifySpy).toHaveBeenCalledTimes(1);
	});

	test("resets counter when value drops below threshold", async () => {
		const m = new Monitor(incidentStoreMock as unknown as IncidentStore);
		(
			m as unknown as { checks: { cpu: { consecutiveBreaches: number } } }
		).checks.cpu.consecutiveBreaches = 3;
		cpuLoadData = { currentLoad: 95, avgLoad: 2.5 };
		await m.checkCpu();
		cpuLoadData = { currentLoad: 50, avgLoad: 2.5 }; // drops below
		await m.checkCpu();
		cpuLoadData = { currentLoad: 95, avgLoad: 2.5 }; // spikes again
		await m.checkCpu();
		// Only 1 breach since reset — should not alert
		expect(incidentStoreMock.openIncident).not.toHaveBeenCalled();
	});
});

// --- checkLoad ---

describe("checkLoad", () => {
	test("returns formatted load average string", async () => {
		cpuLoadData = { currentLoad: 50, avgLoad: Math.PI };
		expect(await monitor.checkLoad()).toBe("Load: 3.14");
	});

	test("does not notify when load is below threshold", async () => {
		cpuLoadData = { currentLoad: 50, avgLoad: 7.99 };
		await monitor.checkLoad();
		expect(notifySpy).not.toHaveBeenCalled();
	});

	test("opens incident when load exceeds threshold", async () => {
		cpuLoadData = { currentLoad: 50, avgLoad: 9.5 };
		await monitor.checkLoad();
		expect(notifySpy).toHaveBeenCalledTimes(1);
		expect(notifySpy.mock.calls[0]?.[0]).toContain("9.50");
	});
});

// --- checkMemory ---

describe("checkMemory", () => {
	test("returns formatted memory usage string", async () => {
		memData = { total: 16 * GB, used: 8 * GB };
		expect(await monitor.checkMemory()).toBe("Memory: 50%");
	});

	test("does not notify when usage is below threshold", async () => {
		memData = { total: 16 * GB, used: 14 * GB };
		await monitor.checkMemory();
		expect(notifySpy).not.toHaveBeenCalled();
	});

	test("opens incident when usage exceeds threshold", async () => {
		memData = { total: 16 * GB, used: 15 * GB };
		await monitor.checkMemory();
		expect(notifySpy).toHaveBeenCalledTimes(1);
		expect(notifySpy.mock.calls[0]?.[0]).toContain("94%");
	});
});

// --- checkDisk ---

describe("checkDisk", () => {
	test("returns formatted disk usage string", async () => {
		monitor.volumes = [fakeVolume("/", 50)];
		expect(await monitor.checkDisk()).toBe("Disk: 50%");
	});

	test("returns 'No volumes found' when no volumes match config paths", async () => {
		monitor.volumes = [fakeVolume("/dev/sdb", 50)];
		expect(await monitor.checkDisk()).toBe("No volumes found");
	});

	test("does not notify when usage is below threshold", async () => {
		monitor.volumes = [fakeVolume("/", 85)];
		await monitor.checkDisk();
		expect(notifySpy).not.toHaveBeenCalled();
	});

	test("opens incident immediately when disk usage exceeds threshold (no debounce)", async () => {
		monitor.volumes = [fakeVolume("/", 95)];
		await monitor.checkDisk();
		expect(incidentStoreMock.openIncident).toHaveBeenCalledTimes(1);
		expect(notifySpy).toHaveBeenCalledTimes(1);
		expect(notifySpy.mock.calls[0]?.[0]).toContain("95%");
	});

	test("aggregates usage across multiple matched volumes", async () => {
		monitor.volumes = [fakeVolume("/", 40), fakeVolume("/dev/sdb", 80)];
		expect(await monitor.checkDisk()).toBe("Disk: 40%");
		expect(notifySpy).not.toHaveBeenCalled();
	});
});

// --- checkTemperature ---

describe("checkTemperature", () => {
	test("returns undefined when temperature check is disabled", async () => {
		expect(await monitor.checkTemperature()).toBeUndefined();
	});

	test("returns undefined when CPU temp is null even if enabled", async () => {
		(
			monitor as unknown as { checks: { temperature: { enabled: boolean } } }
		).checks.temperature.enabled = true;
		cpuTempData = { main: null, max: null };
		graphicsData = { controllers: [] };
		expect(await monitor.checkTemperature()).toBeUndefined();
	});

	test("returns CPU temp string when reading is available", async () => {
		(
			monitor as unknown as { checks: { temperature: { enabled: boolean } } }
		).checks.temperature.enabled = true;
		cpuTempData = { main: 72, max: 75 };
		const result = await monitor.checkTemperature();
		expect(result).toContain("75°C");
	});

	test("opens incident when CPU temp exceeds threshold", async () => {
		(
			monitor as unknown as {
				checks: {
					temperature: {
						enabled: boolean;
						cpuThresholdCelsius: number;
						gpuThresholdCelsius: number;
						consecutiveBreaches: number;
					};
				};
			}
		).checks.temperature = {
			enabled: true,
			cpuThresholdCelsius: 70,
			gpuThresholdCelsius: 85,
			consecutiveBreaches: 1,
		};
		cpuTempData = { main: 75, max: 78 };
		await monitor.checkTemperature();
		expect(incidentStoreMock.openIncident).toHaveBeenCalledWith(
			"temp:cpu",
			null,
			78,
			70,
		);
		expect(notifySpy).toHaveBeenCalledTimes(1);
	});

	test("opens incident when GPU temp exceeds threshold", async () => {
		(
			monitor as unknown as {
				checks: {
					temperature: {
						enabled: boolean;
						cpuThresholdCelsius: number;
						gpuThresholdCelsius: number;
						consecutiveBreaches: number;
					};
				};
			}
		).checks.temperature = {
			enabled: true,
			cpuThresholdCelsius: 85,
			gpuThresholdCelsius: 70,
			consecutiveBreaches: 1,
		};
		cpuTempData = { main: null, max: null };
		graphicsData = {
			controllers: [{ name: "RTX4090", temperatureGpu: 80 }],
		};
		await monitor.checkTemperature();
		expect(incidentStoreMock.openIncident).toHaveBeenCalledWith(
			"temp:gpu:RTX4090",
			null,
			80,
			70,
		);
	});
});

// --- checkGpu ---

describe("checkGpu", () => {
	test("returns undefined when GPU check is disabled", async () => {
		expect(await monitor.checkGpu()).toBeUndefined();
	});

	test("returns 'GPU: N/A' when no controllers have utilization data", async () => {
		(
			monitor as unknown as { checks: { gpu: { enabled: boolean } } }
		).checks.gpu.enabled = true;
		graphicsData = {
			controllers: [{ name: "RTX4090", utilizationGpu: undefined }],
		};
		expect(await monitor.checkGpu()).toBe("GPU: N/A");
	});

	test("returns usage string when data is available", async () => {
		(
			monitor as unknown as { checks: { gpu: { enabled: boolean } } }
		).checks.gpu.enabled = true;
		graphicsData = { controllers: [{ name: "RTX4090", utilizationGpu: 45 }] };
		const result = await monitor.checkGpu();
		expect(result).toContain("RTX4090");
		expect(result).toContain("45%");
	});

	test("opens incident when GPU usage exceeds threshold", async () => {
		(
			monitor as unknown as {
				checks: {
					gpu: {
						enabled: boolean;
						vramThresholdPercent: number;
						consecutiveBreaches: number;
					};
				};
			}
		).checks.gpu = {
			enabled: true,
			vramThresholdPercent: 80,
			consecutiveBreaches: 1,
		};
		graphicsData = { controllers: [{ name: "RTX4090", utilizationGpu: 95 }] };
		await monitor.checkGpu();
		expect(incidentStoreMock.openIncident).toHaveBeenCalledWith(
			"gpu:RTX4090",
			null,
			95,
			80,
		);
	});
});

// --- runAllParallel ---

describe("runAllParallel", () => {
	test("logs a combined status line containing all enabled check results", async () => {
		monitor.volumes = [fakeVolume("/", 50)];
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
		monitor.volumes = [fakeVolume("/", 50)];
		const loggerSpy = spyOn(logger, "info").mockImplementation(
			() => logger as never,
		);
		await monitor.runAllParallel();
		const statusLine = loggerSpy.mock.calls
			.map((args) => String(args[0]))
			.find((line) => line.includes("CPU:"));
		// Temperature and GPU are disabled in mock config
		expect(statusLine).not.toContain("Temp:");
		expect(statusLine).not.toContain("GPU:");
		loggerSpy.mockRestore();
	});
});
