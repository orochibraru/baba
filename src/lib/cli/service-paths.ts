import { homedir } from "node:os";
import { join } from "node:path";

// Shared filesystem/service locations used by install, restart, and uninstall
// so the three commands can never drift out of sync on where things live.

export const BINARY_PATH = "/usr/local/bin/baba";
export const LIB_DIR = "/var/lib/baba";
export const CONFIG_PATH = `${LIB_DIR}/config.json`;
export const LOG_PATH = `${LIB_DIR}/baba.log`;

export const LAUNCHD_LABEL = "com.orochibraru.baba";

export function macosPlistPath(): string {
	return join(homedir(), "Library/LaunchAgents", `${LAUNCHD_LABEL}.plist`);
}

export function linuxSystemUnitPath(): string {
	return "/etc/systemd/system/baba.service";
}

export function linuxUserUnitPath(): string {
	return join(homedir(), ".config/systemd/user/baba.service");
}
