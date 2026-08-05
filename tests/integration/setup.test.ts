/**
 * Docker integration test: builds the Linux binary, spins up an ubuntu:22.04
 * container via testcontainers, runs `baba setup` with piped answers, and
 * verifies that config.json is written correctly and the binary is functional.
 *
 * Requires:
 *   - Docker daemon running
 *   - dist/bun-linux-x64 built (bun run build)
 *
 * Skipped automatically when the binary is absent or no container runtime
 * (Docker/Podman/etc.) is reachable — e.g. in sandboxed dev environments.
 */

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { GenericContainer, getContainerRuntimeClient } from "testcontainers";

// Match the host arch so OrbStack / Docker Desktop runs the binary natively.
// arm64 on Apple Silicon → bun-linux-arm64; x64 everywhere else → bun-linux-x64.
const LINUX_ARCH = process.arch === "arm64" ? "arm64" : "x64";
const BINARY_PATH = `dist/bun-linux-${LINUX_ARCH}`;

// testcontainers' UnixSocketStrategy hardcodes /var/run/docker.sock. On boxes
// running OrbStack/Colima/Rancher Desktop instead of Docker Desktop, that path
// can be a stale leftover symlink (exists, but nothing is listening) while the
// real socket lives elsewhere — so the strategy "finds" a socket and fails to
// connect instead of falling through. Point DOCKER_HOST at whatever `docker`
// itself considers the active context before asking testcontainers to look.
function useActiveDockerContext(): void {
	if (process.env.DOCKER_HOST) {
		return;
	}
	try {
		const proc = Bun.spawnSync([
			"docker",
			"context",
			"inspect",
			"--format",
			"{{.Endpoints.docker.Host}}",
		]);
		const host = proc.stdout.toString().trim();
		if (proc.exitCode === 0 && host) {
			process.env.DOCKER_HOST = host;
		}
	} catch {
		// `docker` CLI not installed — leave testcontainers to its own strategies.
	}
}

async function hasContainerRuntime(): Promise<boolean> {
	useActiveDockerContext();
	try {
		await getContainerRuntimeClient();
		return true;
	} catch {
		return false;
	}
}

const SKIP = !existsSync(BINARY_PATH) || !(await hasContainerRuntime());

// ── Prompt answer sequence ────────────────────────────────────────────────────
//
// 21 answers: machine name + 3 general + discord y + url + telegram n
//             + all check defaults (14 prompts for cpu/load/mem/disk/temp/gpu)
//
// Any remaining prompts (if binary asks more than expected) get "" via EOF.

const MACHINE_NAME = "test-docker-server";
const WEBHOOK_URL = "https://discord.com/api/webhooks/99999/test-token";

