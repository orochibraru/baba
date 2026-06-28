import { sleep } from "bun";
import { program } from "commander";
import packagejson from "../package.json";
import { setup } from "../scripts/setup";
import { validate } from "../scripts/validate";
import { getConfig, isConfigLoaded, loadConfig } from "./config";
import { getIncident, listIncidents } from "./lib/cli/incidents";
import { logger } from "./lib/logger";
import { Process } from "./process";

program
	.name("Baba")
	.description("Monitor your homelab server and alert on issues.")
	.version(packagejson.version);

program
	.command("start")
	.description("Start the monitoring process.")
	.action(async () => {
		logger.debug("CMD called: start");
		const process = new Process();
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
	.command("setup")
	.description("Start the monitoring process.")
	.action(async () => {
		logger.debug("CMD called: setup");
		await setup();
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

program.parse(process.argv);
