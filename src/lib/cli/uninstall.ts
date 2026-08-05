import { existsSync as fsExistsSync, rmSync as fsRmSync } from "node:fs";
import { platform as osPlatform } from "node:os";
import { defaultExec, type ExecFn } from "./exec";
import {
	LIB_DIR,
	linuxSystemUnitPath,
	linuxUserUnitPath,
	macosPlistPath,
} from "./service-paths";

export type UninstallOpts = {
	purge?: boolean;
};

export type UninstallDeps = {
	platform: () => NodeJS.Platform;
	existsSync: (path: string) => boolean;
	exec: ExecFn;
	rm: (path: string, opts?: { recursive?: boolean; force?: boolean }) => void;
};

const defaultDeps: UninstallDeps = {
	platform: osPlatform,
	existsSync: fsExistsSync,
	exec: defaultExec,
	rm: (path, opts) => fsRmSync(path, opts),
};

async function uninstallMacos(deps: UninstallDeps): Promise<boolean> {
	const plistPath = macosPlistPath();
	if (!deps.existsSync(plistPath)) {
		return false;
	}

	// Best-effort: the service may already be unloaded (e.g. after a crash).
	await deps.exec(["launchctl", "unload", plistPath]);
	deps.rm(plistPath, { force: true });
	process.stdout.write(`Removed ${plistPath}. Service unregistered.\n`);
	return true;
}

async function uninstallLinux(deps: UninstallDeps): Promise<boolean> {
	const systemUnit = linuxSystemUnitPath();
	const userUnit = linuxUserUnitPath();
	let removedAny = false;

	if (deps.existsSync(systemUnit)) {
		await deps.exec(["sudo", "systemctl", "stop", "baba"]);
		await deps.exec(["sudo", "systemctl", "disable", "baba"]);
		await deps.exec(["sudo", "rm", "-f", systemUnit]);
		await deps.exec(["sudo", "systemctl", "daemon-reload"]);
		process.stdout.write(
			`Removed ${systemUnit}. System service unregistered.\n`,
		);
		removedAny = true;
	}

	if (deps.existsSync(userUnit)) {
		await deps.exec(["systemctl", "--user", "stop", "baba"]);
		await deps.exec(["systemctl", "--user", "disable", "baba"]);
		deps.rm(userUnit, { force: true });
		await deps.exec(["systemctl", "--user", "daemon-reload"]);
		process.stdout.write(`Removed ${userUnit}. User service unregistered.\n`);
		removedAny = true;
	}

	return removedAny;
}

export async function runUninstall(
	opts: UninstallOpts = {},
	deps: UninstallDeps = defaultDeps,
): Promise<void> {
	const os = deps.platform();

	let removedAny: boolean;
	if (os === "darwin") {
		removedAny = await uninstallMacos(deps);
	} else if (os === "linux") {
		removedAny = await uninstallLinux(deps);
	} else {
		process.stdout.write(`Unsupported platform: ${os}\n`);
		return;
	}

	if (!removedAny) {
		process.stdout.write("No service installed — nothing to do.\n");
	}

	if (opts.purge) {
		deps.rm(LIB_DIR, { recursive: true, force: true });
		process.stdout.write(`Removed ${LIB_DIR} (config, database, logs).\n`);
	} else {
		process.stdout.write(
			`Config and data left in place at ${LIB_DIR}. Re-run with --purge to remove them too.\n`,
		);
	}
}
