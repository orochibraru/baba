import { sleep } from "bun";
import { program } from "commander";
import packagejson from "../package.json";
import { isConfigLoaded } from "./config";
import { health } from "./lib/cli/health";
import { getIncident, listIncidents } from "./lib/cli/incidents";
import { runSetup } from "./lib/cli/setup";
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
		const process = new Process(opts.config);
		// Sleep until config is loaded
		let config = isConfigLoaded();
		while (!config) {
			await sleep(100);
			logger.info("Waiting for config to load...");
			config = isConfigLoaded();
		}
		process.start();
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

await program.parseAsync(process.argv);
