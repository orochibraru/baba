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
			// Prefer size - available (APFS shared-pool awareness; vol.used only
			// reflects one subvolume). Fall back to vol.used when available is absent.
			const consumed = Number.isFinite(vol.available)
				? vol.size - vol.available
				: vol.used;
			const usage = Math.round((consumed / vol.size) * 100);
			logger.debug(
				`Disk ${vol.fs}: ${usage}% (${humanReadableBytes(consumed)} / ${humanReadableBytes(vol.size)})`,
			);
			total += usage;
			await this.breach({
				metric: "disk",
				volume: vol.fs,
				value: usage,
				threshold: this.cfg.usageThresholdPercent,
				consecutiveRequired: 1,
				openMsg: `⚠️ **DISK USAGE** (${vol.fs}): Usage is at **${usage}% (${humanReadableBytes(consumed)}/${humanReadableBytes(vol.size)})**`,
				reminderMsg: `⏰ **DISK REMINDER** (${vol.fs}): Still at **${usage}%**`,
				recoveryMsg: `✅ **DISK** (${vol.fs}): Back to normal at **${usage}%**`,
			});
		}
		return `Disk: ${total}%`;
	}
}
