import { PinoTransport } from "@loglayer/transport-pino";
import { LogLayer } from "loglayer";
import pino from "pino";

// Lazily import pino-pretty only in TTY mode to avoid bundling it into the
// compiled binary's hot path and to prevent any module-init side-effects
// when running as a server process (non-interactive).
/* c8 ignore next */
export async function createPinoLogger(): Promise<pino.Logger> {
	/* c8 ignore next */
	if (!process.stdout.isTTY) {
		return pino({ level: "info" });
	}
	try {
		const { default: pretty } = await import("pino-pretty");
		return pino(
			{ level: "info" },
			pretty({
				colorize: true,
				translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
				ignore: "pid,hostname",
			}),
		);
	} catch {
		return pino({ level: "info" });
	}
}

/* c8 ignore next */
const pinoLogger = await createPinoLogger();

export const logger = new LogLayer({
	transport: new PinoTransport({
		logger: pinoLogger,
	}),
});

export function setLogLevel(level: string): void {
	pinoLogger.level = level;
}
