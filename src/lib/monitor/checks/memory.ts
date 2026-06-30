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
		// Prefer total - available (excludes page cache/buffers, matches htop/btop).
		// Fall back to mem.used when available is absent (e.g. some container runtimes).
		const actualUsed = Number.isFinite(mem.available)
			? mem.total - mem.available
			: mem.used;
		const usage = Math.round((actualUsed / mem.total) * 100);
		logger.debug(
			`Memory: ${usage}% (${humanReadableBytes(actualUsed)} / ${humanReadableBytes(mem.total)})`,
		);
		await this.breach({
			metric: "memory",
			volume: null,
			value: usage,
			threshold: this.cfg.usageThresholdPercent,
			consecutiveRequired: this.cfg.consecutiveBreaches,
			openMsg: `⚠️ **MEMORY USAGE**: Usage is at **${usage}% (${humanReadableBytes(actualUsed)}/${humanReadableBytes(mem.total)})**`,
			reminderMsg: `⏰ **MEMORY REMINDER**: Still at **${usage}%**`,
			recoveryMsg: `✅ **MEMORY**: Back to normal at **${usage}%**`,
		});
		return `Memory: ${usage}%`;
	}
}
