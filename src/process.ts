import { type Config, loadConfig } from "./config";
import { getDb, initDb } from "./lib/db";
import { IncidentStore } from "./lib/incident-store";
import { logger } from "./lib/logger";
import { Monitor } from "./lib/monitor";

export class Process {
	private config: Config | undefined;
	private monitor: Monitor | undefined;
	private runCount: number = 0;
	private interval: NodeJS.Timeout | undefined;

	constructor() {
		void this.lazyInit();
	}

	private async lazyInit() {
		this.config = await loadConfig();
		initDb(this.config.database.path);
		this.monitor = new Monitor(new IncidentStore(getDb()));
	}

	private isOneOfTenRuns() {
		return this.runCount % 10 === 0;
	}

	public async start() {
		if (!this.monitor || !this.config) {
			throw new Error("Something went wrong when intializing the process");
		}

		try {
			logger.info("Starting up...");
			await this.monitor.runAllParallel();
			logger.info(
				`Service is running. Will check every ${this.config.intervalSeconds} seconds.`,
			);
		} catch (error) {
			console.error("Error during startup:", error);
			process.exit(1);
		}

		this.interval = setInterval(async () => {
			if (!this.monitor) {
				throw new Error("Something went wrong when intializing the process");
			}
			try {
				await this.monitor.runAllParallel();
				this.runCount++;
				if (this.isOneOfTenRuns()) {
					await this.monitor.refreshDisks();
				}
			} catch (error) {
				console.error("Error monitoring server:", error);
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
			console.error("Uncaught exception:", error);
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
