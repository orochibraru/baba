import { PinoTransport } from "@loglayer/transport-pino";
import { LogLayer } from "loglayer";
import pino from "pino";

const pinoLogger = pino({
	level: "info",
	transport: {
		target: "pino-pretty",
		options: {
			colorize: true,
			translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
			ignore: "pid,hostname",
		},
	},
});

export const logger = new LogLayer({
	transport: new PinoTransport({
		logger: pinoLogger,
	}),
});

export function setLogLevel(level: string): void {
	pinoLogger.level = level;
}
