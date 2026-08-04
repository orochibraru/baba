import { mkdirSync as fsMkdirSync } from "node:fs";
import { homedir, platform as osPlatform } from "node:os";
import { dirname, join } from "node:path";

const BINARY_PATH = "/usr/local/bin/baba";
const CONFIG_PATH = "/var/lib/baba/config.json";
const LOG_PATH = "/var/lib/baba/baba.log";

export type InstallDeps = {
	platform: () => NodeJS.Platform;
	configExists: (path: string) => Promise<boolean>;
	writeFile: (path: string, content: string) => Promise<void>;
	exec: (cmd: string[]) => Promise<{ ok: boolean; out: string }>;
	mkdirSync: (path: string, opts?: { recursive?: boolean }) => void;
};

async function defaultExec(
	cmd: string[],
): Promise<{ ok: boolean; out: string }> {
	try {
		const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
		const [stdout, stderr, exit] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		return { ok: exit === 0, out: (stdout + stderr).trim() };
	} catch (err) {
		return { ok: false, out: String(err) };
	}
}

const defaultDeps: InstallDeps = {
	platform: osPlatform,
	configExists: async (path) => Bun.file(path).exists(),
	writeFile: async (path, content) => {
		await Bun.write(path, content);
	},
	exec: defaultExec,
	mkdirSync: (path, opts) => fsMkdirSync(path, opts),
};

async function installMacos(deps: InstallDeps): Promise<void> {
	const plistDir = join(homedir(), "Library/LaunchAgents");
	const plistPath = join(plistDir, "com.orochibraru.baba.plist");

	deps.mkdirSync(plistDir, { recursive: true });
	await deps.writeFile(
		plistPath,
		`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>com.orochibraru.baba</string>
	<key>ProgramArguments</key>
	<array>
		<string>${BINARY_PATH}</string>
		<string>start</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>StandardOutPath</key>
	<string>${LOG_PATH}</string>
	<key>StandardErrorPath</key>
	<string>${LOG_PATH}</string>
</dict>
</plist>
`,
	);
	process.stdout.write(`Wrote ${plistPath}\n`);

	await deps.exec(["launchctl", "unload", plistPath]);
	const load = await deps.exec(["launchctl", "load", "-w", plistPath]);
	if (!load.ok) {
		throw new Error(`launchctl load failed: ${load.out}`);
	}

	process.stdout.write(
		`Service loaded — baba will start on login and restart automatically.\nLogs: ${LOG_PATH}\n`,
	);
}

async function installLinux(deps: InstallDeps): Promise<void> {
	const systemUnit = "/etc/systemd/system/baba.service";
	const userUnit = join(homedir(), ".config/systemd/user/baba.service");

	const systemContent = `[Unit]
Description=baba server monitor
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=${BINARY_PATH} start
Restart=always
RestartSec=5
StandardOutput=append:${LOG_PATH}
StandardError=append:${LOG_PATH}

[Install]
WantedBy=multi-user.target
`;

	const tmp = `/tmp/baba-${Date.now()}.service`;
	await deps.writeFile(tmp, systemContent);

	const sudoCopy = await deps.exec(["sudo", "cp", tmp, systemUnit]);

	if (sudoCopy.ok) {
		const reload = await deps.exec(["sudo", "systemctl", "daemon-reload"]);
		if (!reload.ok) {
			throw new Error(`daemon-reload failed: ${reload.out}`);
		}

		const enable = await deps.exec(["sudo", "systemctl", "enable", "baba"]);
		if (!enable.ok) {
			throw new Error(`systemctl enable failed: ${enable.out}`);
		}

		const start = await deps.exec(["sudo", "systemctl", "start", "baba"]);
		if (!start.ok) {
			throw new Error(`systemctl start failed: ${start.out}`);
		}

		process.stdout.write(
			`Wrote ${systemUnit}\nSystem service enabled and started — baba runs on boot.\nCheck status: sudo systemctl status baba\nLogs: sudo journalctl -u baba -f\n`,
		);
	} else {
		process.stdout.write(
			"No sudo access — installing as a user service instead.\nNote: user services only run while you are logged in.\n",
		);

		deps.mkdirSync(dirname(userUnit), { recursive: true });
		await deps.writeFile(
			userUnit,
			systemContent.replace(
				"WantedBy=multi-user.target",
				"WantedBy=default.target",
			),
		);
		process.stdout.write(`Wrote ${userUnit}\n`);

		const reload = await deps.exec(["systemctl", "--user", "daemon-reload"]);
		if (!reload.ok) {
			throw new Error(`daemon-reload failed: ${reload.out}`);
		}

		const enable = await deps.exec(["systemctl", "--user", "enable", "baba"]);
		if (!enable.ok) {
			throw new Error(`systemctl enable failed: ${enable.out}`);
		}

		const start = await deps.exec(["systemctl", "--user", "start", "baba"]);
		if (!start.ok) {
			throw new Error(`systemctl start failed: ${start.out}`);
		}

		process.stdout.write(
			"User service enabled and started.\nCheck status: systemctl --user status baba\nLogs: journalctl --user -u baba -f\n",
		);
	}
}

export async function runInstall(
	deps: InstallDeps = defaultDeps,
): Promise<void> {
	if (!(await deps.configExists(CONFIG_PATH))) {
		process.stdout.write(
			`No config found at ${CONFIG_PATH}. Run 'baba setup' first.\n`,
		);
		process.exit(1);
	}

	const os = deps.platform();
	if (os === "darwin") {
		await installMacos(deps);
	} else if (os === "linux") {
		await installLinux(deps);
	} else {
		process.stdout.write(`Unsupported platform: ${os}\n`);
		process.exit(1);
	}
}
