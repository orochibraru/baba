import { z } from "zod";

const DiscordNotifierSchema = z.object({
	type: z.literal("discord"),
	webhookUrl: z.url(
		'Must be a valid Discord webhook URL (e.g. "https://discord.com/api/webhooks/<id>/<token>")',
	),
});

const NotifierSchema = z.discriminatedUnion("type", [DiscordNotifierSchema]);

const CpuCheckSchema = z.object({
	enabled: z.boolean({ error: "Must be true or false" }).default(true),
	usageThresholdPercent: z
		.number({ error: "Must be a number" })
		.min(0, "Must be at least 0")
		.max(100, "Must be at most 100")
		.default(90),
	tempThresholdCelsius: z
		.number({ error: "Must be a number (temperature in °C)" })
		.positive("Must be a positive temperature in °C (e.g. 85)")
		.default(85),
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
});

export type LoadChecks = z.infer<typeof LoadCheckSchema>;

const MemoryCheckSchema = z.object({
	enabled: z.boolean({ error: "Must be true or false" }).default(true),
	usageThresholdPercent: z
		.number({ error: "Must be a number" })
		.min(0, "Must be at least 0")
		.max(100, "Must be at most 100")
		.default(90),
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
		.array(z.string({ error: 'Must be a volume name (e.g. "/dev/sda")' }), {
			error: "Must be an array of volume names",
		})
		.min(1, 'Must include at least one volume name (e.g. ["/dev/sda"])')
		.default(["/dev/sda"]),
});

export type DiskChecks = z.infer<typeof DiskCheckSchema>;

const ChecksSchema = z.object({
	cpu: CpuCheckSchema.default(CpuCheckSchema.parse({})),
	load: LoadCheckSchema.default(LoadCheckSchema.parse({})),
	memory: MemoryCheckSchema.default(MemoryCheckSchema.parse({})),
	disk: DiskCheckSchema.default(DiskCheckSchema.parse({})),
});

export type Checks = z.infer<typeof ChecksSchema>;

export const ConfigSchema = z.object({
	$schema: z.string().optional(),
	intervalSeconds: z
		.number({ error: "Must be a number" })
		.positive("Must be a positive number of seconds between checks (e.g. 60)")
		.default(60),
	checks: ChecksSchema.default(ChecksSchema.parse({})),
	notifiers: z
		.array(NotifierSchema, { error: "Must be an array of notifier objects" })
		.min(1, "At least one notifier must be configured"),
});

export type Config = z.infer<typeof ConfigSchema>;

export let config: Config;

export async function loadConfig(path = "./config.json"): Promise<Config> {
	console.log(`Loading config from ${path}...`);
	const file = Bun.file(path);
	if (!(await file.exists())) {
		throw new Error(
			`Config file not found at "${path}". Copy config.example.json to config.json and fill it in.`,
		);
	}
	console.log("Parsing config...");
	const raw = JSON.parse(await file.text()) as unknown;
	const result = ConfigSchema.safeParse(raw);
	if (!result.success) {
		const issues = result.error.issues
			.map((i) => `  • ${i.path.join(".")}: ${i.message}`)
			.join("\n");
		throw new Error(`Invalid config:\n${issues}`);
	}
	console.log("Config parsed successfully.");
	config = result.data;
	return config;
}
