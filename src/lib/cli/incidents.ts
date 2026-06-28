/** biome-ignore-all lint/suspicious/noConsole: This prints the incidents, it's part of the CLI */
import { loadConfig } from "../../config";
import { getDb, initDb } from "../db";
import { formatDate } from "../helpers";
import { IncidentStore } from "../incident-store";
import { logger } from "../logger";

async function openIncidentDb() {
	const cfg = await loadConfig();
	initDb(cfg.database.path);
	return new IncidentStore(getDb());
}

export async function listIncidents(opts: { limit: string }) {
	const store = await openIncidentDb();
	const incidents = store.listIncidents(Number(opts.limit));

	if (incidents.length === 0) {
		logger.info("No incidents recorded.");
		return;
	}

	const col = (s: string, w: number) => s.padEnd(w).slice(0, w);
	const header =
		`${"ID".padEnd(6)}${"Metric".padEnd(28)}${"Volume".padEnd(16)}` +
		`${"Started".padEnd(22)}${"Status".padEnd(10)}${"Peak".padEnd(10)}` +
		`${"Threshold".padEnd(10)}${"Notifs".padEnd(6)}`;
	const divider = "─".repeat(header.length);

	console.log(header);
	console.log(divider);

	for (const inc of incidents) {
		const status = inc.resolved_at ? "RESOLVED" : "OPEN";
		console.log(
			`${col(String(inc.id), 6)}` +
				`${col(inc.metric, 28)}` +
				`${col(inc.volume ?? "-", 16)}` +
				`${col(formatDate(inc.started_at), 22)}` +
				`${col(status, 10)}` +
				`${col(String(inc.peak_value), 10)}` +
				`${col(String(inc.threshold), 10)}` +
				`${col(String(inc.notification_count), 6)}`,
		);
	}
}

export async function getIncident(id: string) {
	const store = await openIncidentDb();
	const incident = store.getIncident(Number(id));

	if (!incident) {
		logger.error(`Incident #${id} not found.`);
		process.exit(1);
	}

	const status = incident.resolved_at ? "RESOLVED" : "OPEN";
	console.log(`\nIncident #${incident.id}`);
	console.log(`  Metric:     ${incident.metric}`);
	if (incident.volume) console.log(`  Volume:     ${incident.volume}`);
	console.log(`  Status:     ${status}`);
	console.log(`  Started:    ${formatDate(incident.started_at)}`);
	if (incident.resolved_at) {
		console.log(`  Resolved:   ${formatDate(incident.resolved_at)}`);
	}
	console.log(`  Peak value: ${incident.peak_value}`);
	console.log(`  Threshold:  ${incident.threshold}`);

	if (incident.notifications.length === 0) {
		console.log("\n  No notifications recorded.");
	} else {
		console.log(`\n  Notifications (${incident.notifications.length}):`);
		for (const n of incident.notifications) {
			const ok = n.succeeded ? "✓" : "✗";
			console.log(`    ${formatDate(n.sent_at)}  ${n.type.padEnd(10)} ${ok}`);
		}
	}
	console.log();
}
