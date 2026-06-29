import { hostname } from "node:os";
import { z } from "zod";
import { ENV_VARS, type EnvVarType } from "./lib/env";
import { logger, setLogLevel } from "./lib/logger";
import { discordNotifierSchema } from "./lib/notifiers/discord";
import { telegramNotifierSchema } from "./lib/notifiers/telegram";

// To add a new notifier:
//   1. Create src/lib/notifiers/<name>.ts — export its Zod schema and class
//   2. Import the schema here and add it to the array below
//   3. Add an instantiation branch in src/lib/notifiers/index.ts
const NotifierSchema = z.discriminatedUnion(
	"type",
	[discordNotifierSchema, telegramNotifierSchema],
	{
		error: (issue) =>
			`Unknown notifier type "${(issue.input as Record<string, unknown>)?.type}". Registered types: discord, telegram`,
	},
);

const consecutiveBreachesField = z
	.number({ error: "Must be a number" })
	.int("Must be a whole number")
	.min(1, "Must be at least 1")
	.default(3);

const CpuCheckSchema = z.object({
	enabled: z.boolean({ error: "Must be true or false" }).default(true),
	usageThresholdPercent: z
		.number({ error: "Must be a number" })
		.min(0, "Must be at least 0")
		.max(100, "Must be at most 100")
		.default(90),
	consecutiveBreaches: consecutiveBreachesField,
});

export type CpuChecks = z.infer<typeof CpuCheckSchema>;

const LoadCheckSchema = z.object({
	enabled: z.boolean({ error: "Must be true or false" }).default(true),
	threshold: z
		.number({ error: "Must be a number" })
		.positive(
			"Must be a positive number representing the 1-minute load average (number of processes competing for CPU). A good rule of thumb: set to the number of CPU cores on your machine (e.g. 8.0 for an 8-core system)",
		)
		.default(8.0),
	consecutiveBreaches: consecutiveBreachesField,
});

export type LoadChecks = z.infer<typeof LoadCheckSchema>;

const MemoryCheckSchema = z.object({
	enabled: z.boolean({ error: "Must be true or false" }).default(true),
	usageThresholdPercent: z
		.number({ error: "Must be a number" })
		.min(0, "Must be at least 0")
		.max(100, "Must be at most 100")
		.default(90),
	consecutiveBreaches: consecutiveBreachesField,
});

export type MemoryChecks = z.infer<typeof MemoryCheckSchema>;

const DiskCheckSchema = z.object({
	enabled: z.boolean({ error: "Must be true or false" }).default(true),
	usageThresholdPercent: z
		.number({ error: "Must be a number" })
		.min(0, "Must be at least 0")
		.max(100, "Must be at most 100")
		.default(90),
	volumes: z
		.array(z.string({ error: 'Must be a mount point (e.g. "/" or "/data")' }), {
			error: "Must be an array of mount points",
		})
		.min(1, 'Must include at least one mount point (e.g. ["/"])')
		.default(["/"]),
});

export type DiskChecks = z.infer<typeof DiskCheckSchema>;

const TemperatureCheckSchema = z.object({
	enabled: z.boolean({ error: "Must be true or false" }).default(false),
	cpuThresholdCelsius: z
		.number({ error: "Must be a number (temperature in °C)" })
		.positive("Must be a positive temperature in °C (e.g. 85)")
		.default(85),
	gpuThresholdCelsius: z
		.number({ error: "Must be a number (temperature in °C)" })
		.positive("Must be a positive temperature in °C (e.g. 85)")
		.default(85),
	consecutiveBreaches: consecutiveBreachesField,
});

export type TemperatureChecks = z.infer<typeof TemperatureCheckSchema>;

const GpuCheckSchema = z.object({
	enabled: z.boolean({ error: "Must be true or false" }).default(false),
	vramThresholdPercent: z
		.number({ error: "Must be a number" })
		.min(0, "Must be at least 0")
		.max(100, "Must be at most 100")
		.default(90),
	consecutiveBreaches: consecutiveBreachesField,
});

export type GpuChecks = z.infer<typeof GpuCheckSchema>;

