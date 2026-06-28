import si from "systeminformation";
import type { MemoryChecks } from "../../../config";
import { humanReadableBytes } from "../../helpers";
import { logger } from "../../logger";
import { BaseCheck, type CheckDeps } from "../base-check";

export class MemoryCheck extends BaseCheck {
	constructor(
		private readonly cfg: MemoryChecks,
		deps: CheckDeps,
	) {
		super(deps);
	}

	async run(): Promise<string | undefined> {
		if (!this.cfg.enabled) return;
		const mem = await si.mem();
		const usage = Math.round((mem.used / mem.total) * 100);
		logger.debug(
			`Memory: ${usage}% (${humanReadableBytes(mem.used)} / ${humanReadableBytes(mem.total)})`,
		);
		await this.breach({
			metric: "memory",
			volume: null,
			value: usage,
			threshold: this.cfg.usageThresholdPercent,
			consecutiveRequired: this.cfg.consecutiveBreaches,
			openMsg: `⚠️ **MEMORY USAGE**: Usage is at **${usage}% (${humanReadableBytes(mem.used)}/${humanReadableBytes(mem.total)})**`,
			reminderMsg: `⏰ **MEMORY REMINDER**: Still at **${usage}%**`,
			recoveryMsg: `✅ **MEMORY**: Back to normal at **${usage}%**`,
		});
		return `Memory: ${usage}%`;
	}
}
