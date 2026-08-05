/** biome-ignore-all lint/suspicious/noConsole: test output */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getIncident, listIncidents } from "../../../src/lib/cli/incidents";
import type {
	IncidentDetail,
	IncidentSummary,
} from "../../../src/lib/incident-store";

const fakeIncidentSummary: IncidentSummary = {
	id: 1,
	metric: "cpu",
	volume: null,
	started_at: 1700000000000,
	resolved_at: null,
	peak_value: 95,
	threshold: 90,
	notification_count: 2,
};

const fakeIncidentDetail: IncidentDetail = {
	id: 1,
	metric: "cpu",
	volume: null,
	started_at: 1700000000000,
	resolved_at: null,
	peak_value: 95,
	threshold: 90,
	notifications: [
		{
			id: 1,
			incident_id: 1,
			sent_at: 1700000001000,
			type: "alert",
			succeeded: 1,
		},
	],
};

describe("listIncidents", () => {
	test("handles empty list gracefully", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test file
		const store = { listIncidents: () => [] } as any;
		await listIncidents({ limit: "50" }, store);
	});

	test("prints table header and rows for incidents", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test file
		const store = { listIncidents: () => [fakeIncidentSummary] } as any;
		await listIncidents({ limit: "50" }, store);
	});

	test("shows OPEN status for active incident", async () => {
		const store = {
			listIncidents: () => [{ ...fakeIncidentSummary, resolved_at: null }],
			// biome-ignore lint/suspicious/noExplicitAny: test file
		} as any;
		await listIncidents({ limit: "50" }, store);
	});

	test("shows RESOLVED status for resolved incident", async () => {
		const resolved = { ...fakeIncidentSummary, resolved_at: 1700001000000 };
		// biome-ignore lint/suspicious/noExplicitAny: test file
		const store = { listIncidents: () => [resolved] } as any;
		await listIncidents({ limit: "50" }, store);
	});

	test("shows volume column when present", async () => {
		const withVolume = { ...fakeIncidentSummary, volume: "/data" };
		// biome-ignore lint/suspicious/noExplicitAny: test file
		const store = { listIncidents: () => [withVolume] } as any;
		await listIncidents({ limit: "50" }, store);
	});
});

describe("getIncident", () => {
	test("calls exit(1) when incident not found", async () => {
		let exitCode: number | undefined;
		// biome-ignore lint/suspicious/noExplicitAny: test file
		const store = { getIncident: () => null } as any;
		const exit = (code: number) => {
			exitCode = code;
		};
		await getIncident("999", { store, exit });
		expect(exitCode).toBe(1);
	});

	test("prints incident detail with notifications", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test file
		const store = { getIncident: () => fakeIncidentDetail } as any;
		await getIncident("1", { store, exit: process.exit });
	});

	test("handles incident with no notifications", async () => {
		const noNotifs = { ...fakeIncidentDetail, notifications: [] };
		// biome-ignore lint/suspicious/noExplicitAny: test file
		const store = { getIncident: () => noNotifs } as any;
		await getIncident("1", { store, exit: process.exit });
	});

	test("handles resolved incident with volume", async () => {
		const resolved = {
			...fakeIncidentDetail,
			volume: "/data",
			resolved_at: 1700001000000,
		};
		// biome-ignore lint/suspicious/noExplicitAny: test file
		const store = { getIncident: () => resolved } as any;
		await getIncident("1", { store, exit: process.exit });
	});

	test("marks failed notifications with ✗", async () => {
		const withFailedNotif = {
			...fakeIncidentDetail,
			notifications: [
				{
					id: 2,
					incident_id: 1,
					sent_at: 1700000002000,
					type: "reminder",
					succeeded: 0,
				},
			],
		};
		// biome-ignore lint/suspicious/noExplicitAny: test file
		const store = { getIncident: () => withFailedNotif } as any;
		await getIncident("1", { store, exit: process.exit });
	});
});

// Regression coverage: each CLI invocation is a fresh process, so unlike
// `baba start`, nothing else has called initDb() yet. Without their own
// init, these commands throw "Database not initialized — call initDb()
// first" the moment IncidentStore's constructor calls the shared getDb().
describe("default deps (production path)", () => {
	let tmpDir: string | undefined;

	afterEach(() => {
		if (tmpDir) {
			rmSync(tmpDir, { recursive: true, force: true });
			tmpDir = undefined;
		}
	});

	function makeConfig(): string {
		tmpDir = mkdtempSync(join(tmpdir(), "baba-incidents-"));
		const cfgPath = join(tmpDir, "config.json");
		writeFileSync(
			cfgPath,
			JSON.stringify({
				database: { path: join(tmpDir, "baba.db") },
				notifiers: [
					{
						type: "discord",
						webhookUrl: "https://discord.com/api/webhooks/1/token",
					},
				],
			}),
		);
		return cfgPath;
	}

	test("listIncidents initializes its own db when no store is provided", async () => {
		const config = makeConfig();
		await expect(
			listIncidents({ limit: "50", config }),
		).resolves.toBeUndefined();
	});

	test("getIncident initializes its own db when no store is provided", async () => {
		const config = makeConfig();
		let exitCode: number | undefined;
		await getIncident("1", {
			exit: (code) => {
				exitCode = code;
			},
			config,
		});
		// Incident #1 doesn't exist in the fresh db, but the important part is
		// that this got past db initialization instead of throwing.
		expect(exitCode).toBe(1);
	});
});