const ChecksSchema = z.object({
	cpu: CpuCheckSchema.default(CpuCheckSchema.parse({})),
	load: LoadCheckSchema.default(LoadCheckSchema.parse({})),
	memory: MemoryCheckSchema.default(MemoryCheckSchema.parse({})),
	disk: DiskCheckSchema.default(DiskCheckSchema.parse({})),
	temperature: TemperatureCheckSchema.default(TemperatureCheckSchema.parse({})),
	gpu: GpuCheckSchema.default(GpuCheckSchema.parse({})),
});

export type Checks = z.infer<typeof ChecksSchema>;

const DatabaseSchema = z.object({
	path: z
		.string({ error: "Must be a string" })
		.min(1, "Database path cannot be empty")
		.default("./tmp/baba.db"),
});

export const ConfigSchema = z.object({
	$schema: z.string().optional(),
	machineName: z
		.string({ error: "Must be a string" })
		.min(1, "Machine name cannot be empty")
		.default(() => hostname()),
	logLevel: z
		.enum(["trace", "debug", "info", "warn", "error"], {
			error: 'Must be one of: "trace", "debug", "info", "warn", "error"',
		})
		.default("info"),
	intervalSeconds: z
		.number({ error: "Must be a number" })
		.positive("Must be a positive number of seconds between checks (e.g. 60)")
		.default(60),
	reminderIntervalMinutes: z
		.number({ error: "Must be a number" })
		.positive(
			"Must be a positive number of minutes between re-alerts for ongoing incidents (e.g. 30)",
		)
		.default(30),
	database: DatabaseSchema.default(DatabaseSchema.parse({})),
	checks: ChecksSchema.default(ChecksSchema.parse({})),
	notifiers: z
		.array(NotifierSchema, { error: "Must be an array of notifier objects" })
		.min(1, "At least one notifier must be configured"),
});

export type Config = z.infer<typeof ConfigSchema>;

let config: Config;

// ── Environment variable helpers ─────────────────────────────────────────────

function coerceEnv(value: string, type: EnvVarType): unknown {
	switch (type) {
		case "number":
			return Number(value);
		case "boolean":
			return value === "true" || value === "1";
		case "csv":
			return value
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
		case "json":
			return JSON.parse(value);
		default:
			return value;
	}
}

type SetPathOpts = {
	obj: Record<string, unknown>;
	path: string[];
	value: unknown;
};
function setPath({ obj, path, value }: SetPathOpts): void {
	let cur = obj;
	for (let i = 0; i < path.length - 1; i++) {
		const key = path[i] ?? "";
		if (typeof cur[key] !== "object" || cur[key] === null) cur[key] = {};
		cur = cur[key] as Record<string, unknown>;
	}
	const last = path[path.length - 1] ?? "";
	cur[last] = value;
}

function applyEnvOverrides(raw: Record<string, unknown>): void {
	for (const [name, def] of Object.entries(ENV_VARS)) {
		const val = process.env[name];
		if (val == null || val === "") continue;
		try {
			setPath({ obj: raw, path: def.path, value: coerceEnv(val, def.type) });
			logger.debug(`Env override applied: ${name}`);
		} catch {
			logger.warn(`Invalid value for ${name}="${val}", ignoring.`);
		}
	}
}

// ── loadConfig ────────────────────────────────────────────────────────────────

export async function loadConfig(path = "./config.json"): Promise<Config> {
	logger.debug(`Loading config from ${path}...`);
	const file = Bun.file(path);
	let raw: Record<string, unknown> = {};
	if (await file.exists()) {
		logger.debug("Parsing config...");
		raw = JSON.parse(await file.text()) as Record<string, unknown>;
	} else {
		logger.info(
			`No config file at "${path}", relying on environment variables.`,
		);
	}
	applyEnvOverrides(raw);
	const result = ConfigSchema.safeParse(raw);
	if (!result.success) {
		const issues = result.error.issues
			.map((i) => `  • ${i.path.join(".")}: ${i.message}`)
			.join("\n");
		throw new Error(`Invalid config:\n${issues}`);
	}
	config = result.data;
	setLogLevel(config.logLevel);
	logger.debug("Config parsed successfully.");
	return config;
}

export function getConfig(): Config {
	/* c8 ignore next 3 */
	if (!config) {
		throw new Error("Config not loaded — call loadConfig() first");
	}
	return config;
}

export function isConfigLoaded(): boolean {
	return !!config;
}
