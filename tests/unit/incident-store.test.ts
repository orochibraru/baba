const dbCfg = { database: { path: ":memory:" } };
mock.module("../../src/config", () => ({
	config: dbCfg,
	getConfig: () => dbCfg,
}));

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { initDb } from "../../src/lib/db";
import { IncidentStore } from "../../src/lib/incident-store";

let store: IncidentStore;

beforeEach(() => {
	initDb();
	store = new IncidentStore();
});

describe("openIncident", () => {
	test("returns an incident with the correct fields", () => {
		const inc = store.openIncident({
			metric: "cpu",
			volume: null,
			value: 95,
			threshold: 90,
		});
		expect(inc.id).toBeGreaterThan(0);
		expect(inc.metric).toBe("cpu");
		expect(inc.volume).toBeNull();
		expect(inc.peak_value).toBe(95);
		expect(inc.threshold).toBe(90);
		expect(inc.resolved_at).toBeNull();
		expect(inc.started_at).toBeLessThanOrEqual(Date.now());
	});

	test("assigns sequential IDs for multiple incidents", () => {
		const a = store.openIncident({
			metric: "cpu",
			volume: null,
			value: 95,
			threshold: 90,
		});
		const b = store.openIncident({
			metric: "memory",
			volume: null,
			value: 92,
			threshold: 90,
		});
		expect(b.id).toBeGreaterThan(a.id);
	});

	test("stores volume for disk incidents", () => {
		const inc = store.openIncident({
			metric: "disk",
			volume: "/dev/sda1",
			value: 96,
			threshold: 90,
		});
		expect(inc.volume).toBe("/dev/sda1");
	});
});

describe("getActiveIncident", () => {
	test("returns null when no incident exists", () => {
		expect(store.getActiveIncident("cpu")).toBeNull();
	});

	test("returns the active incident for a metric", () => {
		store.openIncident({
			metric: "cpu",
			volume: null,
			value: 95,
			threshold: 90,
		});
		const inc = store.getActiveIncident("cpu");
		expect(inc).not.toBeNull();
		expect(inc?.metric).toBe("cpu");
	});

	test("returns null after the incident is resolved", () => {
		const inc = store.openIncident({
			metric: "cpu",
			volume: null,
			value: 95,
			threshold: 90,
		});
		store.resolveIncident(inc.id);
		expect(store.getActiveIncident("cpu")).toBeNull();
	});

	test("does not return a different metric's incident", () => {
		store.openIncident({
			metric: "memory",
			volume: null,
			value: 92,
			threshold: 90,
		});
		expect(store.getActiveIncident("cpu")).toBeNull();
	});

	test("matches by volume for disk incidents", () => {
		store.openIncident({
			metric: "disk",
			volume: "/dev/sda1",
			value: 96,
			threshold: 90,
		});
		expect(store.getActiveIncident("disk", "/dev/sda1")).not.toBeNull();
		expect(store.getActiveIncident("disk", "/dev/sdb1")).toBeNull();
	});
});

describe("resolveIncident", () => {
	test("sets resolved_at on the incident", () => {
		const before = Date.now();
		const inc = store.openIncident({
			metric: "cpu",
			volume: null,
			value: 95,
			threshold: 90,
		});
		store.resolveIncident(inc.id);
		const resolved = store.getIncident(inc.id);
		expect(resolved?.resolved_at).toBeGreaterThanOrEqual(before);
	});
});

describe("recordNotification / getLastNotification", () => {
	test("getLastNotification returns null when no notifications exist", () => {
		const inc = store.openIncident({
			metric: "cpu",
			volume: null,
			value: 95,
			threshold: 90,
		});
		expect(store.getLastNotification(inc.id)).toBeNull();
	});

	test("records a notification and retrieves it", () => {
		const inc = store.openIncident({
			metric: "cpu",
			volume: null,
			value: 95,
			threshold: 90,
		});
		store.recordNotification({
			incidentId: inc.id,
			type: "alert",
			succeeded: true,
		});
		const notif = store.getLastNotification(inc.id);
		expect(notif?.type).toBe("alert");
		expect(notif?.succeeded).toBe(1);
		expect(notif?.incident_id).toBe(inc.id);
	});

	test("getLastNotification returns the most recent notification", () => {
		const inc = store.openIncident({
			metric: "cpu",
			volume: null,
			value: 95,
			threshold: 90,
		});
		store.recordNotification({
			incidentId: inc.id,
			type: "alert",
			succeeded: true,
		});
		store.recordNotification({
			incidentId: inc.id,
			type: "reminder",
			succeeded: true,
		});
		expect(store.getLastNotification(inc.id)?.type).toBe("reminder");
	});

	test("records failed notifications with succeeded = 0", () => {
		const inc = store.openIncident({
			metric: "cpu",
			volume: null,
			value: 95,
			threshold: 90,
		});
		store.recordNotification({
			incidentId: inc.id,
			type: "alert",
			succeeded: false,
		});
		expect(store.getLastNotification(inc.id)?.succeeded).toBe(0);
	});
});

describe("listIncidents", () => {
	test("returns empty array when no incidents exist", () => {
		expect(store.listIncidents()).toEqual([]);
	});

	test("returns incidents newest first", () => {
		store.openIncident({
			metric: "cpu",
			volume: null,
			value: 95,
			threshold: 90,
		});
		store.openIncident({
			metric: "memory",
			volume: null,
			value: 92,
			threshold: 90,
		});
		const list = store.listIncidents();
		expect(list[0]?.metric).toBe("memory");
		expect(list[1]?.metric).toBe("cpu");
	});

	test("includes notification_count", () => {
		const inc = store.openIncident({
			metric: "cpu",
			volume: null,
			value: 95,
			threshold: 90,
		});
		store.recordNotification({
			incidentId: inc.id,
			type: "alert",
			succeeded: true,
		});
		store.recordNotification({
			incidentId: inc.id,
			type: "reminder",
			succeeded: true,
		});
		const list = store.listIncidents();
		expect(list[0]?.notification_count).toBe(2);
	});

	test("respects the limit parameter", () => {
		for (let i = 0; i < 5; i++)
			store.openIncident({
				metric: "cpu",
				volume: null,
				value: 95,
				threshold: 90,
			});
		expect(store.listIncidents(3)).toHaveLength(3);
	});
});

describe("getIncident", () => {
	test("returns null for a non-existent ID", () => {
		expect(store.getIncident(999)).toBeNull();
	});

	test("returns the incident with its notifications", () => {
		const inc = store.openIncident({
			metric: "disk",
			volume: "/dev/sda1",
			value: 96,
			threshold: 90,
		});
		store.recordNotification({
			incidentId: inc.id,
			type: "alert",
			succeeded: true,
		});
		store.recordNotification({
			incidentId: inc.id,
			type: "recovery",
			succeeded: true,
		});

		const detail = store.getIncident(inc.id);
		expect(detail?.metric).toBe("disk");
		expect(detail?.volume).toBe("/dev/sda1");
		expect(detail?.notifications).toHaveLength(2);
		expect(detail?.notifications[0]?.type).toBe("alert");
		expect(detail?.notifications[1]?.type).toBe("recovery");
	});
});
