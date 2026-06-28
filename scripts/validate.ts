import { loadConfig } from "../src/config";
import { logger } from "../src/lib/logger";
import { Notifiers } from "../src/lib/notifiers";

export async function validate() {
	await loadConfig();
	try {
		const notifiers = new Notifiers();
		await notifiers.alert("This is a test alert.");
		logger.info("Test alert sent successfully.");
	} catch (error) {
		logger.error(`Failed to send test alert: ${JSON.stringify(error)}`);
	}
}
