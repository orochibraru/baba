let dbPath = ":memory:";
mock.module("../../src/config", () => ({
	getConfig: () => ({ database: { path: dbPath } }),
}));

import { Database } from "bun:sqlite";
import { describe, expect, mock, test } from "bun:test";
import { rmSync } from "node:fs";
import { getDb, initDb } from "../../src/lib/db";

describe("getDb before init", () => {
	test("throws when called before initDb", () => {
		expect(() => getDb()).toThrow("Database not initialized");
	});
});

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

	test("creates parent directory and db file when path is not :memory:", () => {
		const TMP_DIR = "/tmp/baba-db-test-dir";
		dbPath = `${TMP_DIR}/test.db`;
		try {
			const db = initDb();
			expect(db).toBeInstanceOf(Database);
		} finally {
			dbPath = ":memory:";
			rmSync(TMP_DIR, { recursive: true, force: true });
		}
	});
});

describe("getDb", () => {
	test("returns the same instance that initDb set up", () => {
		const db = initDb();
		expect(getDb()).toBe(db);
	});
});
