import { open, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadConfig } from "../../config";

const DEFAULT_LOG_PATH = "/var/lib/baba/baba.log";

export type LogsDeps = {
	resolveLogPath: () => Promise<string>;
	readFile: (path: string) => Promise<string | null>;
	getFileSize: (path: string) => Promise<number>;
	readFrom: (opts: {
		path: string;
		offset: number;
		length: number;
	}) => Promise<string>;
	sleep: (ms: number) => Promise<void>;
};

const defaultDeps: LogsDeps = {
	resolveLogPath: async () => {
		try {
			const config = await loadConfig();
			return join(dirname(config.database.path), "baba.log");
		} catch {
			return DEFAULT_LOG_PATH;
		}
	},
	readFile: async (path) => {
		const f = Bun.file(path);
		if (!(await f.exists())) {
			return null;
		}
		return f.text();
	},
	getFileSize: async (path) => (await stat(path)).size,
	readFrom: async ({ path, offset, length }) => {
		const f = await open(path, "r");
		try {
			const buf = Buffer.alloc(length);
			await f.read(buf, 0, length, offset);
			return buf.toString("utf8");
		} finally {
			await f.close();
		}
	},
	sleep: (ms) => Bun.sleep(ms),
};

const LEVEL_NAMES: Record<number, string> = {
	10: "TRACE",
	20: "DEBUG",
	30: "INFO",
	40: "WARN",
	50: "ERROR",
	60: "FATAL",
};

function formatLine(raw: string): string {
	try {
		const entry = JSON.parse(raw) as Record<string, unknown>;
		const levelNum = entry.level as number;
		const level = LEVEL_NAMES[levelNum] ?? String(levelNum);
		const time = new Date(entry.time as number)
			.toISOString()
			.replace("T", " ")
			.replace("Z", "");
		const msg = entry.msg as string;
		return `${time} [${level}] ${msg}`;
	} catch {
		return raw;
	}
}

export async function runLogs(
	opts: { follow: boolean; lines: number },
	deps: LogsDeps = defaultDeps,
): Promise<void> {
	const logPath = await deps.resolveLogPath();
	const content = await deps.readFile(logPath);

	if (content === null) {
		process.stdout.write(
			`No log file at ${logPath}.\nRun 'baba install' to set up the background service.\n`,
		);
		process.exit(1);
	}

	const allLines = content.split("\n").filter(Boolean);
	const tail = allLines.slice(-opts.lines);
	for (const line of tail) {
		process.stdout.write(`${formatLine(line)}\n`);
	}

	if (!opts.follow) {
		return;
	}

	let position = await deps.getFileSize(logPath);
	let partial = "";

	while (true) {
		await deps.sleep(200);
		const size = await deps.getFileSize(logPath);
		if (size <= position) {
			continue;
		}

		const chunk = await deps.readFrom({
			path: logPath,
			offset: position,
			length: size - position,
		});
		position = size;

		const combined = partial + chunk;
		const parts = combined.split("\n");
		partial = parts.pop() ?? "";

		for (const line of parts) {
			if (line) {
				process.stdout.write(`${formatLine(line)}\n`);
			}
		}
	}
}
