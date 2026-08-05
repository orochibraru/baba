import si from "systeminformation";
import type { GpuChecks } from "../../../config";
import { logger } from "../../logger";
import { BaseCheck, type CheckDeps } from "../base-check";

// Returns a map of GPU index → VRAM usage % from nvidia-smi when si.graphics()
// doesn't provide memory utilization data (common on Linux without full driver integration).
export async function nvidiaSmiVram(): Promise<Map<number, number>> {
	const results = new Map<number, number>();
	try {
		const proc = Bun.spawn(
			[
				"nvidia-smi",
				"--query-gpu=memory.used,memory.total",
				"--format=csv,noheader,nounits",
			],
			{ stdout: "pipe", stderr: "pipe", env: process.env },
		);
		const text = await new Response(proc.stdout).text();
		for (const [i, line] of text.trim().split("\n").entries()) {
			const [usedStr, totalStr] = line.split(",").map((s) => s.trim());
			const used = Number.parseInt(usedStr ?? "", 10);
			const total = Number.parseInt(totalStr ?? "", 10);
			if (!Number.isNaN(used) && !Number.isNaN(total) && total > 0) {
				results.set(i, Math.round((used / total) * 100));
			}
		}
	} catch {
		// nvidia-smi not installed or not in PATH
	}
	return results;
}

export class GpuCheck extends BaseCheck {
	constructor(
		private readonly cfg: GpuChecks,
		deps: CheckDeps,
	) {
		super(deps);
	}

	async run(): Promise<string | undefined> {
		if (!this.cfg.enabled) {
			return;
		}
		const graphics = await si.graphics();
		const parts: string[] = [];
		let smiData: Map<number, number> | null = null;

		for (const [i, ctrl] of graphics.controllers.entries()) {
			// Resolve VRAM usage %: utilizationMemory → memoryUsed/memoryTotal → nvidia-smi
			let vram: number | null = null;
			if (ctrl.utilizationMemory != null) {
				vram = ctrl.utilizationMemory;
			} else if (
				ctrl.memoryTotal != null &&
				ctrl.memoryTotal > 0 &&
				ctrl.memoryUsed != null
			) {
				vram = Math.round((ctrl.memoryUsed / ctrl.memoryTotal) * 100);
			} else {
				if (!smiData) {
					smiData = await nvidiaSmiVram();
				}
				vram = smiData.get(i) ?? null;
			}

			if (vram == null) {
				continue;
			}
			logger.debug(`GPU VRAM (${ctrl.name}): ${vram}%`);
			await this.checkIfBreachedAndAlert({
				metric: `gpu:${ctrl.name}`,
				volume: null,
				value: vram,
				threshold: this.cfg.vramThresholdPercent,
				consecutiveRequired: this.cfg.consecutiveBreaches,
				openMsg: `⚠️ **GPU VRAM** (${ctrl.name}): Usage is at **${vram}%**`,
				reminderMsg: `⏰ **GPU VRAM REMINDER** (${ctrl.name}): Still at **${vram}%**`,
				recoveryMsg: `✅ **GPU VRAM** (${ctrl.name}): Back to normal at **${vram}%**`,
			});
			parts.push(`${ctrl.name}: ${vram}%`);
		}

		if (parts.length === 0) {
			return "GPU: N/A";
		}
		return `GPU: ${parts.join(" | ")}`;
	}
}
