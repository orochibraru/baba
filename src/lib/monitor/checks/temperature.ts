import si from "systeminformation";
import type { TemperatureChecks } from "../../../config";
import { logger } from "../../logger";
import { BaseCheck, type CheckDeps } from "../base-check";

export class TemperatureCheck extends BaseCheck {
	constructor(
		private readonly cfg: TemperatureChecks,
		deps: CheckDeps,
	) {
		super(deps);
	}

	async run(): Promise<string | undefined> {
		const [cpuTemp, graphics] = await Promise.all([
			si.cpuTemperature(),
			si.graphics(),
		]);

		const parts: string[] = [];

		const cpuMax = this.resolveCpuTemp(cpuTemp);
		if (cpuMax != null) {
			logger.debug(`CPU temp: ${cpuMax}°C`);
			if (this.cfg.enabled) {
				await this.breach({
					metric: "temp:cpu",
					volume: null,
					value: cpuMax,
					threshold: this.cfg.cpuThresholdCelsius,
					consecutiveRequired: this.cfg.consecutiveBreaches,
					openMsg: `🌡️ **CPU TEMP**: Temperature is at **${cpuMax}°C**`,
					reminderMsg: `⏰ **CPU TEMP REMINDER**: Still at **${cpuMax}°C**`,
					recoveryMsg: `✅ **CPU TEMP**: Back to normal at **${cpuMax}°C**`,
				});
			}
			parts.push(`CPU ${cpuMax}°C`);
		}

		for (const ctrl of graphics.controllers) {
			const gpuTemp = ctrl.temperatureGpu;
			if (gpuTemp != null && gpuTemp > 0) {
				logger.debug(`GPU temp (${ctrl.name}): ${gpuTemp}°C`);
				if (this.cfg.enabled) {
					await this.breach({
						metric: `temp:gpu:${ctrl.name}`,
						volume: null,
						value: gpuTemp,
						threshold: this.cfg.gpuThresholdCelsius,
						consecutiveRequired: this.cfg.consecutiveBreaches,
						openMsg: `🌡️ **GPU TEMP** (${ctrl.name}): Temperature is at **${gpuTemp}°C**`,
						reminderMsg: `⏰ **GPU TEMP REMINDER** (${ctrl.name}): Still at **${gpuTemp}°C**`,
						recoveryMsg: `✅ **GPU TEMP** (${ctrl.name}): Back to normal at **${gpuTemp}°C**`,
					});
				}
				parts.push(`${ctrl.name} ${gpuTemp}°C`);
			}
		}

		if (parts.length === 0) return "Temp: N/A";
		return `Temp: ${parts.join(" | ")}`;
	}

	// SI returns -1 on some platforms (e.g. macOS) to indicate "unavailable",
	// and null on others. We try max → main → highest core → highest socket,
	// treating anything ≤ 0 as absent.
	private resolveCpuTemp(
		cpuTemp: Awaited<ReturnType<typeof si.cpuTemperature>>,
	): number | null {
		const valid = (n: number | null | undefined): number | null =>
			n != null && n > 0 ? n : null;

		return (
			valid(cpuTemp.max) ??
			valid(cpuTemp.main) ??
			(cpuTemp.cores.length > 0 ? valid(Math.max(...cpuTemp.cores)) : null) ??
			(cpuTemp.socket != null && cpuTemp.socket.length > 0
				? valid(Math.max(...cpuTemp.socket))
				: null) ??
			valid(cpuTemp.chipset)
		);
	}
}
