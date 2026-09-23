import { describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InstallDeps } from "../../../src/lib/cli/install";
import { defaultDeps, runInstall } from "../../../src/lib/cli/install";

function makeDeps(
	overrides: Partial<InstallDeps> = {},
	configExists = true,
): InstallDeps {
	return {
		platform: () => "darwin",
		configExists: mock(async (_path: string) => configExists),
		writeFile: mock(async () => {}),
		exec: mock(async () => ({ ok: true, out: "" })),
		mkdirSync: mock(() => {}),
		...overrides,
	};
}

describe("runInstall", () => {
	test("exits when config does not exist", async () => {
		const deps = makeDeps({}, false);
		const exitSpy = mock(() => {
			throw new Error("process.exit(1)");
		});
		const original = process.exit.bind(process);
		process.exit = exitSpy as never;
		try {
			await expect(runInstall(deps)).rejects.toThrow("process.exit(1)");
		} finally {
			process.exit = original;
		}
	});

	test("exits on unsupported platform", async () => {
		const deps = makeDeps({ platform: () => "win32" });
		const exitSpy = mock(() => {
			throw new Error("process.exit(1)");
		});
		const original = process.exit.bind(process);
		process.exit = exitSpy as never;
		try {
			expect(runInstall(deps)).rejects.toThrow("process.exit(1)");
		} finally {
			process.exit = original;
		}
	});

	describe("macOS", () => {
		test("writes plist and calls launchctl load", async () => {
			const deps = makeDeps({ platform: () => "darwin" });
			await runInstall(deps);

			const writeCalls = (deps.writeFile as ReturnType<typeof mock>).mock.calls;
			const plistWrite = writeCalls.find(([path]) =>
				(path as string).endsWith(".plist"),
			);
			expect(plistWrite).toBeDefined();
			expect(plistWrite?.[1]).toContain("com.orochibraru.baba");
			expect(plistWrite?.[1]).toContain("/usr/local/bin/baba");

			const execCalls = (deps.exec as ReturnType<typeof mock>).mock.calls;
			const loadCall = execCalls.find(([cmd]) =>
				(cmd as string[]).includes("load"),
			);
			expect(loadCall).toBeDefined();
			expect(loadCall?.[0]).toContain("launchctl");
		});

		test("throws when launchctl load fails", async () => {
			const deps = makeDeps({
				platform: () => "darwin",
				exec: mock(async (cmd: string[]) =>
					cmd.includes("load")
						? { ok: false, out: "load failed" }
						: { ok: true, out: "" },
				),
			});
			await expect(runInstall(deps)).rejects.toThrow("launchctl load failed");
		});
	});

	describe("Linux", () => {
		test("installs system service when sudo succeeds", async () => {
			const deps = makeDeps({ platform: () => "linux" });
			await runInstall(deps);

			const execCalls = (deps.exec as ReturnType<typeof mock>).mock.calls;
			const sudoCopy = execCalls.find(
				([cmd]) =>
					(cmd as string[]).includes("sudo") &&
					(cmd as string[]).includes("cp"),
			);
			expect(sudoCopy).toBeDefined();

			const enableCall = execCalls.find(
				([cmd]) =>
					(cmd as string[]).includes("sudo") &&
					(cmd as string[]).includes("enable"),
			);
			expect(enableCall).toBeDefined();
		});

		test("falls back to user service when sudo cp fails", async () => {
			const deps = makeDeps({
				platform: () => "linux",
				exec: mock(async (cmd: string[]) => {
					if (
						(cmd as string[]).includes("sudo") &&
						(cmd as string[]).includes("cp")
					) {
						return { ok: false, out: "permission denied" };
					}
					return { ok: true, out: "" };
				}),
			});
			await runInstall(deps);

			const writeCalls = (deps.writeFile as ReturnType<typeof mock>).mock.calls;
			const userUnit = writeCalls.find(([path]) =>
				(path as string).includes("systemd/user"),
			);
			expect(userUnit).toBeDefined();
			expect(userUnit?.[1]).toContain("WantedBy=default.target");

			const execCalls = (deps.exec as ReturnType<typeof mock>).mock.calls;
			const userEnable = execCalls.find(([cmd]) =>
				(cmd as string[]).includes("--user"),
			);
			expect(userEnable).toBeDefined();
		});

		test("throws when systemctl enable fails", async () => {
			const deps = makeDeps({
				platform: () => "linux",
				exec: mock(async (cmd: string[]) => {
					if ((cmd as string[]).includes("enable")) {
						return { ok: false, out: "enable failed" };
					}
					return { ok: true, out: "" };
				}),
			});
			expect(runInstall(deps)).rejects.toThrow("systemctl enable failed");
		});

		test("throws when systemctl start fails", async () => {
			const deps = makeDeps({
				platform: () => "linux",
				exec: mock(async (cmd: string[]) => {
					if ((cmd as string[]).includes("start")) {
						return { ok: false, out: "start failed" };
					}
					return { ok: true, out: "" };
				}),
			});
			expect(runInstall(deps)).rejects.toThrow("systemctl start failed");
		});

		test("throws when sudo daemon-reload fails", async () => {
			const deps = makeDeps({
				platform: () => "linux",
				exec: mock(async (cmd: string[]) =>
					cmd.includes("daemon-reload")
						? { ok: false, out: "reload failed" }
						: { ok: true, out: "" },
				),
			});
			await expect(runInstall(deps)).rejects.toThrow("daemon-reload failed");
		});

		// The user service path is taken when `sudo cp` fails.
		const failUserStep = (step: string) =>
			mock(async (cmd: string[]) =>
				(cmd.includes("sudo") && cmd.includes("cp")) ||
				(cmd.includes("--user") && cmd.includes(step))
					? { ok: false, out: `${step} failed` }
					: { ok: true, out: "" },
			);

		test("throws when user daemon-reload fails", async () => {
			const deps = makeDeps({
				platform: () => "linux",
				exec: failUserStep("daemon-reload"),
			});
			await expect(runInstall(deps)).rejects.toThrow("daemon-reload failed");
		});

		test("throws when user systemctl enable fails", async () => {
			const deps = makeDeps({
				platform: () => "linux",
				exec: failUserStep("enable"),
			});
			await expect(runInstall(deps)).rejects.toThrow("systemctl enable failed");
		});

		test("throws when user systemctl start fails", async () => {
			const deps = makeDeps({
				platform: () => "linux",
				exec: failUserStep("start"),
			});
			await expect(runInstall(deps)).rejects.toThrow("systemctl start failed");
		});
	});
});

describe("install defaultDeps", () => {
	test("writes files, creates directories and checks for the config", async () => {
		const dir = mkdtempSync(join(tmpdir(), "baba-install-"));
		const nested = join(dir, "a", "b");
		const file = join(nested, "unit.service");
		try {
			defaultDeps.mkdirSync(nested, { recursive: true });
			expect(existsSync(nested)).toBe(true);
			expect(await defaultDeps.configExists(file)).toBe(false);
			await defaultDeps.writeFile(file, "content");
			expect(readFileSync(file, "utf8")).toBe("content");
			expect(await defaultDeps.configExists(file)).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
