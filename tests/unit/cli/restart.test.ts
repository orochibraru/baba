import { describe, expect, mock, test } from "bun:test";
import type { RestartDeps } from "../../../src/lib/cli/restart";
import { runRestart } from "../../../src/lib/cli/restart";

function makeDeps(overrides: Partial<RestartDeps> = {}): RestartDeps {
	return {
		platform: () => "darwin",
		existsSync: mock(() => true),
		exec: mock(async () => ({ ok: true, out: "" })),
		uid: () => 501,
		...overrides,
	};
}

function withExitSpy(): {
	exitSpy: ReturnType<typeof mock>;
	restore: () => void;
} {
	const exitSpy = mock(() => {
		throw new Error("process.exit(1)");
	});
	const original = process.exit.bind(process);
	process.exit = exitSpy as never;
	return {
		exitSpy,
		restore: () => {
			process.exit = original;
		},
	};
}

describe("runRestart", () => {
	test("exits on unsupported platform", async () => {
		const deps = makeDeps({ platform: () => "win32" });
		const { restore } = withExitSpy();
		try {
			await expect(runRestart(deps)).rejects.toThrow("process.exit(1)");
		} finally {
			restore();
		}
	});

	describe("macOS", () => {
		test("kickstarts the launchd service", async () => {
			const deps = makeDeps({ platform: () => "darwin", uid: () => 501 });
			await runRestart(deps);

			const execCalls = (deps.exec as ReturnType<typeof mock>).mock.calls;
			const kickstart = execCalls.find(([cmd]) =>
				(cmd as string[]).includes("kickstart"),
			);
			expect(kickstart).toBeDefined();
			const kickstartCmd = kickstart?.[0] as string[];
			expect(kickstartCmd).toContain("launchctl");
			expect(kickstartCmd.join(" ")).toContain("gui/501/com.orochibraru.baba");
		});

		test("exits when no service is installed", async () => {
			const deps = makeDeps({
				platform: () => "darwin",
				existsSync: mock(() => false),
			});
			const { restore } = withExitSpy();
			try {
				await expect(runRestart(deps)).rejects.toThrow("process.exit(1)");
			} finally {
				restore();
			}
		});

		test("throws when kickstart fails", async () => {
			const deps = makeDeps({
				platform: () => "darwin",
				exec: mock(async () => ({ ok: false, out: "kickstart failed" })),
			});
			await expect(runRestart(deps)).rejects.toThrow(
				"launchctl kickstart failed",
			);
		});
	});

	describe("Linux", () => {
		test("restarts the system service when the system unit exists", async () => {
			const deps = makeDeps({
				platform: () => "linux",
				existsSync: mock((path: string) => path.includes("/etc/systemd")),
			});
			await runRestart(deps);

			const execCalls = (deps.exec as ReturnType<typeof mock>).mock.calls;
			const restart = execCalls.find(
				([cmd]) =>
					(cmd as string[]).includes("sudo") &&
					(cmd as string[]).includes("restart"),
			);
			expect(restart).toBeDefined();
		});

		test("restarts the user service when only the user unit exists", async () => {
			const deps = makeDeps({
				platform: () => "linux",
				existsSync: mock((path: string) => path.includes("systemd/user")),
			});
			await runRestart(deps);

			const execCalls = (deps.exec as ReturnType<typeof mock>).mock.calls;
			const restart = execCalls.find(([cmd]) =>
				(cmd as string[]).includes("--user"),
			);
			expect(restart).toBeDefined();
		});

		test("exits when neither unit exists", async () => {
			const deps = makeDeps({
				platform: () => "linux",
				existsSync: mock(() => false),
			});
			const { restore } = withExitSpy();
			try {
				await expect(runRestart(deps)).rejects.toThrow("process.exit(1)");
			} finally {
				restore();
			}
		});

		test("throws when systemctl restart fails", async () => {
			const deps = makeDeps({
				platform: () => "linux",
				existsSync: mock((path: string) => path.includes("/etc/systemd")),
				exec: mock(async () => ({ ok: false, out: "restart failed" })),
			});
			await expect(runRestart(deps)).rejects.toThrow(
				"systemctl restart failed",
			);
		});
	});
});
