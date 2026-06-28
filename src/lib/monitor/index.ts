import { config } from "../../config";
import { IncidentStore } from "../incident-store";
import { logger } from "../logger";
import { Notifiers } from "../notifiers";
import type { BaseCheck } from "./base-check";
import { CpuCheck } from "./checks/cpu";
import { DiskCheck } from "./checks/disk";
import { GpuCheck } from "./checks/gpu";
import { LoadCheck } from "./checks/load";
import { MemoryCheck } from "./checks/memory";
import { TemperatureCheck } from "./checks/temperature";

export class Monitor {
	private readonly monitors: BaseCheck[];
	private readonly notifiers: Notifiers;
	private readonly breachCounter = new Map<string, number>();

	constructor() {
		this.notifiers = new Notifiers();
		const deps = {
			incidentStore: new IncidentStore(),
			notifiers: this.notifiers,
			reminderIntervalMs: config.reminderIntervalMinutes * 60_000,
			breachCounter: this.breachCounter,
		};

		this.monitors = [
			new CpuCheck(structuredClone(config.checks.cpu), deps),
			new LoadCheck(structuredClone(config.checks.load), deps),
			new MemoryCheck(structuredClone(config.checks.memory), deps),
			new DiskCheck(structuredClone(config.checks.disk), deps),
			new TemperatureCheck(structuredClone(config.checks.temperature), deps),
			new GpuCheck(structuredClone(config.checks.gpu), deps),
		];
	}

	async runAllParallel(): Promise<void> {
		const parts = (await Promise.all(this.monitors.map((m) => m.run()))).filter(
			(p): p is string => p !== undefined,
		);
		logger.info(parts.join(" | "));
	}
}
