import { type Db, getDb } from "./db";

export type NotificationType = "alert" | "reminder" | "recovery";

export type Incident = {
	id: number;
	metric: string;
	volume: string | null;
	started_at: number;
	resolved_at: number | null;
	peak_value: number;
	threshold: number;
};

export type Notification = {
	id: number;
	incident_id: number;
	sent_at: number;
	type: NotificationType;
	succeeded: number;
};

export type IncidentSummary = Incident & { notification_count: number };
export type IncidentDetail = Incident & { notifications: Notification[] };

export type OpenIncidentOpts = {
	metric: string;
	volume: string | null;
	value: number;
	threshold: number;
};

export type RecordNotificationOpts = {
	incidentId: number;
	type: NotificationType;
	succeeded: boolean;
};

export class IncidentStore {
	private db: Db;

	constructor() {
		this.db = getDb();
	}

	openIncident(opts: OpenIncidentOpts): Incident {
		const { metric, volume, value, threshold } = opts;
		const now = Date.now();
		const row = this.db
			.query(
				"INSERT INTO incidents (metric, volume, started_at, peak_value, threshold) VALUES (?, ?, ?, ?, ?) RETURNING id",
			)
			.get(metric, volume, now, value, threshold) as { id: number } | null;
		if (!row) throw new Error("Failed to open incident");
		return {
			id: row.id,
			metric,
			volume,
			started_at: now,
			resolved_at: null,
			peak_value: value,
			threshold,
		};
	}

	getActiveIncident(metric: string, volume?: string | null): Incident | null {
		if (volume != null) {
			return (this.db
				.query(
					"SELECT * FROM incidents WHERE metric = ? AND volume = ? AND resolved_at IS NULL LIMIT 1",
				)
				.get(metric, volume) ?? null) as Incident | null;
		}
		return (this.db
			.query(
				"SELECT * FROM incidents WHERE metric = ? AND volume IS NULL AND resolved_at IS NULL LIMIT 1",
			)
			.get(metric) ?? null) as Incident | null;
	}

	resolveIncident(id: number): void {
		this.db
			.query("UPDATE incidents SET resolved_at = ? WHERE id = ?")
			.run(Date.now(), id);
	}

	recordNotification(opts: RecordNotificationOpts): void {
		const { incidentId, type, succeeded } = opts;
		this.db
			.query(
				"INSERT INTO notifications (incident_id, sent_at, type, succeeded) VALUES (?, ?, ?, ?)",
			)
			.run(incidentId, Date.now(), type, succeeded ? 1 : 0);
	}

	getLastNotification(incidentId: number): Notification | null {
		return (this.db
			.query(
				"SELECT * FROM notifications WHERE incident_id = ? ORDER BY sent_at DESC, id DESC LIMIT 1",
			)
			.get(incidentId) ?? null) as Notification | null;
	}

	listIncidents(limit = 50): IncidentSummary[] {
		return this.db
			.query(
				`SELECT i.*, COUNT(n.id) as notification_count
         FROM incidents i
         LEFT JOIN notifications n ON n.incident_id = i.id
         GROUP BY i.id
         ORDER BY i.started_at DESC, i.id DESC
         LIMIT ${Math.trunc(limit)}`,
			)
			.all() as IncidentSummary[];
	}

	getIncident(id: number): IncidentDetail | null {
		const incident = this.db
			.query("SELECT * FROM incidents WHERE id = ?")
			.get(id) as Incident | null;
		if (!incident) return null;
		const notifications = this.db
			.query(
				"SELECT * FROM notifications WHERE incident_id = ? ORDER BY sent_at ASC",
			)
			.all(id) as Notification[];
		return { ...incident, notifications };
	}
}
