import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Systeminformation } from "systeminformation";
import type {
	Incident,
	IncidentStore,
	Notification,
	OpenIncidentOpts,
	RecordNotificationOpts,
} from "../../../src/lib/incident-store";

let graphicsData = {
	controllers: [] as Partial<Systeminformation.GraphicsControllerData>[],
};

const notifySpy = mock(async (_msg: string) => {});

mock.module("systeminformation", () => ({
	default: {
		currentLoad: async () => ({ currentLoad: 50, avgLoad: 2.5 }),
		fsSize: async () => [],
		mem: async () => ({ total: 16 * 1024 ** 3, used: 8 * 1024 ** 3 }),
		cpuTemperature: async () => ({
			main: null,
			max: null,
			cores: [],
			socket: [],
			chipset: null,
		}),
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
import { GpuCheck, nvidiaSmiVram } from "../../../src/lib/monitor/checks/gpu";

function fakeIncident(overrides: Partial<Incident> = {}): Incident {
	return {
		id: 1,
		metric: "gpu:RTX4090",
		volume: null,
		started_at: Date.now() - 60_000,
		resolved_at: null,
		peak_value: 95,
		threshold: 80,
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
	graphicsData = { controllers: [] };
	notifySpy.mockClear();
	for (const spy of Object.values(incidentStoreMock)) {
		spy.mockClear();
	}
	incidentStoreMock.getActiveIncident.mockImplementation(() => null);
	incidentStoreMock.openIncident.mockImplementation(() => fakeIncident());
	incidentStoreMock.getLastNotification.mockImplementation(() => null);
});

describe("GpuCheck", () => {
	test("returns undefined when GPU check is disabled", async () => {
		const check = new GpuCheck(
			{ enabled: false, vramThresholdPercent: 90, consecutiveBreaches: 3 },
			makeDeps(),
		);
		expect(await check.run()).toBeUndefined();
	});

	test("returns 'GPU: N/A' when no controllers have VRAM data", async () => {
		graphicsData = {
			controllers: [
				{
					name: "RTX4090",
					utilizationMemory: undefined,
					memoryTotal: undefined,
					memoryUsed: undefined,
				},
			],
		};
		const check = new GpuCheck(
			{ enabled: true, vramThresholdPercent: 90, consecutiveBreaches: 3 },
			makeDeps(),
		);
		expect(await check.run()).toBe("GPU: N/A");
	});

	test("returns usage string from utilizationMemory", async () => {
		graphicsData = {
			controllers: [{ name: "RTX4090", utilizationMemory: 45 }],
		};
		const check = new GpuCheck(
			{ enabled: true, vramThresholdPercent: 90, consecutiveBreaches: 3 },
			makeDeps(),
		);
		const result = await check.run();
		expect(result).toContain("RTX4090");
		expect(result).toContain("45%");
	});

	test("computes VRAM % from memoryUsed/memoryTotal when utilizationMemory is absent", async () => {
		graphicsData = {
			controllers: [{ name: "RTX4090", memoryUsed: 4096, memoryTotal: 8192 }],
		};
		const check = new GpuCheck(
			{ enabled: true, vramThresholdPercent: 90, consecutiveBreaches: 3 },
			makeDeps(),
		);
		const result = await check.run();
		expect(result).toContain("50%");
	});

	test("opens incident when VRAM usage exceeds threshold", async () => {
		graphicsData = {
			controllers: [{ name: "RTX4090", utilizationMemory: 95 }],
		};
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

describe("nvidiaSmiVram", () => {
	let binDir: string | undefined;
	let origPath: string | undefined;

	afterEach(() => {
		if (binDir) {
			rmSync(binDir, { recursive: true, force: true });
			binDir = undefined;
		}
		if (origPath !== undefined) {
			process.env.PATH = origPath;
			origPath = undefined;
		}
	});

	function fakeNvidiaSmi(output: string): void {
		binDir = mkdtempSync(join(tmpdir(), "baba-nvidia-smi-"));
		writeFileSync(
			join(binDir, "nvidia-smi"),
			`#!/bin/sh\nprintf '%s\\n' '${output.replace(/'/g, "'\\''")}'`,
		);
		chmodSync(join(binDir, "nvidia-smi"), 0o755);
		origPath = process.env.PATH;
		process.env.PATH = `${binDir}:${origPath ?? ""}`;
	}

	test("parses used/total memory into a VRAM percentage per GPU index", async () => {
		fakeNvidiaSmi("1024, 4096\n3072, 4096");
		const result = await nvidiaSmiVram();
		expect(result.get(0)).toBe(25);
		expect(result.get(1)).toBe(75);
	});

	test("skips lines with a zero or non-numeric total", async () => {
		fakeNvidiaSmi("1024, 0\nnot-a-number, 4096");
		const result = await nvidiaSmiVram();
		expect(result.size).toBe(0);
	});

	test("returns an empty map when nvidia-smi is not on PATH", async () => {
		origPath = process.env.PATH;
		process.env.PATH = "/nonexistent";
		const result = await nvidiaSmiVram();
		expect(result.size).toBe(0);
	});
});
