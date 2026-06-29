import packagejson from "../../../package.json";
import { logger } from "../logger";

const REPO = "orochibraru/baba";
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export async function getLatestVersion(): Promise<string | null> {
	try {
		const res = await fetch(API_URL, {
			headers: { "User-Agent": `baba/${packagejson.version}` },
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { tag_name?: string };
		return data.tag_name?.replace(/^v/, "") ?? null;
	} catch {
		return null;
	}
}

export function isNewerVersion(latest: string, current: string): boolean {
	const parse = (v: string) => v.split(".").map(Number);
	const [la, lb, lc] = parse(latest);
	const [ca, cb, cc] = parse(current);
	if (la !== ca) return (la ?? 0) > (ca ?? 0);
	if (lb !== cb) return (lb ?? 0) > (cb ?? 0);
	return (lc ?? 0) > (cc ?? 0);
}

export async function runUpdate(): Promise<void> {
	const current = packagejson.version;
	process.stdout.write(
		`Current version: v${current}\nChecking for updates...\n`,
	);

	const latest = await getLatestVersion();
	if (!latest) {
		process.stdout.write(
			"Could not reach GitHub releases — check your internet connection.\n",
		);
		return;
	}

	if (!isNewerVersion(latest, current)) {
		process.stdout.write(`Already up to date (v${current}).\n`);
		return;
	}

	process.stdout.write(`New version available: v${latest}\nDownloading...\n`);

	const os = process.platform === "darwin" ? "darwin" : "linux";
	const arch = process.arch === "arm64" ? "arm64" : "x64";
	const asset = `baba-${os}-${arch}`;
	const url = `https://github.com/${REPO}/releases/download/v${latest}/${asset}`;

	let res: Response;
	try {
		res = await fetch(url);
	} catch (err) {
		process.stdout.write(`Download failed: ${String(err)}\n`);
		return;
	}
	if (!res.ok) {
		process.stdout.write(`Download failed: HTTP ${res.status}\n`);
		return;
	}

	const tmp = `/tmp/baba-update-${Date.now()}`;
	await Bun.write(tmp, await res.arrayBuffer());

	const chmod = Bun.spawnSync(["chmod", "+x", tmp]);
	if (chmod.exitCode !== 0) {
		process.stdout.write("Failed to make binary executable.\n");
		return;
	}

	// self is the running binary's path; fall back for dev-mode (bun run)
	const self = process.execPath.endsWith("/bun")
		? "/usr/local/bin/baba"
		: process.execPath;

	let mv = Bun.spawnSync(["mv", tmp, self]);
	if (mv.exitCode !== 0) {
		mv = Bun.spawnSync(["sudo", "mv", tmp, self]);
		if (mv.exitCode !== 0) {
			process.stdout.write(
				`Failed to replace binary at ${self}.\nTry: sudo mv ${tmp} ${self}\n`,
			);
			return;
		}
	}

	logger.info(`Updated baba to v${latest}.`);
	process.stdout.write(`Updated to v${latest}. Restart baba to apply.\n`);
}