function buildAnswers(): string {
	const lines = [
		MACHINE_NAME, // machineName
		"", // intervalSeconds (60)
		"", // reminderIntervalMinutes (30)
		"", // database.path
		"y", // Discord? yes
		WEBHOOK_URL, // Discord webhook URL
		"n", // Telegram? no
		"",
		"",
		"", // cpu: enabled, threshold, breaches
		"",
		"",
		"", // load: enabled, threshold, breaches
		"",
		"",
		"", // memory: enabled, threshold, breaches
		"",
		"",
		"", // disk: enabled, threshold, volumes
		"", // temperature: disabled (default N)
		"", // gpu: disabled (default N)
	];
	return lines.join("\n");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// keep-alive so exec() doesn't fail with "container not running"
const KEEP_ALIVE = ["sh", "-c", "tail -f /dev/null"];

describe.skipIf(SKIP)("baba setup (Docker integration)", () => {
	test("binary runs on ubuntu:22.04 and setup writes valid config.json", async () => {
		const container = await new GenericContainer("ubuntu:22.04")
			.withCommand(KEEP_ALIVE)
			.withCopyFilesToContainer([
				{ source: BINARY_PATH, target: "/usr/local/bin/baba" },
			])
			.start();

		try {
			// Make executable + smoke-test: version flag exits 0
			const version = await container.exec([
				"sh",
				"-c",
				"chmod +x /usr/local/bin/baba && baba --version 2>&1",
			]);
			if (version.exitCode !== 0) {
				const ldd = await container.exec([
					"sh",
					"-c",
					"ldd /usr/local/bin/baba 2>&1 || true",
				]);
				throw new Error(
					`baba --version failed (exit ${version.exitCode}): ${version.output}\nldd: ${ldd.output}`,
				);
			}

			// Run interactive setup with piped answers.
			// The trailing `sleep 5` keeps stdin open so Bun doesn't exit on EOF
			// before readline has finished processing all answers asynchronously.
			const answers = buildAnswers();
			const answerArgs = answers
				.split("\n")
				.map((l) => (l === "" ? "''" : `'${l.replace(/'/g, "'\\''")}'`))
				.join(" ");
			const setupCmd = `(printf '%s\\n' ${answerArgs}; sleep 5) | baba setup --config /tmp/config.json 2>&1`;
			const setupResult = await container.exec(["sh", "-c", setupCmd]);
			if (setupResult.exitCode !== 0) {
				throw new Error(
					`baba setup failed (exit ${setupResult.exitCode}):\n${setupResult.output}`,
				);
			}

			// Read back config.json
			const cat = await container.exec(["cat", "/tmp/config.json"]);
			if (cat.exitCode !== 0) {
				const ls = await container.exec(["ls", "-la", "/tmp/"]);
				throw new Error(
					`config.json not found (cat exit ${cat.exitCode})\nls /tmp:\n${ls.output}\nsetup output:\n${setupResult.output}`,
				);
			}

			const config = JSON.parse(cat.output) as {
				machineName: string;
				intervalSeconds: number;
				reminderIntervalMinutes: number;
				notifiers: { type: string; webhookUrl: string }[];
				checks: {
					cpu: { enabled: boolean };
					disk: { volumes: string[] };
				};
			};

			expect(config.machineName).toBe(MACHINE_NAME);
			expect(config.intervalSeconds).toBe(60);
			expect(config.reminderIntervalMinutes).toBe(30);
			expect(config.notifiers).toHaveLength(1);
			expect(config.notifiers[0]?.type).toBe("discord");
			expect(config.notifiers[0]?.webhookUrl).toBe(WEBHOOK_URL);
			expect(config.checks.cpu.enabled).toBe(true);
			expect(config.checks.disk.volumes).toContain("/");
		} finally {
			await container.stop();
		}
	}, 120_000);

	test("setup preserves existing config when run a second time with defaults", async () => {
		const container = await new GenericContainer("ubuntu:22.04")
			.withCommand(KEEP_ALIVE)
			.withCopyFilesToContainer([
				{ source: BINARY_PATH, target: "/usr/local/bin/baba" },
			])
			.start();

		try {
			await container.exec(["chmod", "+x", "/usr/local/bin/baba"]);

			const runSetup = async (answers: string) => {
				const args = answers
					.split("\n")
					.map((l) => (l === "" ? "''" : `'${l.replace(/'/g, "'\\''")}'`))
					.join(" ");
				return container.exec([
					"sh",
					"-c",
					`(printf '%s\\n' ${args}; sleep 5) | baba setup --config /tmp/config.json 2>&1`,
				]);
			};

			// First run — write initial config
			await runSetup(buildAnswers());

			// Second run — accept all defaults (all empty = keep existing values)
			await runSetup(Array(25).fill("").join("\n"));

			const cat = await container.exec(["cat", "/tmp/config.json"]);
			const config = JSON.parse(cat.output) as {
				machineName: string;
				notifiers: { type: string }[];
			};

			// Machine name from first run preserved via defaults
			expect(config.machineName).toBe(MACHINE_NAME);
			// Discord notifier preserved (existing default was Y)
			expect(config.notifiers.find((n) => n.type === "discord")).toBeDefined();
		} finally {
			await container.stop();
		}
	}, 120_000);
});
