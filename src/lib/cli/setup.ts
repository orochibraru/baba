import { readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { createInterface } from "node:readline";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SetupDeps = {
	prompt(question: string): Promise<string>;
	readExisting(path: string): string | null;
	writeConfig(path: string, content: string): void;
};

type SetupArgs = {
	configPath: string;
	deps: SetupDeps;
};

// ── Prompt helpers ────────────────────────────────────────────────────────────

type Asker = {
	str(label: string, def: string): Promise<string>;
	num(label: string, def: number): Promise<number>;
	bool(label: string, def: boolean): Promise<boolean>;
};

function makeAsker(prompt: SetupDeps["prompt"]): Asker {
	return {
		async str(label, def) {
			const answer = await prompt(`  ${label} [${def}]: `);
			return answer.trim() || def;
		},
		async num(label, def) {
			const answer = await prompt(`  ${label} [${def}]: `);
			const t = answer.trim();
			if (!t) return def;
			const n = Number(t);
			if (Number.isNaN(n)) {
				process.stdout.write(`  Invalid number — using ${def}\n`);
				return def;
			}
			return n;
		},
		async bool(label, def) {
			const hint = def ? "Y/n" : "y/N";
			const answer = await prompt(`  ${label} [${hint}]: `);
			const t = answer.trim().toLowerCase();
			if (!t) return def;
			return t === "y" || t === "yes";
		},
	};
}

function section(title: string): void {
	process.stdout.write(
		`\n── ${title} ${"─".repeat(Math.max(0, 53 - title.length))}\n`,
	);
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function setup({ configPath, deps }: SetupArgs): Promise<void> {
	let base: Record<string, unknown> = {};
	const raw = deps.readExisting(configPath);
	if (raw) {
		try {
			base = JSON.parse(raw) as Record<string, unknown>;
			process.stdout.write(
				`\nFound existing config at ${configPath} — press Enter to keep current values.\n`,
			);
		} catch {
			process.stdout.write(
				`\nCould not parse ${configPath}, starting fresh.\n`,
			);
		}
	} else {
		process.stdout.write(
			`\nNo config at ${configPath} — creating a new one.\n`,
		);
	}

	const ask = makeAsker(deps.prompt);

	const checks = (base.checks as Record<string, unknown>) ?? {};
	const cpu = (checks.cpu as Record<string, unknown>) ?? {};
	const load = (checks.load as Record<string, unknown>) ?? {};
	const memory = (checks.memory as Record<string, unknown>) ?? {};
	const disk = (checks.disk as Record<string, unknown>) ?? {};
	const temperature = (checks.temperature as Record<string, unknown>) ?? {};
	const gpu = (checks.gpu as Record<string, unknown>) ?? {};
	const database = (base.database as Record<string, unknown>) ?? {};
	const existingNotifiers = Array.isArray(base.notifiers)
		? (base.notifiers as Record<string, unknown>[])
		: [];
	const existingDiscord = existingNotifiers.find((n) => n.type === "discord") as
		| Record<string, unknown>
		| undefined;
	const existingTelegram = existingNotifiers.find(
		(n) => n.type === "telegram",
	) as Record<string, unknown> | undefined;

	// ── General ───────────────────────────────────────────────────────────────

	section("General");
	const machineName = await ask.str(
		"Machine name",
		String(base.machineName ?? hostname()),
	);
	const intervalSeconds = await ask.num(
		"Check interval (seconds)",
		Number(base.intervalSeconds ?? 60),
	);
	const reminderIntervalMinutes = await ask.num(
		"Reminder interval (minutes)",
		Number(base.reminderIntervalMinutes ?? 30),
	);
	const databasePath = await ask.str(
		"Database path",
		String(database.path ?? "/var/lib/baba/baba.db"),
	);

	// ── Notifiers ─────────────────────────────────────────────────────────────

	section("Notifiers");
	const notifiers: unknown[] = [];

	const addDiscord = await ask.bool(
		"Set up Discord notifier?",
		!!existingDiscord,
	);
	if (addDiscord) {
		const webhookUrl = await ask.str(
			"Webhook URL (Channel Settings → Integrations → Webhooks)",
			String(existingDiscord?.webhookUrl ?? ""),
		);
		if (webhookUrl) notifiers.push({ type: "discord", webhookUrl });
	}

	const addTelegram = await ask.bool(
		"Set up Telegram notifier?",
		!!existingTelegram,
	);
	if (addTelegram) {
		const botToken = await ask.str(
			"Bot token (from @BotFather)",
			String(existingTelegram?.botToken ?? ""),
		);
		const chatId = await ask.str(
			"Chat ID (user ID, group ID prefixed with -, or @channel)",
			String(existingTelegram?.chatId ?? ""),
		);
		if (botToken && chatId)
			notifiers.push({ type: "telegram", botToken, chatId });
	}

	// ── Checks ────────────────────────────────────────────────────────────────

	section("Checks");

	const cpuEnabled = await ask.bool(
		"CPU monitoring enabled?",
		(cpu.enabled as boolean | undefined) ?? true,
	);
	const cpuThreshold = cpuEnabled
		? await ask.num(
				"  CPU usage threshold (%)",
				Number(cpu.usageThresholdPercent ?? 90),
			)
		: 90;
	const cpuBreaches = cpuEnabled
		? await ask.num(
				"  Consecutive breaches before alert",
				Number(cpu.consecutiveBreaches ?? 3),
			)
		: 3;

	const loadEnabled = await ask.bool(
		"Load average monitoring enabled?",
		(load.enabled as boolean | undefined) ?? true,
	);
	const loadThreshold = loadEnabled
		? await ask.num(
				"  Load threshold (tip: # of CPU cores)",
				Number(load.threshold ?? 8),
			)
		: 8;
	const loadBreaches = loadEnabled
		? await ask.num(
				"  Consecutive breaches before alert",
				Number(load.consecutiveBreaches ?? 3),
			)
		: 3;

	const memEnabled = await ask.bool(
		"Memory monitoring enabled?",
		(memory.enabled as boolean | undefined) ?? true,
	);
	const memThreshold = memEnabled
		? await ask.num(
				"  Memory usage threshold (%)",
				Number(memory.usageThresholdPercent ?? 90),
			)
		: 90;
	const memBreaches = memEnabled
		? await ask.num(
				"  Consecutive breaches before alert",
				Number(memory.consecutiveBreaches ?? 3),
			)
		: 3;

	const diskEnabled = await ask.bool(
		"Disk monitoring enabled?",
		(disk.enabled as boolean | undefined) ?? true,
	);
	const diskThreshold = diskEnabled
		? await ask.num(
				"  Disk usage threshold (%)",
				Number(disk.usageThresholdPercent ?? 90),
			)
		: 90;
	const diskVolumesRaw = diskEnabled
		? await ask.str(
				"  Volumes to monitor (comma-separated)",
				Array.isArray(disk.volumes)
					? (disk.volumes as string[]).join(", ")
					: "/",
			)
		: "/";
	const diskVolumes = diskVolumesRaw
		.split(",")
		.map((v) => v.trim())
		.filter(Boolean);

	const tempEnabled = await ask.bool(
		"Temperature monitoring enabled? (Linux / hwmon)",
		(temperature.enabled as boolean | undefined) ?? false,
	);
	const tempCpuC = tempEnabled
		? await ask.num(
				"  CPU threshold (°C)",
				Number(temperature.cpuThresholdCelsius ?? 85),
			)
		: 85;
	const tempGpuC = tempEnabled
		? await ask.num(
				"  GPU threshold (°C)",
				Number(temperature.gpuThresholdCelsius ?? 85),
			)
		: 85;
	const tempBreaches = tempEnabled
		? await ask.num(
				"  Consecutive breaches before alert",
				Number(temperature.consecutiveBreaches ?? 3),
			)
		: 3;

	const gpuEnabled = await ask.bool(
		"GPU VRAM monitoring enabled? (Linux / with GPU)",
		(gpu.enabled as boolean | undefined) ?? false,
	);
	const gpuThreshold = gpuEnabled
		? await ask.num(
				"  VRAM usage threshold (%)",
				Number(gpu.vramThresholdPercent ?? 90),
			)
		: 90;
	const gpuBreaches = gpuEnabled
		? await ask.num(
				"  Consecutive breaches before alert",
				Number(gpu.consecutiveBreaches ?? 3),
			)
		: 3;

	// ── Write ─────────────────────────────────────────────────────────────────

	const config = {
		$schema:
			"https://raw.githubusercontent.com/orochibraru/baba/refs/heads/main/schema/config.schema.json",
		machineName,
		logLevel: String(base.logLevel ?? "info"),
		intervalSeconds,
		reminderIntervalMinutes,
		database: { path: databasePath },
		checks: {
			cpu: {
				enabled: cpuEnabled,
				usageThresholdPercent: cpuThreshold,
				consecutiveBreaches: cpuBreaches,
			},
			load: {
				enabled: loadEnabled,
				threshold: loadThreshold,
				consecutiveBreaches: loadBreaches,
			},
			memory: {
				enabled: memEnabled,
				usageThresholdPercent: memThreshold,
				consecutiveBreaches: memBreaches,
			},
			disk: {
				enabled: diskEnabled,
				usageThresholdPercent: diskThreshold,
				volumes: diskVolumes,
			},
			temperature: {
				enabled: tempEnabled,
				cpuThresholdCelsius: tempCpuC,
				gpuThresholdCelsius: tempGpuC,
				consecutiveBreaches: tempBreaches,
			},
			gpu: {
				enabled: gpuEnabled,
				vramThresholdPercent: gpuThreshold,
				consecutiveBreaches: gpuBreaches,
			},
		},
		notifiers,
	};

	deps.writeConfig(configPath, `${JSON.stringify(config, null, "\t")}\n`);

	process.stdout.write(`\nConfig written to ${configPath}\n`);
	if (notifiers.length === 0) {
		process.stdout.write(
			"Warning: no notifiers configured — run 'baba setup' again or set BABA_NOTIFIERS_DISCORD_WEBHOOK_URL.\n",
		);
	} else {
		process.stdout.write(
			"Run 'baba validate' to test your notifiers, then 'baba start' to begin monitoring.\n",
		);
	}
}

export async function runSetup(configPath: string): Promise<void> {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	// Use the async iterator instead of rl.question — Bun's rl.question has a
	// bug with piped stdin where it stops reading after ~2 lines.
	const iter = rl[Symbol.asyncIterator]();
	const prompt = async (question: string): Promise<string> => {
		process.stdout.write(question);
		const result = await iter.next();
		return result.done ? "" : result.value;
	};
	try {
		await setup({
			configPath,
			deps: {
				prompt,
				readExisting: (path) => {
					try {
						return readFileSync(path, "utf-8");
					} catch {
						return null;
					}
				},
				writeConfig: (path, content) => writeFileSync(path, content, "utf-8"),
			},
		});
	} finally {
		rl.close();
		process.stdin.destroy();
	}
}
