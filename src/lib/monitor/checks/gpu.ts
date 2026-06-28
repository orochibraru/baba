import si from "systeminformation";
import type { GpuChecks } from "../../../config";
import { logger } from "../../logger";
import { BaseCheck, type CheckDeps } from "../base-check";

export class GpuCheck extends BaseCheck {
	constructor(
		private readonly cfg: GpuChecks,
		deps: CheckDeps,
	) {
		super(deps);
	}

	async run(): Promise<string | undefined> {
		if (!this.cfg.enabled) return;
		const graphics = await si.graphics();
		const parts: string[] = [];

		for (const ctrl of graphics.controllers) {
			const util = ctrl.utilizationGpu;
			if (util == null) continue;
			logger.debug(`GPU utilization (${ctrl.name}): ${util}%`);
			await this.breach({
				metric: `gpu:${ctrl.name}`,
				volume: null,
				value: util,
				threshold: this.cfg.vramThresholdPercent,
				consecutiveRequired: this.cfg.consecutiveBreaches,
				openMsg: `⚠️ **GPU USAGE** (${ctrl.name}): Usage is at **${util}%**`,
				reminderMsg: `⏰ **GPU REMINDER** (${ctrl.name}): Still at **${util}%**`,
				recoveryMsg: `✅ **GPU** (${ctrl.name}): Back to normal at **${util}%**`,
			});
			parts.push(`${ctrl.name}: ${util}%`);
		}

		if (parts.length === 0) return "GPU: N/A";
		return `GPU: ${parts.join(" | ")}`;
	}
}
