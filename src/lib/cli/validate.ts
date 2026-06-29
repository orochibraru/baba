import type { Config } from "../../config";
import { loadConfig } from "../../config";
import { logger } from "../logger";
import { Notifiers } from "../notifiers";

export type ValidateDeps = {
	loadConfig(): Promise<Config>;
	createNotifiers(): { alert(msg: string): Promise<void> };
};

const defaultDeps: ValidateDeps = {
	loadConfig: () => loadConfig(),
	createNotifiers: () => new Notifiers(),
};

export async function validate(deps: ValidateDeps = defaultDeps) {
	await deps.loadConfig();
	try {
		const notifiers = deps.createNotifiers();
		await notifiers.alert("This is a test alert.");
		logger.info("Test alert sent successfully.");
	} catch (error) {
		logger.error(`Failed to send test alert: ${JSON.stringify(error)}`);
	}
}
