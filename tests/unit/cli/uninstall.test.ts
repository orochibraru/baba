import { describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UninstallDeps } from "../../../src/lib/cli/uninstall";
import { defaultDeps, runUninstall } from "../../../src/lib/cli/uninstall";

function makeDeps(overrides: Partial<UninstallDeps> = {}): UninstallDeps {
	return {
		platform: () => "darwin",
		existsSync: mock(() => true),
		exec: mock(async () => ({ ok: true, out: "" })),
		rm: mock(() => {}),
		...overrides,
	};
}

describe("runUninstall", () => {
	test("prints a message and returns on unsupported platform", async () => {
		const deps = makeDeps({ platform: () => "win32" });
		await runUninstall({}, deps);
		expect(deps.rm).not.toHaveBeenCalled();
	});

	describe("macOS", () => {
		test("unloads and removes the plist", async () => {
			const deps = makeDeps({ platform: () => "darwin" });
			await runUninstall({}, deps);

			const execCalls = (deps.exec as ReturnType<typeof mock>).mock.calls;
			const unload = execCalls.find(([cmd]) =>
				(cmd as string[]).includes("unload"),
			);
			expect(unload).toBeDefined();

			const rmCalls = (deps.rm as ReturnType<typeof mock>).mock.calls;
			const plistRm = rmCalls.find(([path]) =>
				(path as string).endsWith(".plist"),
			);
			expect(plistRm).toBeDefined();
		});

		test("does nothing when no plist is installed", async () => {
			const deps = makeDeps({
				platform: () => "darwin",
				existsSync: mock(() => false),
			});
			await runUninstall({}, deps);
			expect(deps.exec).not.toHaveBeenCalled();
		});

		test("leaves config/data in place without --purge", async () => {
			const deps = makeDeps({ platform: () => "darwin" });
			await runUninstall({}, deps);
			const rmCalls = (deps.rm as ReturnType<typeof mock>).mock.calls;
			expect(rmCalls.some(([path]) => path === "/var/lib/baba")).toBe(false);
		});

		test("removes /var/lib/baba when --purge is passed", async () => {
			const deps = makeDeps({ platform: () => "darwin" });
			await runUninstall({ purge: true }, deps);
			const rmCalls = (deps.rm as ReturnType<typeof mock>).mock.calls;
			const purgeRm = rmCalls.find(([path]) => path === "/var/lib/baba");
			expect(purgeRm).toBeDefined();
			expect(purgeRm?.[1]).toEqual({ recursive: true, force: true });
		});
	});

	describe("Linux", () => {
		test("stops, disables, and removes the system unit", async () => {
			const deps = makeDeps({
				platform: () => "linux",
				existsSync: mock((path: string) => path.includes("/etc/systemd")),
			});
			await runUninstall({}, deps);

			const execCalls = (deps.exec as ReturnType<typeof mock>).mock.calls;
			expect(
				execCalls.some(
					([cmd]) =>
						(cmd as string[]).includes("sudo") &&
						(cmd as string[]).includes("stop"),
				),
			).toBe(true);
			expect(
				execCalls.some(
					([cmd]) =>
						(cmd as string[]).includes("sudo") &&
						(cmd as string[]).includes("disable"),
				),
			).toBe(true);
			expect(
				execCalls.some(
					([cmd]) =>
						(cmd as string[]).includes("sudo") &&
						(cmd as string[]).includes("rm"),
				),
			).toBe(true);
		});

		test("stops, disables, and removes the user unit", async () => {
			const deps = makeDeps({
				platform: () => "linux",
				existsSync: mock((path: string) => path.includes("systemd/user")),
			});
			await runUninstall({}, deps);

			const execCalls = (deps.exec as ReturnType<typeof mock>).mock.calls;
			expect(
				execCalls.some(([cmd]) => (cmd as string[]).includes("--user")),
			).toBe(true);

			const rmCalls = (deps.rm as ReturnType<typeof mock>).mock.calls;
			expect(
				rmCalls.some(([path]) => (path as string).includes("systemd/user")),
			).toBe(true);
		});

		test("removes both when system and user units both exist", async () => {
			const deps = makeDeps({
				platform: () => "linux",
				existsSync: mock(() => true),
			});
			await runUninstall({}, deps);

			const execCalls = (deps.exec as ReturnType<typeof mock>).mock.calls;
			expect(
				execCalls.some(
					([cmd]) =>
						(cmd as string[]).includes("sudo") &&
						(cmd as string[]).includes("stop"),
				),
			).toBe(true);
			expect(
				execCalls.some(([cmd]) => (cmd as string[]).includes("--user")),
			).toBe(true);
		});

		test("reports nothing to do when neither unit exists", async () => {
			const written: string[] = [];
			const orig = process.stdout.write.bind(process.stdout);
			process.stdout.write = ((s: string) => {
				written.push(s);
				return true;
			}) as never;
			try {
				const deps = makeDeps({
					platform: () => "linux",
					existsSync: mock(() => false),
				});
				await runUninstall({}, deps);
				expect(written.join("")).toContain("nothing to do");
			} finally {
				process.stdout.write = orig;
			}
		});
	});
});

describe("uninstall defaultDeps", () => {
	test("rm removes a directory recursively", () => {
		const dir = mkdtempSync(join(tmpdir(), "baba-uninstall-"));
		mkdirSync(join(dir, "nested"));
		defaultDeps.rm(dir, { recursive: true, force: true });
		expect(existsSync(dir)).toBe(false);
	});
});
