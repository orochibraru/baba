import { describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LogsDeps } from "../../../src/lib/cli/logs";
import { defaultDeps, runLogs } from "../../../src/lib/cli/logs";

const LOG_PATH = "/var/lib/baba/baba.log";

const DEFAULT_TIME = 1751234567890;

function pinoLine(level: number, msg: string): string {
	return JSON.stringify({ level, time: DEFAULT_TIME, msg });
}

function makeDeps(
	overrides: Partial<LogsDeps> & { content?: string | null } = {},
): LogsDeps {
	const { content = pinoLine(30, "hello"), ...rest } = overrides;
	return {
		resolveLogPath: mock(async () => LOG_PATH),
		readFile: mock(async (_path: string) => content),
		getFileSize: mock(async (_path: string) => 0),
		readFrom: mock(
			async (_opts: { path: string; offset: number; length: number }) => "",
		),
		sleep: mock(async (_ms: number) => {}),
		...rest,
	};
}

describe("runLogs", () => {
	test("exits when log file does not exist", async () => {
		const deps = makeDeps({ content: null });
		const exitSpy = mock(() => {
			throw new Error("process.exit");
		});
		const original = process.exit.bind(process);
		process.exit = exitSpy as never;
		try {
			await expect(
				runLogs({ follow: false, lines: 100 }, deps),
			).rejects.toThrow("process.exit");
		} finally {
			process.exit = original;
		}
	});

	test("formats pino INFO line", async () => {
		const deps = makeDeps({ content: pinoLine(30, "Service is running") });
		const written: string[] = [];
		const orig = process.stdout.write.bind(process.stdout);
		process.stdout.write = ((s: string) => {
			written.push(s);
			return true;
		}) as never;
		try {
			await runLogs({ follow: false, lines: 100 }, deps);
		} finally {
			process.stdout.write = orig;
		}
		expect(written.join("")).toContain("[INFO] Service is running");
	});

	test("formats pino ERROR line", async () => {
		const deps = makeDeps({ content: pinoLine(50, "Something broke") });
		const written: string[] = [];
		const orig = process.stdout.write.bind(process.stdout);
		process.stdout.write = ((s: string) => {
			written.push(s);
			return true;
		}) as never;
		try {
			await runLogs({ follow: false, lines: 100 }, deps);
		} finally {
			process.stdout.write = orig;
		}
		expect(written.join("")).toContain("[ERROR] Something broke");
	});

	test("passes through non-JSON lines as-is", async () => {
		const deps = makeDeps({ content: "plain text line" });
		const written: string[] = [];
		const orig = process.stdout.write.bind(process.stdout);
		process.stdout.write = ((s: string) => {
			written.push(s);
			return true;
		}) as never;
		try {
			await runLogs({ follow: false, lines: 100 }, deps);
		} finally {
			process.stdout.write = orig;
		}
		expect(written.join("")).toContain("plain text line");
	});

	test("only shows last N lines", async () => {
		const content = [1, 2, 3, 4, 5]
			.map((i) => pinoLine(30, `msg ${i}`))
			.join("\n");
		const deps = makeDeps({ content });
		const written: string[] = [];
		const orig = process.stdout.write.bind(process.stdout);
		process.stdout.write = ((s: string) => {
			written.push(s);
			return true;
		}) as never;
		try {
			await runLogs({ follow: false, lines: 2 }, deps);
		} finally {
			process.stdout.write = orig;
		}
		const out = written.join("");
		expect(out).not.toContain("msg 1");
		expect(out).toContain("msg 4");
		expect(out).toContain("msg 5");
	});

	test("follow mode reads new content when file grows", async () => {
		const newLine = pinoLine(30, "new entry");
		let callCount = 0;
		const deps = makeDeps({
			content: "",
			getFileSize: mock(async () => {
				callCount++;
				// First call: no new content; second: grow by new line length
				return callCount === 1 ? 0 : newLine.length + 1;
			}),
			readFrom: mock(async () => `${newLine}\n`),
			sleep: mock(async () => {
				// Stop after second poll by throwing
				if (callCount >= 2) {
					throw new Error("stop");
				}
			}),
		});

		const written: string[] = [];
		const orig = process.stdout.write.bind(process.stdout);
		process.stdout.write = ((s: string) => {
			written.push(s);
			return true;
		}) as never;
		try {
			await expect(runLogs({ follow: true, lines: 100 }, deps)).rejects.toThrow(
				"stop",
			);
		} finally {
			process.stdout.write = orig;
		}
		expect(written.join("")).toContain("[INFO] new entry");
	});
});

describe("logs defaultDeps", () => {
	test("resolveLogPath falls back to the default path without a config", async () => {
		const saved = {
			path: process.env.DEFAULT_CONFIG_PATH,
			template: process.env.DEFAULT_CONFIG_TEMPLATE,
		};
		process.env.DEFAULT_CONFIG_PATH = "/nonexistent/baba/config.json";
		process.env.DEFAULT_CONFIG_TEMPLATE = "/nonexistent/baba/default.json";
		try {
			expect(await defaultDeps.resolveLogPath()).toBe("/var/lib/baba/baba.log");
		} finally {
			process.env.DEFAULT_CONFIG_PATH = saved.path;
			process.env.DEFAULT_CONFIG_TEMPLATE = saved.template;
		}
	});

	test("reads whole files, sizes and byte ranges", async () => {
		const dir = mkdtempSync(join(tmpdir(), "baba-logs-"));
		const path = join(dir, "baba.log");
		try {
			expect(await defaultDeps.readFile(path)).toBeNull();
			writeFileSync(path, "hello world");
			expect(await defaultDeps.readFile(path)).toBe("hello world");
			expect(await defaultDeps.getFileSize(path)).toBe(11);
			expect(await defaultDeps.readFrom({ path, offset: 6, length: 5 })).toBe(
				"world",
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("sleep resolves", async () => {
		await expect(defaultDeps.sleep(1)).resolves.toBeUndefined();
	});
});
