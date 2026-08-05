import { sleep } from "bun";
import { program } from "commander";
import packagejson from "../package.json";
import { isConfigLoaded } from "./config";
import { health } from "./lib/cli/health";
import { getIncident, listIncidents } from "./lib/cli/incidents";
import { runInstall } from "./lib/cli/install";
import { runLogs } from "./lib/cli/logs";
import { runRestart } from "./lib/cli/restart";
import { runSetup } from "./lib/cli/setup";
import { runUninstall } from "./lib/cli/uninstall";
import { runUpdate } from "./lib/cli/update";
import { validate } from "./lib/cli/validate";
import { logger } from "./lib/logger";
import { Process } from "./process";

program
	.name("Baba")
	.description("Monitor your homelab server and alert on issues.")
	.version(packagejson.version);

program
	.command("start")
	.description("Start the monitoring process.")
	.option(
		"--config <path>",
		"Path to config.json",
		process.env.BABA_CONFIG_PATH ?? "/var/lib/baba/config.json",
	)
	.action(async (opts: { config: string }) => {
		logger.debug("CMD called: start");
		const app = new Process(opts.config);
		// Sleep until config is loaded
		let config = isConfigLoaded();
		let maxTries = 0;
		while (!config) {
			await sleep(100);
			logger.info("Waiting for config to load...");
			config = isConfigLoaded();
			maxTries++;
			if (maxTries > 50) {
				logger.error("Failed to load config after 50 attempts.");
				process.exit(1);
			}
		}
		app.start();
	});

program
	.command("health")
	.description("Check the service is correctly configured and able to alert.")
	.option(
		"--config <path>",
		"Path to config.json",
		process.env.BABA_CONFIG_PATH ?? "/var/lib/baba/config.json",
	)
	.action(async (opts: { config: string }) => {
		await health(opts.config);
	});

program
	.command("setup")
	.description(
		"Interactive setup wizard — configure baba and write config.json.",
	)
	.option(
		"--config <path>",
		"Path to write config.json",
		process.env.BABA_CONFIG_PATH ?? "/var/lib/baba/config.json",
	)
	.action(async (opts: { config: string }) => {
		logger.debug("CMD called: setup");
		await runSetup(opts.config);
	});

program
	.command("logs")
	.description("Show logs from the background service.")
	.option("-f, --follow", "Stream new log entries as they arrive", false)
	.option("-n, --lines <number>", "Number of lines to show", "100")
	.action(async (opts: { follow: boolean; lines: string }) => {
		logger.debug("CMD called: logs");
		await runLogs({ follow: opts.follow, lines: Number(opts.lines) });
	});

program
	.command("install")
	.description(
		"Register baba as a background service (launchd on macOS, systemd on Linux).",
	)
	.action(async () => {
		logger.debug("CMD called: install");
		await runInstall();
	});

program
	.command("restart")
	.description(
		"Restart the background service (launchd on macOS, systemd on Linux).",
	)
	.action(async () => {
		logger.debug("CMD called: restart");
		await runRestart();
	});

program
	.command("uninstall")
	.description(
		"Remove the background service. Config and data are kept unless --purge is passed.",
	)
	.option(
		"--purge",
		"Also remove config, database, and logs from /var/lib/baba",
		false,
	)
	.action(async (opts: { purge: boolean }) => {
		logger.debug("CMD called: uninstall");
		await runUninstall({ purge: opts.purge });
	});

program
	.command("update")
	.description("Check for a newer release and replace the binary in-place.")
	.action(async () => {
		logger.debug("CMD called: update");
		await runUpdate();
	});

program
	.command("validate")
	.description("Validate the webhooks by sending a test alert.")
	.action(async () => {
		logger.debug("CMD called: validate");
		await validate();
	});

program
	.command("list incidents")
	.description("List recorded incidents.")
	.option("-n, --limit <number>", "Maximum number of incidents to show", "50")
	.action(async (_: string, opts: { limit: string }) => {
		logger.debug("CMD called: list incidents");
		return listIncidents(opts);
	});

program
	.command("get incident <id>")
	.description("Get details of an incident by ID.")
	.action(async (_: string, id: string) => {
		logger.debug("CMD called: get incident");
		return getIncident(id);
	});

program.on("error", (err) => {
	logger.error(err);
	process.exit(1);
});

await program.parseAsync(process.argv);
