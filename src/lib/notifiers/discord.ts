import { z } from "zod";
import { logger } from "../logger";
import { AbstractNotifier } from "./abstract-notifier";

export const discordNotifierSchema = z
	.object({
		type: z.literal("discord", { error: "Must be 'discord'" }),
		webhookUrl: z.url(
			'Must be a valid Discord webhook URL (e.g. "https://discord.com/api/webhooks/<id>/<token>")',
		),
	})
	.strict();

export type DiscordNotifierConfig = z.infer<typeof discordNotifierSchema>;

export type DiscordNotifierProps = {
	webhookUrl: string;
};

export class DiscordNotifier extends AbstractNotifier {
	private webhookUrl: string;

	constructor(props: DiscordNotifierProps) {
		super({ validationMessage: "Validation message for Discord" });
		this.webhookUrl = props.webhookUrl;
	}

	async sendAlert(message: string): Promise<void> {
		logger.debug(`[discord] POST ${this.webhookUrl}`);
		try {
			const res = await fetch(this.webhookUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: message, username: "Baba" }),
			});
			if (!res.ok) {
				const body = await res.text();
				logger.error(`[discord] ${res.status}: ${body}`);
			} else {
				logger.debug(`[discord] delivered (${res.status})`);
			}
		} catch (error) {
			logger.error(`[discord] network error: ${error}`);
		}
	}
}
