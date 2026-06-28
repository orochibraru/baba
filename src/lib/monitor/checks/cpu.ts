import si from "systeminformation";
import type { CpuChecks } from "../../../config";
import { logger } from "../../logger";
import { BaseCheck, type CheckDeps } from "../base-check";

export class CpuCheck extends BaseCheck {
	constructor(
		private readonly cfg: CpuChecks,
		deps: CheckDeps,
	) {
		super(deps);
	}

	async run(): Promise<string | undefined> {
		if (!this.cfg.enabled) return;
		const data = await si.currentLoad();
		const usage = Math.round(data.currentLoad);
		logger.debug(`CPU usage: ${usage}%`);
		await this.breach({
			metric: "cpu",
			volume: null,
			value: usage,
			threshold: this.cfg.usageThresholdPercent,
			consecutiveRequired: this.cfg.consecutiveBreaches,
			openMsg: `⚠️ **CPU LOAD**: Usage is at **${usage}%**`,
			reminderMsg: `⏰ **CPU REMINDER**: Still at **${usage}%**`,
			recoveryMsg: `✅ **CPU**: Back to normal at **${usage}%**`,
		});
		return `CPU: ${usage}%`;
	}
}
