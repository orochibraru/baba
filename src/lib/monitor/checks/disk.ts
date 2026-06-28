import si from "systeminformation";
import type { DiskChecks } from "../../../config";
import { humanReadableBytes } from "../../helpers";
import { logger } from "../../logger";
import { BaseCheck, type CheckDeps } from "../base-check";

export class DiskCheck extends BaseCheck {
	constructor(
		private readonly cfg: DiskChecks,
		deps: CheckDeps,
	) {
		super(deps);
	}

	async run(): Promise<string | undefined> {
		if (!this.cfg.enabled) return;
		const allVolumes = await si.fsSize();
		const selected = allVolumes.filter(
			(v) =>
				this.cfg.volumes.includes(v.fs) || this.cfg.volumes.includes(v.mount),
		);
		if (selected.length === 0) return "No volumes found";

		let total = 0;
		for (const vol of selected) {
			const usage = Math.round((vol.used / vol.size) * 100);
			logger.debug(
				`Disk ${vol.fs}: ${usage}% (${humanReadableBytes(vol.used)} / ${humanReadableBytes(vol.size)})`,
			);
			total += usage;
			await this.breach({
				metric: "disk",
				volume: vol.fs,
				value: usage,
				threshold: this.cfg.usageThresholdPercent,
				consecutiveRequired: 1,
				openMsg: `⚠️ **DISK USAGE** (${vol.fs}): Usage is at **${usage}% (${humanReadableBytes(vol.used)}/${humanReadableBytes(vol.size)})**`,
				reminderMsg: `⏰ **DISK REMINDER** (${vol.fs}): Still at **${usage}%**`,
				recoveryMsg: `✅ **DISK** (${vol.fs}): Back to normal at **${usage}%**`,
			});
		}
		return `Disk: ${total}%`;
	}
}
