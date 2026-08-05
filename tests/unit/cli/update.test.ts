import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UpdateDeps } from "../../../src/lib/cli/update";
import {
	getLatestVersion,
	isNewerVersion,
	resolveMarkerPath,
	runUpdate,
} from "../../../src/lib/cli/update";

const NEWER_VERSION = "99.0.0";

function fakeResponse(opts: {
	ok: boolean;
	status: number;
	body?: Uint8Array;
}): Response {
	const body = opts.body ?? new Uint8Array();
	return {
		ok: opts.ok,
		status: opts.status,
		arrayBuffer: async () => body.buffer as ArrayBuffer,
	} as Response;
}

function makeDeps(overrides: Partial<UpdateDeps> = {}): UpdateDeps {
	return {
		getLatestVersion: mock(async () => NEWER_VERSION),
		fetch: mock(async () =>
			fakeResponse({ ok: true, status: 200, body: new Uint8Array([1, 2, 3]) }),
		) as unknown as typeof fetch,
		gunzipSync: mock(() => new Uint8Array([4, 5, 6])),
		writeFile: mock(async () => {}),
		spawnSync: mock(() => ({ exitCode: 0 })),
		resolveMarkerPath: mock(async () => "/var/lib/baba/.just_updated"),
		...overrides,
	};
}

async function captureStdout(fn: () => Promise<void>): Promise<string> {
	const written: string[] = [];
	const orig = process.stdout.write.bind(process.stdout);
	process.stdout.write = ((s: string) => {
		written.push(s);
		return true;
	}) as never;
	try {
		await fn();
	} finally {
		process.stdout.write = orig;
	}
	return written.join("");
}

describe("runUpdate", () => {
	test("stops when getLatestVersion can't reach GitHub", async () => {
		const deps = makeDeps({ getLatestVersion: mock(async () => null) });
		const output = await captureStdout(() => runUpdate(deps));
		expect(output).toContain("Could not reach GitHub releases");
		expect(deps.fetch).not.toHaveBeenCalled();
	});

	test("stops when already up to date", async () => {
		const deps = makeDeps({ getLatestVersion: mock(async () => "0.0.1") });
		const output = await captureStdout(() => runUpdate(deps));
		expect(output).toContain("Already up to date");
		expect(deps.fetch).not.toHaveBeenCalled();
	});

	test("downloads the .gz asset for the current platform/arch", async () => {
		const deps = makeDeps();
		await runUpdate(deps);

		const fetchMock = deps.fetch as unknown as ReturnType<typeof mock>;
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const url = fetchMock.mock.calls[0]?.[0] as string;
		expect(url).toContain(`v${NEWER_VERSION}`);
		expect(url).toMatch(/\.gz$/);
	});

	test("decompresses the downloaded bytes before writing", async () => {
		const compressed = new Uint8Array([9, 9, 9]);
		const decompressed = new Uint8Array([7, 7, 7]);
		const deps = makeDeps({
			fetch: mock(async () =>
				fakeResponse({ ok: true, status: 200, body: compressed }),
			) as unknown as typeof fetch,
			gunzipSync: mock(() => decompressed),
		});
		await runUpdate(deps);

		const gunzipMock = deps.gunzipSync as ReturnType<typeof mock>;
		expect(gunzipMock).toHaveBeenCalledTimes(1);
		expect(gunzipMock.mock.calls[0]?.[0]).toEqual(compressed);

		const writeMock = deps.writeFile as ReturnType<typeof mock>;
		const binaryWrite = writeMock.mock.calls.find((c) =>
			(c[0] as string).startsWith("/tmp/baba-update-"),
		);
		expect(binaryWrite?.[1]).toEqual(decompressed);
	});

	test("reports a failure when the download request throws", async () => {
		const deps = makeDeps({
			fetch: mock(async () => {
				throw new Error("network unreachable");
			}) as unknown as typeof fetch,
		});
		const output = await captureStdout(() => runUpdate(deps));
		expect(output).toContain("Download failed");
		expect(deps.gunzipSync).not.toHaveBeenCalled();
	});

	test("reports a failure on a non-OK download response", async () => {
		const deps = makeDeps({
			fetch: mock(async () =>
				fakeResponse({ ok: false, status: 404 }),
			) as unknown as typeof fetch,
		});
		const output = await captureStdout(() => runUpdate(deps));
		expect(output).toContain("Download failed");
		expect(output).toContain("404");
	});

	test("reports a failure when the downloaded asset is not valid gzip", async () => {
		const deps = makeDeps({
			gunzipSync: mock(() => {
				throw new Error("incorrect header check");
			}),
		});
		const output = await captureStdout(() => runUpdate(deps));
		expect(output).toContain("Failed to decompress");
		expect(deps.writeFile).not.toHaveBeenCalled();
	});

	test("reports a failure when chmod +x fails", async () => {
		const deps = makeDeps({
			spawnSync: mock((cmd: string[]) =>
				cmd[0] === "chmod" ? { exitCode: 1 } : { exitCode: 0 },
			),
		});
		const output = await captureStdout(() => runUpdate(deps));
		expect(output).toContain("Failed to make binary executable");
	});

	test("falls back to sudo mv when a plain mv fails", async () => {
		const deps = makeDeps({
			spawnSync: mock((cmd: string[]) =>
				cmd[0] === "mv" ? { exitCode: 1 } : { exitCode: 0 },
			),
		});
		await runUpdate(deps);

		const spawnMock = deps.spawnSync as ReturnType<typeof mock>;
		const calls = spawnMock.mock.calls.map((c) => c[0] as string[]);
		expect(calls.some((c) => c[0] === "sudo" && c[1] === "mv")).toBe(true);
	});

	test("reports a failure when both mv and sudo mv fail", async () => {
		const deps = makeDeps({
			spawnSync: mock((cmd: string[]) =>
				cmd[0] === "chmod" ? { exitCode: 0 } : { exitCode: 1 },
			),
		});
		const output = await captureStdout(() => runUpdate(deps));
		expect(output).toContain("Failed to replace binary");
	});

	test("writes the update marker after a successful update", async () => {
		const deps = makeDeps();
		await runUpdate(deps);

		const writeMock = deps.writeFile as ReturnType<typeof mock>;
		const markerWrite = writeMock.mock.calls.find(
			(c) => c[0] === "/var/lib/baba/.just_updated",
		);
		expect(markerWrite).toBeDefined();
	});
});

