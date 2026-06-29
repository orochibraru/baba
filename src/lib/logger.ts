import { PinoTransport } from "@loglayer/transport-pino";
import { LogLayer } from "loglayer";
import pino from "pino";

/* c8 ignore next */
// biome-ignore format: single-line ternary required for c8 to suppress the unreachable TTY branch
const pinoLogger = pino(process.stdout.isTTY ? { level: "info", transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l", ignore: "pid,hostname" } } } : { level: "info" });

export const logger = new LogLayer({
	transport: new PinoTransport({
		logger: pinoLogger,
	}),
});

export function setLogLevel(level: string): void {
	pinoLogger.level = level;
}
