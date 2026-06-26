import { loadConfig } from "./config";
import { Monitor } from "./lib/monitor";

const config = await loadConfig();

const monitor = new Monitor();

async function startup() {
	console.log("Starting up...");
	return monitor.runAllParallel();
}

try {
	await startup();
	console.log("Alerterr started.");
} catch (error) {
	console.error("Error during startup:", error);
	process.exit(1);
}

let runCount = 0;

function isOneOfTenRuns() {
	return runCount % 10 === 0;
}

const interval = setInterval(async () => {
	try {
		await monitor.runAllParallel();
		runCount++;
		if (isOneOfTenRuns()) {
			await monitor.refreshDisks();
		}
	} catch (error) {
		console.error("Error monitoring server:", error);
	}
}, config.intervalSeconds * 1000);

// Graceful shutdown, clear interval & notify
function gracefulShutdown() {
	clearInterval(interval);
	console.log("Alerter stopped.");
	process.exit(0);
}

// Graceful shutdown on SIGINT and SIGTERM.
process.on("SIGINT", () => {
	gracefulShutdown();
});

process.on("SIGTERM", () => {
	gracefulShutdown();
});

// Catch exceptions to trigger an automatic restart if applicable.
process.on("uncaughtException", (error) => {
	console.error("Uncaught exception:", error);
	process.exit(1);
});
