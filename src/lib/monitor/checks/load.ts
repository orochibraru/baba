import si from "systeminformation";
import type { LoadChecks } from "../../../config";
import { logger } from "../../logger";
import { BaseCheck, type CheckDeps } from "../base-check";

export class LoadCheck extends BaseCheck {
	constructor(
		private readonly cfg: LoadChecks,
		deps: CheckDeps,
	) {
		super(deps);
	}

	async run(): Promise<string | undefined> {
		if (!this.cfg.enabled) return;
		const data = await si.currentLoad();
		const avg = data.avgLoad;
		logger.debug(`Load average: ${avg.toFixed(2)}`);
		await this.breach({
			metric: "load",
			volume: null,
			value: avg,
			threshold: this.cfg.threshold,
			consecutiveRequired: this.cfg.consecutiveBreaches,
			openMsg: `🚨 **LOAD CRITICAL**: Load average is at **${avg.toFixed(2)}**`,
			reminderMsg: `⏰ **LOAD REMINDER**: Still at **${avg.toFixed(2)}**`,
			recoveryMsg: `✅ **LOAD**: Back to normal at **${avg.toFixed(2)}**`,
		});
		return `Load: ${avg.toFixed(2)}`;
	}
}
