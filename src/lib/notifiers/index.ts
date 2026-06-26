import { config } from "../../config";
import { logger } from "../logger";
import type { AbstractNotifier } from "./abstract-notifier";
import { DiscordNotifier } from "./discord";
import { TelegramNotifier } from "./telegram";

export class Notifiers {
	private readonly notifiers: AbstractNotifier[] = [];

	constructor() {
		for (const notifier of config.notifiers) {
			if (notifier.type === "discord") {
				this.notifiers.push(
					new DiscordNotifier({ webhookUrl: notifier.webhookUrl }),
				);
			} else if (notifier.type === "telegram") {
				this.notifiers.push(
					new TelegramNotifier({
						botToken: notifier.botToken,
						chatId: notifier.chatId,
					}),
				);
			}
		}
	}

	public async alert(message: string) {
		logger.info(`Alert: ${message}`);
		for (const notifier of this.notifiers) {
			await notifier.sendAlert(message);
		}
	}
}
