import { loadConfig } from "../src/config";
import { notify } from "../src/lib/notify";

export async function validate() {
	await loadConfig();
	try {
		await notify("This is a test alert.");
		console.log("Test alert sent successfully.");
	} catch (error) {
		console.error("Failed to send test alert:", error);
	}
}
