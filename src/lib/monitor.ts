import si, { type Systeminformation } from "systeminformation";
import { type Checks, config } from "../config";
import { humanReadableBytes } from "./helpers";
import type { IncidentStore } from "./incident-store";
import { logger } from "./logger";
import { Notifiers } from "./notifiers";

export class Monitor {
	readonly checks: Checks;
	private readonly reminderIntervalMs: number;
	public volumes: Systeminformation.FsSizeData[] = [];
	private notifiers: Notifiers;
	private incidentStore: IncidentStore;
	private breachCounter = new Map<string, number>();

	public constructor(incidentStore: IncidentStore) {
		this.checks = structuredClone(config.checks);
		this.reminderIntervalMs = config.reminderIntervalMinutes * 60_000;
		this.notifiers = new Notifiers();
		this.incidentStore = incidentStore;
		void this.lazyInit();
	}

	private async lazyInit() {
		await this.refreshDisks();
	}

	public async refreshDisks() {
		logger.debug("Refreshing disk list...");
		this.volumes = await si.fsSize();
		logger.debug(
			`Found ${this.volumes.length} volume(s): ${this.volumes.map((v) => v.fs).join(", ")}`,
		);
	}

	private incrementBreach(key: string): number {
		const count = (this.breachCounter.get(key) ?? 0) + 1;
		this.breachCounter.set(key, count);
		return count;
	}

	private resetBreach(key: string): void {
		this.breachCounter.delete(key);
	}

	private async handleBreach(
		metric: string,
		volume: string | null,
		value: number,
		threshold: number,
		consecutiveRequired: number,
		openMsg: string,
		reminderMsg: string,
		recoveryMsg: string,
	): Promise<void> {
		const key = volume != null ? `${metric}:${volume}` : metric;
		const activeIncident = this.incidentStore.getActiveIncident(
			metric,
			volume ?? undefined,
		);

		if (value > threshold) {
			if (activeIncident) {
				const lastNotif = this.incidentStore.getLastNotification(
					activeIncident.id,
				);
				const elapsed =
					Date.now() - (lastNotif?.sent_at ?? activeIncident.started_at);
				logger.debug(
					`[${key}] breach ongoing (incident #${activeIncident.id}), elapsed ${Math.round(elapsed / 1000)}s`,
				);
				if (elapsed > this.reminderIntervalMs) {
					logger.debug(`[${key}] reminder interval exceeded, re-alerting`);
					await this.notifiers.alert(reminderMsg);
					this.incidentStore.recordNotification(
						activeIncident.id,
						"reminder",
						true,
					);
				}
			} else {
				const count = this.incrementBreach(key);
				logger.debug(
					`[${key}] breach ${count}/${consecutiveRequired} (value: ${value}, threshold: ${threshold})`,
				);
				if (count >= consecutiveRequired) {
					logger.debug(`[${key}] opening incident`);
					const incident = this.incidentStore.openIncident(
						metric,
						volume,
						value,
						threshold,
					);
					await this.notifiers.alert(openMsg);
					this.incidentStore.recordNotification(incident.id, "alert", true);
					this.resetBreach(key);
				}
			}
		} else {
			this.resetBreach(key);
			if (activeIncident) {
				logger.debug(
					`[${key}] value normalised, resolving incident #${activeIncident.id}`,
				);
				this.incidentStore.resolveIncident(activeIncident.id);
				await this.notifiers.alert(recoveryMsg);
				this.incidentStore.recordNotification(
					activeIncident.id,
					"recovery",
					true,
				);
			} else {
				logger.debug(`[${key}] value normal (${value} ≤ ${threshold})`);
			}
		}
	}

	public async runAllParallel() {
		const parts = (
			await Promise.all([
				this.checkCpu(),
				this.checkLoad(),
				this.checkMemory(),
				this.checkDisk(),
				this.checkTemperature(),
				this.checkGpu(),
			])
		).filter((p): p is string => p !== undefined);

		logger.info(parts.join(" | "));
	}

	public async checkCpu(): Promise<string | undefined> {
		if (!this.checks.cpu.enabled) return;
		const cpuLoad = await si.currentLoad();
		const usage = Math.round(cpuLoad.currentLoad);
		logger.debug(`CPU usage: ${usage}%`);
		await this.handleBreach(
			"cpu",
			null,
			usage,
			this.checks.cpu.usageThresholdPercent,
			this.checks.cpu.consecutiveBreaches,
			`⚠️ **CPU LOAD**: Usage is at **${usage}%**`,
			`⏰ **CPU REMINDER**: Still at **${usage}%**`,
			`✅ **CPU**: Back to normal at **${usage}%**`,
		);
		return `CPU: ${usage}%`;
	}

	public async checkLoad(): Promise<string | undefined> {
		if (!this.checks.load.enabled) return;
		const cpuLoad = await si.currentLoad();
		const avgLoad = cpuLoad.avgLoad;
		logger.debug(`Load average: ${avgLoad.toFixed(2)}`);
		await this.handleBreach(
			"load",
			null,
			avgLoad,
			this.checks.load.threshold,
			this.checks.load.consecutiveBreaches,
			`🚨 **LOAD CRITICAL**: Load average is at **${avgLoad.toFixed(2)}**`,
			`⏰ **LOAD REMINDER**: Still at **${avgLoad.toFixed(2)}**`,
			`✅ **LOAD**: Back to normal at **${avgLoad.toFixed(2)}**`,
		);
		return `Load: ${avgLoad.toFixed(2)}`;
	}

