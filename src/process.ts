import packagejson from "../package.json";
import { type Config, loadConfig } from "./config";
import { getLatestVersion, isNewerVersion } from "./lib/cli/update";
import { initDb } from "./lib/db";
import { logger } from "./lib/logger";
import { Monitor } from "./lib/monitor/index";
import { Notifiers } from "./lib/notifiers";

export class Process {
	private config: Config | undefined;
	private monitor: Monitor | undefined;
	private interval: NodeJS.Timeout | undefined;

	constructor(private configPath = "/var/lib/baba/config.json") {
		void this.lazyInit();
	}

	private async lazyInit() {
		this.config = await loadConfig(this.configPath);
		initDb();
		this.monitor = new Monitor();
	}

	private async checkForUpdates(): Promise<void> {
		const latest = await getLatestVersion();
		if (latest && isNewerVersion(latest, packagejson.version)) {
			const notifiers = new Notifiers();
			await notifiers.alert(
				`baba v${latest} is available (you're on v${packagejson.version}). Run \`baba update\` to upgrade.`,
			);
		}
	}

	public async start() {
		if (!this.monitor || !this.config) {
			throw new Error("Something went wrong when intializing the process");
		}

		if (this.config.updates.notifyEnabled) {
			void this.checkForUpdates();
		}

		try {
			logger.info("Starting up...");
			await this.monitor.runAllParallel();
			logger.info(
				`Service is running. Will check every ${this.config.intervalSeconds} seconds.`,
			);
		} catch (error) {
			logger.error(`Error during startup: ${JSON.stringify(error)}`);
			process.exit(1);
		}

		this.interval = setInterval(async () => {
			if (!this.monitor) {
				throw new Error("Something went wrong when intializing the process");
			}
			try {
				await this.monitor.runAllParallel();
			} catch (error) {
				logger.error(`Error monitoring server: ${JSON.stringify(error)}`);
			}
		}, this.config.intervalSeconds * 1000);

		process.on("SIGINT", () => {
			this.shutdown();
		});

		process.on("SIGTERM", () => {
			this.shutdown();
		});

		process.on("uncaughtException", (error) => {
			this.shutdown();
			logger.error(`Uncaught exception: ${JSON.stringify(error)}`);
			process.exit(1);
		});
	}

	public shutdown() {
		logger.info("Shutting down...");
		if (this.interval) {
			clearInterval(this.interval);
		}
		process.exit(0);
	}
}
