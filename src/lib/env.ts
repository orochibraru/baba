export type EnvVarType = "string" | "number" | "boolean" | "csv" | "json";

export type EnvVarDef = {
	path: string[];
	type: EnvVarType;
	description: string;
	default: string;
	example?: string;
};

export const ENV_VARS: Record<string, EnvVarDef> = {
	// ── Top-level ─────────────────────────────────────────────────────────────
	BABA_LOG_LEVEL: {
		path: ["logLevel"],
		type: "string",
		description:
			"Log verbosity. One of: `trace`, `debug`, `info`, `warn`, `error`.",
		default: "info",
		example: "debug",
	},
	BABA_MACHINE_NAME: {
		path: ["machineName"],
		type: "string",
		description:
			"Display name for this machine, prepended to every alert message.",
		default: "(system hostname)",
		example: "nas-01",
	},
	BABA_INTERVAL_SECONDS: {
		path: ["intervalSeconds"],
		type: "number",
		description: "Seconds between monitor check cycles.",
		default: "60",
		example: "30",
	},
	BABA_REMINDER_INTERVAL_MINUTES: {
		path: ["reminderIntervalMinutes"],
		type: "number",
		description: "Minutes before re-alerting for an ongoing incident.",
		default: "30",
		example: "60",
	},
	BABA_DATABASE_PATH: {
		path: ["database", "path"],
		type: "string",
		description: "Path to the SQLite incident database.",
		default: "./tmp/baba.db",
		example: "/data/baba.db",
	},
	// ── CPU ───────────────────────────────────────────────────────────────────
	BABA_CPU_ENABLED: {
		path: ["checks", "cpu", "enabled"],
		type: "boolean",
		description: "Enable CPU usage monitoring.",
		default: "true",
	},
	BABA_CPU_THRESHOLD: {
		path: ["checks", "cpu", "usageThresholdPercent"],
		type: "number",
		description: "CPU usage % that triggers an alert.",
		default: "90",
		example: "80",
	},
	BABA_CPU_CONSECUTIVE_BREACHES: {
		path: ["checks", "cpu", "consecutiveBreaches"],
		type: "number",
		description: "Consecutive high readings before opening a CPU incident.",
		default: "3",
	},

	// ── Load ──────────────────────────────────────────────────────────────────
	BABA_LOAD_ENABLED: {
		path: ["checks", "load", "enabled"],
		type: "boolean",
		description: "Enable system load-average monitoring.",
		default: "true",
	},
	BABA_LOAD_THRESHOLD: {
		path: ["checks", "load", "threshold"],
		type: "number",
		description:
			"1-minute load average that triggers an alert. Rule of thumb: number of CPU cores.",
		default: "8",
		example: "4",
	},
	BABA_LOAD_CONSECUTIVE_BREACHES: {
		path: ["checks", "load", "consecutiveBreaches"],
		type: "number",
		description: "Consecutive high readings before opening a load incident.",
		default: "3",
	},

	// ── Memory ────────────────────────────────────────────────────────────────
	BABA_MEMORY_ENABLED: {
		path: ["checks", "memory", "enabled"],
		type: "boolean",
		description: "Enable memory usage monitoring.",
		default: "true",
	},
	BABA_MEMORY_THRESHOLD: {
		path: ["checks", "memory", "usageThresholdPercent"],
		type: "number",
		description: "Memory usage % that triggers an alert.",
		default: "90",
		example: "85",
	},
	BABA_MEMORY_CONSECUTIVE_BREACHES: {
		path: ["checks", "memory", "consecutiveBreaches"],
		type: "number",
		description: "Consecutive high readings before opening a memory incident.",
		default: "3",
	},

	// ── Disk ──────────────────────────────────────────────────────────────────
	BABA_DISK_ENABLED: {
		path: ["checks", "disk", "enabled"],
		type: "boolean",
		description: "Enable disk usage monitoring.",
		default: "true",
	},
	BABA_DISK_THRESHOLD: {
		path: ["checks", "disk", "usageThresholdPercent"],
		type: "number",
		description: "Disk usage % that triggers an alert.",
		default: "90",
		example: "85",
	},
	BABA_DISK_VOLUMES: {
		path: ["checks", "disk", "volumes"],
		type: "csv",
		description: "Comma-separated mount points to monitor.",
		default: "/",
		example: "/,/data",
	},

	// ── Temperature ───────────────────────────────────────────────────────────
	BABA_TEMP_ENABLED: {
		path: ["checks", "temperature", "enabled"],
		type: "boolean",
		description:
			"Enable temperature monitoring (CPU + all GPUs). Off by default; most values are null on macOS.",
		default: "false",
	},
	BABA_TEMP_CPU_THRESHOLD: {
		path: ["checks", "temperature", "cpuThresholdCelsius"],
		type: "number",
		description: "CPU temperature (°C) that triggers an alert.",
		default: "85",
		example: "80",
	},
	BABA_TEMP_GPU_THRESHOLD: {
		path: ["checks", "temperature", "gpuThresholdCelsius"],
		type: "number",
		description: "GPU temperature (°C) that triggers an alert.",
		default: "85",
		example: "80",
	},
	BABA_TEMP_CONSECUTIVE_BREACHES: {
		path: ["checks", "temperature", "consecutiveBreaches"],
		type: "number",
		description:
			"Consecutive high readings before opening a temperature incident.",
		default: "3",
	},

	// ── GPU utilization ───────────────────────────────────────────────────────
	BABA_GPU_ENABLED: {
		path: ["checks", "gpu", "enabled"],
		type: "boolean",
		description:
			"Enable GPU utilization monitoring. Off by default; metrics unavailable on macOS.",
		default: "false",
	},
	BABA_GPU_THRESHOLD: {
		path: ["checks", "gpu", "vramThresholdPercent"],
		type: "number",
		description: "GPU utilization % that triggers an alert.",
		default: "90",
		example: "85",
	},
	BABA_GPU_CONSECUTIVE_BREACHES: {
		path: ["checks", "gpu", "consecutiveBreaches"],
		type: "number",
		description: "Consecutive high readings before opening a GPU incident.",
		default: "3",
	},
};