describe("getLatestVersion", () => {
	afterEach(() => {
		mock.restore();
	});

	test("returns the tag name with the leading v stripped", async () => {
		spyOn(globalThis, "fetch").mockImplementation(
			(async () =>
				new Response(JSON.stringify({ tag_name: "v2.5.0" }), {
					status: 200,
				})) as unknown as typeof fetch,
		);
		expect(await getLatestVersion()).toBe("2.5.0");
	});

	test("returns null when the response is not ok", async () => {
		spyOn(globalThis, "fetch").mockImplementation(
			(async () =>
				new Response("", {
					status: 500,
					statusText: "boom",
				})) as unknown as typeof fetch,
		);
		expect(await getLatestVersion()).toBeNull();
	});

	test("returns null when fetch throws an Error", async () => {
		spyOn(globalThis, "fetch").mockImplementation((async () => {
			throw new Error("network unreachable");
		}) as unknown as typeof fetch);
		expect(await getLatestVersion()).toBeNull();
	});

	test("returns null when fetch throws a non-Error", async () => {
		spyOn(globalThis, "fetch").mockImplementation((async () => {
			throw "boom";
		}) as unknown as typeof fetch);
		expect(await getLatestVersion()).toBeNull();
	});
});

describe("isNewerVersion", () => {
	test("true when the major version is higher", () => {
		expect(isNewerVersion("2.0.0", "1.9.9")).toBe(true);
	});

	test("false when the major version is lower", () => {
		expect(isNewerVersion("1.0.0", "2.0.0")).toBe(false);
	});

	test("true when the minor version is higher", () => {
		expect(isNewerVersion("1.5.0", "1.4.9")).toBe(true);
	});

	test("false when the minor version is lower", () => {
		expect(isNewerVersion("1.4.0", "1.5.0")).toBe(false);
	});

	test("true when only the patch version is higher", () => {
		expect(isNewerVersion("1.0.5", "1.0.4")).toBe(true);
	});

	test("false when versions are equal", () => {
		expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
	});
});

describe("resolveMarkerPath", () => {
	let tmpDir: string | undefined;

	afterEach(() => {
		if (tmpDir) {
			rmSync(tmpDir, { recursive: true, force: true });
			tmpDir = undefined;
		}
		delete process.env.DEFAULT_CONFIG_PATH;
	});

	test("derives the marker path from the configured database directory", async () => {
		tmpDir = mkdtempSync(join(tmpdir(), "baba-update-"));
		const dbPath = join(tmpDir, "data.sqlite");
		writeFileSync(
			join(tmpDir, "config.json"),
			JSON.stringify({
				database: { path: dbPath },
				notifiers: [
					{
						type: "discord",
						webhookUrl: "https://discord.com/api/webhooks/1/token",
					},
				],
			}),
		);
		process.env.DEFAULT_CONFIG_PATH = join(tmpDir, "config.json");

		expect(await resolveMarkerPath()).toBe(join(tmpDir, ".just_updated"));
	});

	test("falls back to the default path when no config can be loaded", async () => {
		tmpDir = mkdtempSync(join(tmpdir(), "baba-update-missing-"));
		process.env.DEFAULT_CONFIG_PATH = join(tmpDir, "nonexistent-config.json");
		expect(await resolveMarkerPath()).toBe("/var/lib/baba/.just_updated");
	});
});
