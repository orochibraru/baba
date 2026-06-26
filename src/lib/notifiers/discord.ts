import { z } from "zod";
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
		try {
			const res = await fetch(this.webhookUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: message, username: "Baba" }),
			});
			if (!res.ok) {
				console.error(
					`Discord webhook returned ${res.status}: ${await res.text()}`,
				);
			}
		} catch (error) {
			console.error("Failed to send alert to Discord:", error);
		}
	}
}
