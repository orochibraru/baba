import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Systeminformation } from "systeminformation";

// --- Mutable mock state (closures keep references, so tests can reassign) ---

let cpuLoadData = { currentLoad: 50, avgLoad: 2.5 };
let memData = { total: 16 * 1024 ** 3, used: 8 * 1024 ** 3 };

const notifySpy = mock(async (_msg: string) => {});

// --- Module mocks (hoisted by Bun before imports) ---

mock.module("systeminformation", () => ({
	default: {
		currentLoad: async () => cpuLoadData,
		fsSize: async () => [] as Systeminformation.FsSizeData[],
		mem: async () => memData,
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
		checks: {
			cpu: {
				enabled: true,
				usageThresholdPercent: 90,
				tempThresholdCelsius: 85,
			},
			load: { enabled: true, threshold: 8.0 },
			memory: { enabled: true, usageThresholdPercent: 90 },
			disk: { enabled: true, usageThresholdPercent: 90, volumes: ["/"] },
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

// --- Setup ---

let monitor: Monitor;

beforeEach(async () => {
	notifySpy.mockClear();
	cpuLoadData = { currentLoad: 50, avgLoad: 2.5 };
	memData = { total: 16 * GB, used: 8 * GB };
	monitor = new Monitor();
	// Let lazyInit (which calls si.fsSize) complete before tests mutate volumes
	await new Promise<void>((r) => setTimeout(r, 0));
});

// --- checkCpu ---

describe("checkCpu", () => {
	test("returns formatted CPU usage string", async () => {
		cpuLoadData = { currentLoad: 50.4, avgLoad: 2.5 };
		const result = await monitor.checkCpu();
		expect(result).toBe("CPU: 50%");
	});

	test("rounds up fractional CPU usage", async () => {
		cpuLoadData = { currentLoad: 72.6, avgLoad: 2.5 };
		const result = await monitor.checkCpu();
		expect(result).toBe("CPU: 73%");
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

	test("notifies when usage exceeds threshold", async () => {
		cpuLoadData = { currentLoad: 95, avgLoad: 2.5 };
		await monitor.checkCpu();
		expect(notifySpy).toHaveBeenCalledTimes(1);
		expect(notifySpy.mock.calls[0]?.[0]).toContain("95%");
	});
});

// --- checkLoad ---

describe("checkLoad", () => {
	test("returns formatted load average string", async () => {
		cpuLoadData = { currentLoad: 50, avgLoad: Math.PI };
		const result = await monitor.checkLoad();
		expect(result).toBe("Load: 3.14");
	});

	test("does not notify when load is below threshold", async () => {
		cpuLoadData = { currentLoad: 50, avgLoad: 7.99 };
		await monitor.checkLoad();
		expect(notifySpy).not.toHaveBeenCalled();
	});

	test("notifies when load exceeds threshold", async () => {
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
		const result = await monitor.checkMemory();
		expect(result).toBe("Memory: 50%");
	});

	test("does not notify when usage is below threshold", async () => {
		memData = { total: 16 * GB, used: 14 * GB }; // 87.5%
		await monitor.checkMemory();
		expect(notifySpy).not.toHaveBeenCalled();
	});

	test("notifies when usage exceeds threshold", async () => {
		memData = { total: 16 * GB, used: 15 * GB }; // 93.75%
		await monitor.checkMemory();
		expect(notifySpy).toHaveBeenCalledTimes(1);
		expect(notifySpy.mock.calls[0]?.[0]).toContain("94%");
	});
});

// --- checkDisk ---

describe("checkDisk", () => {
	test("returns formatted disk usage string", async () => {
		monitor.volumes = [fakeVolume("/", 50)];
		const result = await monitor.checkDisk();
		expect(result).toBe("Disk: 50%");
	});

	test("returns 'No volumes found' when no volumes match config paths", async () => {
		monitor.volumes = [fakeVolume("/dev/sdb", 50)]; // fs not in config volumes ["/"]
		const result = await monitor.checkDisk();
		expect(result).toBe("No volumes found");
	});

	test("does not notify when usage is below threshold", async () => {
		monitor.volumes = [fakeVolume("/", 85)];
		await monitor.checkDisk();
		expect(notifySpy).not.toHaveBeenCalled();
	});

	test("notifies when usage exceeds threshold", async () => {
		monitor.volumes = [fakeVolume("/", 95)];
		await monitor.checkDisk();
		expect(notifySpy).toHaveBeenCalledTimes(1);
		expect(notifySpy.mock.calls[0]?.[0]).toContain("95%");
	});

	test("aggregates usage across multiple matched volumes", async () => {
		// Only "/" is in config volumes; "/dev/sdb" is not and should be ignored
		monitor.volumes = [fakeVolume("/", 40), fakeVolume("/dev/sdb", 80)];
		const result = await monitor.checkDisk();
		expect(result).toBe("Disk: 40%");
		expect(notifySpy).not.toHaveBeenCalled();
	});
});

// --- runAllParallel ---

describe("runAllParallel", () => {
	test("logs a combined status line containing all check results", async () => {
		monitor.volumes = [fakeVolume("/", 50)];
		const consoleSpy = spyOn(console, "log").mockImplementation(() => {});
		await monitor.runAllParallel();
		const statusLine = consoleSpy.mock.calls
			.map((args) => String(args[0]))
			.find((line) => line.includes("CPU:"));
		expect(statusLine).toBeDefined();
		expect(statusLine).toContain("Load:");
		expect(statusLine).toContain("Memory:");
		expect(statusLine).toContain("Disk:");
		consoleSpy.mockRestore();
	});
});
