const dbCfg = { database: { path: ":memory:" } };
mock.module("../../src/config", () => ({
	config: dbCfg,
	getConfig: () => dbCfg,
}));

import { Database } from "bun:sqlite";
import { describe, expect, mock, test } from "bun:test";
import { getDb, initDb } from "../../src/lib/db";

describe("initDb", () => {
	test("creates the incidents table", () => {
		const db = initDb();
		const row = db
			.query(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='incidents'",
			)
			.get() as { name: string } | null;
		expect(row?.name).toBe("incidents");
	});

	test("creates the notifications table", () => {
		const db = initDb();
		const row = db
			.query(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'",
			)
			.get() as { name: string } | null;
		expect(row?.name).toBe("notifications");
	});

	test("is idempotent — calling twice does not throw", () => {
		expect(() => {
			initDb();
			initDb();
		}).not.toThrow();
	});

	test("returns the database instance", () => {
		const db = initDb();
		expect(db).toBeInstanceOf(Database);
	});
});

describe("getDb", () => {
	test("returns the same instance that initDb set up", () => {
		const db = initDb();
		expect(getDb()).toBe(db);
	});
});
