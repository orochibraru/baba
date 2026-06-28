import { sleep } from "bun";
import { program } from "commander";
import packagejson from "../package.json";
import { setup } from "../scripts/setup";
import { validate } from "../scripts/validate";
import { getIncident, listIncidents } from "./lib/cli/incidents";
import { Process } from "./process";

program
	.name("Baba")
	.description("Monitor your homelab server and alert on issues.")
	.version(packagejson.version);

program
	.command("start")
	.description("Start the monitoring process.")
	.action(async () => {
		const process = new Process();
		await sleep(1000);
		process.start();
	});

program
	.command("setup")
	.description("Start the monitoring process.")
	.action(async () => {
		await setup();
	});

program
	.command("validate")
	.description("Validate the webhooks by sending a test alert.")
	.action(async () => {
		await validate();
	});

program
	.command("list incidents")
	.description("List recorded incidents.")
	.option("-n, --limit <number>", "Maximum number of incidents to show", "50")
	.action(async (_: string, opts: { limit: string }) => {
		return listIncidents(opts);
	});

program
	.command("get incident <id>")
	.description("Get details of an incident by ID.")
	.action(async (_: string, id: string) => {
		return getIncident(id);
	});

program.parse(process.argv);
