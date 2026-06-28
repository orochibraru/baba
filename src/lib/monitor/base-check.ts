import { getConfig } from "../../config";
import type { IncidentStore } from "../incident-store";
import { logger } from "../logger";
import type { BreachOpts } from "./types";

export type CheckDeps = {
	incidentStore: IncidentStore;
	notifiers: { alert(message: string): Promise<void> };
	reminderIntervalMs: number;
	breachCounter: Map<string, number>;
};

export abstract class BaseCheck {
	constructor(private readonly deps: CheckDeps) {}

	abstract run(): Promise<string | undefined>;

	protected async breach(opts: BreachOpts): Promise<void> {
		const {
			metric,
			volume,
			value,
			threshold,
			consecutiveRequired,
			openMsg,
			reminderMsg,
			recoveryMsg,
		} = opts;
		const { incidentStore, notifiers, reminderIntervalMs, breachCounter } =
			this.deps;
		const config = getConfig();
		const tag = `[${config.machineName}]`;
		const key = volume != null ? `${metric}:${volume}` : metric;
		const activeIncident = incidentStore.getActiveIncident(
			metric,
			volume ?? undefined,
		);

		if (value > threshold) {
			if (activeIncident) {
				const lastNotif = incidentStore.getLastNotification(activeIncident.id);
				const elapsed =
					Date.now() - (lastNotif?.sent_at ?? activeIncident.started_at);
				logger.debug(
					`[${key}] breach ongoing (incident #${activeIncident.id}), elapsed ${Math.round(elapsed / 1000)}s`,
				);
				if (elapsed > reminderIntervalMs) {
					logger.debug(`[${key}] reminder interval exceeded, re-alerting`);
					await notifiers.alert(`${tag} ${reminderMsg}`);
					incidentStore.recordNotification({
						incidentId: activeIncident.id,
						type: "reminder",
						succeeded: true,
					});
				}
			} else {
				const count = (breachCounter.get(key) ?? 0) + 1;
				breachCounter.set(key, count);
				logger.debug(
					`[${key}] breach ${count}/${consecutiveRequired} (value: ${value}, threshold: ${threshold})`,
				);
				if (count >= consecutiveRequired) {
					logger.debug(`[${key}] opening incident`);
					const incident = incidentStore.openIncident({
						metric,
						volume,
						value,
						threshold,
					});
					await notifiers.alert(`${tag} ${openMsg}`);
					incidentStore.recordNotification({
						incidentId: incident.id,
						type: "alert",
						succeeded: true,
					});
					breachCounter.delete(key);
				}
			}
		} else {
			breachCounter.delete(key);
			if (activeIncident) {
				logger.debug(
					`[${key}] value normalised, resolving incident #${activeIncident.id}`,
				);
				incidentStore.resolveIncident(activeIncident.id);
				await notifiers.alert(`${tag} ${recoveryMsg}`);
				incidentStore.recordNotification({
					incidentId: activeIncident.id,
					type: "recovery",
					succeeded: true,
				});
			} else {
				logger.debug(`[${key}] value normal (${value} ≤ ${threshold})`);
			}
		}
	}
}
