import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	type BuildDeps,
	buildForTarget,
	buildTargets,
	main,
} from "../../../scripts/build";

// ── fixtures ──────────────────────────────────────────────────────────────────

const FAKE_OUTPUT_PATH = "/fake/dist/.tmp/src";

function makeDeps(overrides: Partial<BuildDeps> = {}): BuildDeps {
	return {
		build: mock(async () => ({
			success: true,
			outputs: [{ path: FAKE_OUTPUT_PATH }],
			logs: [],
		})) as unknown as typeof Bun.build,
		mkdirSync: mock(
			() => undefined,
		) as unknown as typeof import("node:fs").mkdirSync,
		renameSync: mock(
			() => undefined,
		) as unknown as typeof import("node:fs").renameSync,
		rmSync: mock(() => undefined) as unknown as typeof import("node:fs").rmSync,
		...overrides,
	};
}

// ── buildTargets ──────────────────────────────────────────────────────────────

describe("buildTargets", () => {
	test("returns exactly 6 targets", () => {
		expect(buildTargets()).toHaveLength(6);
	});

	test("includes all required platform/arch combos", () => {
		const targets = buildTargets();
		expect(targets).toContain("bun-linux-x64");
		expect(targets).toContain("bun-linux-arm64");
		expect(targets).toContain("bun-darwin-x64");
		expect(targets).toContain("bun-darwin-arm64");
		expect(targets).toContain("bun-windows-x64");
		expect(targets).toContain("bun-windows-arm64");
	});

	test("has no duplicates", () => {
		const targets = buildTargets();
		expect(new Set(targets).size).toBe(targets.length);
	});
});

// ── buildForTarget ────────────────────────────────────────────────────────────

describe("buildForTarget", () => {
	test("returns null on success", async () => {
		const deps = makeDeps();
		const result = await buildForTarget("bun-linux-x64", deps);
		expect(result).toBeNull();
	});

	test("calls renameSync with the output path and correct destination", async () => {
		const deps = makeDeps();
		await buildForTarget("bun-linux-x64", deps);
		expect(deps.renameSync).toHaveBeenCalledWith(
			FAKE_OUTPUT_PATH,
			"dist/bun-linux-x64",
		);
	});

	test("appends .exe for Windows targets", async () => {
		const deps = makeDeps();
		await buildForTarget("bun-windows-x64", deps);
		expect(deps.renameSync).toHaveBeenCalledWith(
			FAKE_OUTPUT_PATH,
			"dist/bun-windows-x64.exe",
		);
	});

	test("no extension for non-Windows targets", async () => {
		const deps = makeDeps();
		await buildForTarget("bun-darwin-arm64", deps);
		expect(deps.renameSync).toHaveBeenCalledWith(
			FAKE_OUTPUT_PATH,
			"dist/bun-darwin-arm64",
		);
	});

	test("creates tmpDir then removes it in finally", async () => {
		const deps = makeDeps();
		await buildForTarget("bun-linux-x64", deps);
		expect(deps.mkdirSync).toHaveBeenCalledWith("dist/.tmp-bun-linux-x64", {
			recursive: true,
		});
		expect(deps.rmSync).toHaveBeenCalledWith("dist/.tmp-bun-linux-x64", {
			recursive: true,
			force: true,
		});
	});

	test("cleans up tmpDir even when build fails", async () => {
		const deps = makeDeps({
			build: mock(async () => ({
				success: false,
				outputs: [],
				logs: [],
			})) as unknown as typeof Bun.build,
		});
		await buildForTarget("bun-linux-x64", deps);
		expect(deps.rmSync).toHaveBeenCalled();
	});

	test("returns error string when res.success is false", async () => {
		const deps = makeDeps({
			build: mock(async () => ({
				success: false,
				outputs: [],
				logs: [],
			})) as unknown as typeof Bun.build,
		});
		const result = await buildForTarget("bun-linux-x64", deps);
		expect(result).toContain("bun-linux-x64");
	});

	test("returns error string when no output is produced", async () => {
		const deps = makeDeps({
			build: mock(async () => ({
				success: true,
				outputs: [],
				logs: [],
			})) as unknown as typeof Bun.build,
		});
		const result = await buildForTarget("bun-linux-x64", deps);
		expect(result).toContain("No output produced");
	});

	test("returns error string when build throws", async () => {
		const deps = makeDeps({
			build: mock(async () => {
				throw new Error("bundle error");
			}) as unknown as typeof Bun.build,
		});
		const result = await buildForTarget("bun-linux-x64", deps);
		expect(result).toContain("bundle error");
	});
});

// ── main ──────────────────────────────────────────────────────────────────────

describe("main", () => {
	let origExit: typeof process.exit;

	beforeEach(() => {
		origExit = process.exit;
	});

	afterEach(() => {
		process.exit = origExit;
	});

	test("creates dist dir and logs success when all builds pass", async () => {
		const deps = makeDeps();
		await main(deps);
		expect(deps.mkdirSync).toHaveBeenCalledWith("dist", { recursive: true });
	});

	test("calls process.exit(1) when any build fails", async () => {
		let capturedCode: number | undefined;
		process.exit = ((code: number) => {
			capturedCode = code;
			throw new Error("__exit__");
		}) as unknown as typeof process.exit;

		const deps = makeDeps({
			build: mock(async () => ({
				success: false,
				outputs: [],
				logs: [],
			})) as unknown as typeof Bun.build,
		});

		await expect(main(deps)).rejects.toThrow("__exit__");
		expect(capturedCode).toBe(1);
	});
});
