import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ── helpers ───────────────────────────────────────────────────────────────────

type RunResult = { stdout: string; stderr: string; exitCode: number };

type RunOpts = {
	os: string;
	arch: string;
	env?: Record<string, string>;
};

async function runInstall({ os, arch, env = {} }: RunOpts): Promise<RunResult> {
	const binDir = join(tmpdir(), `baba-install-test-${Date.now()}`);
	mkdirSync(binDir, { recursive: true });

	// Fake `uname` that answers -s and -m without touching the filesystem.
	writeFileSync(
		join(binDir, "uname"),
		[
			"#!/bin/sh",
			`if [ "$1" = "-s" ]; then echo "${os}"; fi`,
			`if [ "$1" = "-m" ]; then echo "${arch}"; fi`,
		].join("\n"),
	);
	chmodSync(join(binDir, "uname"), 0o755);

	try {
		const proc = Bun.spawn(["sh", "scripts/install.sh"], {
			cwd: process.cwd(),
			env: {
				...process.env,
				PATH: `${binDir}:${process.env.PATH ?? ""}`,
				DRY_RUN: "1",
				INSTALL_DIR: "/usr/local/bin",
				VERSION: "latest",
				...env,
			},
			stdout: "pipe",
			stderr: "pipe",
		});

		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		return { stdout, stderr, exitCode };
	} finally {
		rmSync(binDir, { recursive: true, force: true });
	}
}

// ── OS + arch detection ───────────────────────────────────────────────────────

describe("install.sh — OS and arch detection", () => {
	test("Linux x86_64 → baba-linux-x64", async () => {
		const { stdout, exitCode } = await runInstall({
			os: "Linux",
			arch: "x86_64",
		});
		expect(exitCode).toBe(0);
		expect(stdout).toContain("asset=baba-linux-x64");
	});

	test("Linux aarch64 → baba-linux-arm64", async () => {
		const { stdout, exitCode } = await runInstall({
			os: "Linux",
			arch: "aarch64",
		});
		expect(exitCode).toBe(0);
		expect(stdout).toContain("asset=baba-linux-arm64");
	});

	test("Linux arm64 → baba-linux-arm64", async () => {
		const { stdout, exitCode } = await runInstall({
			os: "Linux",
			arch: "arm64",
		});
		expect(exitCode).toBe(0);
		expect(stdout).toContain("asset=baba-linux-arm64");
	});

	test("Darwin arm64 → baba-darwin-arm64", async () => {
		const { stdout, exitCode } = await runInstall({
			os: "Darwin",
			arch: "arm64",
		});
		expect(exitCode).toBe(0);
		expect(stdout).toContain("asset=baba-darwin-arm64");
	});

	test("Darwin x86_64 → baba-darwin-x64", async () => {
		const { stdout, exitCode } = await runInstall({
			os: "Darwin",
			arch: "x86_64",
		});
		expect(exitCode).toBe(0);
		expect(stdout).toContain("asset=baba-darwin-x64");
	});

	test("unsupported OS exits 1 with message", async () => {
		const { stderr, exitCode } = await runInstall({
			os: "Windows_NT",
			arch: "x86_64",
		});
		expect(exitCode).toBe(1);
		expect(stderr).toContain("Unsupported OS");
	});

	test("unsupported arch exits 1 with message", async () => {
		const { stderr, exitCode } = await runInstall({
			os: "Linux",
			arch: "mips64",
		});
		expect(exitCode).toBe(1);
		expect(stderr).toContain("Unsupported architecture");
	});
});

// ── URL construction ──────────────────────────────────────────────────────────

describe("install.sh — URL construction", () => {
	test("latest builds a /releases/latest/download/ URL", async () => {
		const { stdout } = await runInstall({ os: "Linux", arch: "x86_64" });
		expect(stdout).toContain("/releases/latest/download/baba-linux-x64");
	});

	test("explicit VERSION builds a versioned /releases/download/vX.Y.Z/ URL", async () => {
		const { stdout, exitCode } = await runInstall({
			os: "Linux",
			arch: "x86_64",
			env: { VERSION: "1.2.3" },
		});
		expect(exitCode).toBe(0);
		expect(stdout).toContain("/releases/download/v1.2.3/baba-linux-x64");
	});
});

// ── environment overrides ─────────────────────────────────────────────────────

describe("install.sh — environment overrides", () => {
	test("INSTALL_DIR is reflected in dry-run output", async () => {
		const { stdout, exitCode } = await runInstall({
			os: "Linux",
			arch: "x86_64",
			env: { INSTALL_DIR: "/opt/bin" },
		});
		expect(exitCode).toBe(0);
		expect(stdout).toContain("install_dir=/opt/bin");
	});
});