	public async checkMemory(): Promise<string | undefined> {
		if (!this.checks.memory.enabled) return;
		const rawMem = await si.mem();
		const memUsage = Math.round((rawMem.used / rawMem.total) * 100);
		logger.debug(
			`Memory: ${memUsage}% (${humanReadableBytes(rawMem.used)} / ${humanReadableBytes(rawMem.total)})`,
		);
		await this.handleBreach(
			"memory",
			null,
			memUsage,
			this.checks.memory.usageThresholdPercent,
			this.checks.memory.consecutiveBreaches,
			`⚠️ **MEMORY USAGE**: Usage is at **${memUsage}% (${humanReadableBytes(rawMem.used)}/${humanReadableBytes(rawMem.total)})**`,
			`⏰ **MEMORY REMINDER**: Still at **${memUsage}%**`,
			`✅ **MEMORY**: Back to normal at **${memUsage}%**`,
		);
		return `Memory: ${memUsage}%`;
	}

	public async checkDisk(): Promise<string | undefined> {
		if (!this.checks.disk.enabled) return;
		const selectedVolumes = this.volumes.filter((vol) =>
			this.checks.disk.volumes.includes(vol.fs),
		);
		if (selectedVolumes.length === 0) return "No volumes found";

		let totalUsage = 0;
		for (const vol of selectedVolumes) {
			const diskUsage = Math.round((vol.used / vol.size) * 100);
			logger.debug(
				`Disk ${vol.fs}: ${diskUsage}% (${humanReadableBytes(vol.used)} / ${humanReadableBytes(vol.size)})`,
			);
			totalUsage += diskUsage;
			await this.handleBreach(
				"disk",
				vol.fs,
				diskUsage,
				this.checks.disk.usageThresholdPercent,
				1,
				`⚠️ **DISK USAGE** (${vol.fs}): Usage is at **${diskUsage}% (${humanReadableBytes(vol.used)}/${humanReadableBytes(vol.size)})**`,
				`⏰ **DISK REMINDER** (${vol.fs}): Still at **${diskUsage}%**`,
				`✅ **DISK** (${vol.fs}): Back to normal at **${diskUsage}%**`,
			);
		}
		return `Disk: ${totalUsage}%`;
	}

	public async checkTemperature(): Promise<string | undefined> {
		if (!this.checks.temperature.enabled) return;
		const [cpuTemp, graphics] = await Promise.all([
			si.cpuTemperature(),
			si.graphics(),
		]);

		const parts: string[] = [];

		const cpuMax = cpuTemp.max ?? cpuTemp.main;
		if (cpuMax != null) {
			logger.debug(`CPU temp: ${cpuMax}°C`);
			await this.handleBreach(
				"temp:cpu",
				null,
				cpuMax,
				this.checks.temperature.cpuThresholdCelsius,
				this.checks.temperature.consecutiveBreaches,
				`🌡️ **CPU TEMP**: Temperature is at **${cpuMax}°C**`,
				`⏰ **CPU TEMP REMINDER**: Still at **${cpuMax}°C**`,
				`✅ **CPU TEMP**: Back to normal at **${cpuMax}°C**`,
			);
			parts.push(`CPU ${cpuMax}°C`);
		}

		for (const controller of graphics.controllers) {
			const gpuTemp = controller.temperatureGpu;
			if (gpuTemp != null && gpuTemp > 0) {
				logger.debug(`GPU temp (${controller.name}): ${gpuTemp}°C`);
				await this.handleBreach(
					`temp:gpu:${controller.name}`,
					null,
					gpuTemp,
					this.checks.temperature.gpuThresholdCelsius,
					this.checks.temperature.consecutiveBreaches,
					`🌡️ **GPU TEMP** (${controller.name}): Temperature is at **${gpuTemp}°C**`,
					`⏰ **GPU TEMP REMINDER** (${controller.name}): Still at **${gpuTemp}°C**`,
					`✅ **GPU TEMP** (${controller.name}): Back to normal at **${gpuTemp}°C**`,
				);
				parts.push(`${controller.name} ${gpuTemp}°C`);
			}
		}

		if (parts.length === 0) return;
		return `Temp: ${parts.join(" | ")}`;
	}

	public async checkGpu(): Promise<string | undefined> {
		if (!this.checks.gpu.enabled) return;
		const graphics = await si.graphics();
		const parts: string[] = [];

		for (const controller of graphics.controllers) {
			const util = controller.utilizationGpu;
			if (util == null) continue;
			logger.debug(`GPU utilization (${controller.name}): ${util}%`);
			await this.handleBreach(
				`gpu:${controller.name}`,
				null,
				util,
				this.checks.gpu.vramThresholdPercent,
				this.checks.gpu.consecutiveBreaches,
				`⚠️ **GPU USAGE** (${controller.name}): Usage is at **${util}%**`,
				`⏰ **GPU REMINDER** (${controller.name}): Still at **${util}%**`,
				`✅ **GPU** (${controller.name}): Back to normal at **${util}%**`,
			);
			parts.push(`${controller.name}: ${util}%`);
		}

		if (parts.length === 0) return "GPU: N/A";
		return `GPU: ${parts.join(" | ")}`;
	}
}
