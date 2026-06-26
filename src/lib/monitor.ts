import si, { type Systeminformation } from "systeminformation";
import { type Checks, config } from "../config";
import { humanReadableBytes } from "./helpers";
import { notify } from "./notify";

export class Monitor {
	readonly checks: Checks;
	volumes: Systeminformation.FsSizeData[] = [];

	public constructor() {
		this.checks = config.checks;
		void this.lazyInit();
	}

	private async lazyInit() {
		await this.refreshDisks();
	}

	public async refreshDisks() {
		console.log("Refreshing disks...");
		this.volumes = await si.fsSize();
	}

	public async runAllParallel() {
		const parts = await Promise.all([
			this.checkCpu(),
			this.checkLoad(),
			this.checkMemory(),
			this.checkDisk(),
		]);

		console.log(`[${new Date().toISOString()}] ${parts.join(" | ")}`);
	}

	public async checkCpu(): Promise<string | undefined> {
		if (!this.checks.cpu.enabled) {
			return;
		}
		const cpuLoad = await si.currentLoad();
		const cpuUsage = Math.round(cpuLoad.currentLoad);
		if (cpuUsage > this.checks.cpu.usageThresholdPercent) {
			await notify(`⚠️ **CPU LOAD**: Usage is at **${cpuUsage}%**`);
		}
		return `CPU: ${cpuUsage}%`;
	}

	public async checkLoad(): Promise<string | undefined> {
		if (!this.checks.load.enabled) {
			return;
		}
		const cpuLoad = await si.currentLoad();
		const avgLoad = cpuLoad.avgLoad;
		if (avgLoad > this.checks.load.threshold) {
			await notify(
				`🚨 **LOAD CRITICAL**: Load average is at **${avgLoad.toFixed(2)}**`,
			);
		}
		return `Load: ${avgLoad.toFixed(2)}`;
	}

	public async checkDisk(): Promise<string | undefined> {
		if (!this.checks.disk.enabled) {
			return;
		}
		const selectedVolumes = this.volumes.filter((vol) =>
			this.checks.disk.volumes.includes(vol.mount),
		);

		if (selectedVolumes.length === 0) {
			return "No volumes found";
		}

		let globalUsagePercentage: number = 0;

		for (const vol of selectedVolumes) {
			const diskUsage = Math.round((vol.used / vol.size) * 100);
			globalUsagePercentage += diskUsage;
			if (diskUsage > this.checks.disk.usageThresholdPercent) {
				await notify(
					`⚠️ **DISK USAGE**: Usage is at **${diskUsage}% (${humanReadableBytes(vol.used)}/${humanReadableBytes(vol.size)})**`,
				);
			}
		}

		return `Disk: ${globalUsagePercentage}%`;
	}

	public async checkMemory(): Promise<string | undefined> {
		if (!this.checks.memory.enabled) {
			return;
		}
		const rawMem = await si.mem();
		const memUsage = Math.round((rawMem.used / rawMem.total) * 100);
		if (memUsage > this.checks.memory.usageThresholdPercent) {
			await notify(
				`⚠️ **MEMORY USAGE**: Usage is at **${memUsage}% (${humanReadableBytes(rawMem.used)}/${humanReadableBytes(rawMem.total)})**`,
			);
		}
		return `Memory: ${memUsage}%`;
	}
}
