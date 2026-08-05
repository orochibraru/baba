import { existsSync as fsExistsSync } from "node:fs";
import { platform as osPlatform } from "node:os";
import { defaultExec, type ExecFn } from "./exec";
import {
	LAUNCHD_LABEL,
	linuxSystemUnitPath,
	linuxUserUnitPath,
	macosPlistPath,
} from "./service-paths";

export type RestartDeps = {
	platform: () => NodeJS.Platform;
	existsSync: (path: string) => boolean;
	exec: ExecFn;
	uid: () => number;
};

const defaultDeps: RestartDeps = {
	platform: osPlatform,
	existsSync: fsExistsSync,
	exec: defaultExec,
	uid: () => process.getuid?.() ?? 0,
};

async function restartMacos(deps: RestartDeps): Promise<void> {
	const plistPath = macosPlistPath();
	if (!deps.existsSync(plistPath)) {
		process.stdout.write(
			`No service installed at ${plistPath}. Run 'baba install' first.\n`,
		);
		process.exit(1);
	}

	const kickstart = await deps.exec([
		"launchctl",
		"kickstart",
		"-k",
		`gui/${deps.uid()}/${LAUNCHD_LABEL}`,
	]);
	if (!kickstart.ok) {
		throw new Error(`launchctl kickstart failed: ${kickstart.out}`);
	}
	process.stdout.write("Service restarted.\n");
}

async function restartLinux(deps: RestartDeps): Promise<void> {
	const systemUnit = linuxSystemUnitPath();
	const userUnit = linuxUserUnitPath();

	if (deps.existsSync(systemUnit)) {
		const restart = await deps.exec(["sudo", "systemctl", "restart", "baba"]);
		if (!restart.ok) {
			throw new Error(`systemctl restart failed: ${restart.out}`);
		}
		process.stdout.write("System service restarted.\n");
	} else if (deps.existsSync(userUnit)) {
		const restart = await deps.exec(["systemctl", "--user", "restart", "baba"]);
		if (!restart.ok) {
			throw new Error(`systemctl --user restart failed: ${restart.out}`);
		}
		process.stdout.write("User service restarted.\n");
	} else {
		process.stdout.write("No service installed. Run 'baba install' first.\n");
		process.exit(1);
	}
}

export async function runRestart(
	deps: RestartDeps = defaultDeps,
): Promise<void> {
	const os = deps.platform();
	if (os === "darwin") {
		await restartMacos(deps);
	} else if (os === "linux") {
		await restartLinux(deps);
	} else {
		process.stdout.write(`Unsupported platform: ${os}\n`);
		process.exit(1);
	}
}
