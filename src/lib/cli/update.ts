import { dirname, join } from "node:path";
import packagejson from "../../../package.json";
import { loadConfig } from "../../config";
import { logger } from "../logger";

const REPO = "orochibraru/baba";
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export async function getLatestVersion(): Promise<string | null> {
	try {
		logger.debug("Fetching latest version...");
		const res = await fetch(API_URL, {
			headers: { "User-Agent": `baba/${packagejson.version}` },
		});
		if (!res.ok) {
			logger.error("Failed to fetch latest version:", res.statusText);
			return null;
		}
		logger.debug("Successfully fetched latest version.");
		const data = (await res.json()) as { tag_name?: string };
		logger.debug("Successfully parsed latest version:", data.tag_name);
		return data.tag_name?.replace(/^v/, "") ?? null;
	} catch (e) {
		if (e instanceof Error) {
			logger.error(`Failed to parse latest version: ${e.message}`);
		} else {
			logger.error(`Failed to parse latest version: ${String(e)}`);
		}
		return null;
	}
}

export function isNewerVersion(latest: string, current: string): boolean {
	const parse = (v: string) => v.split(".").map(Number);
	const [la, lb, lc] = parse(latest);
	const [ca, cb, cc] = parse(current);
	if (la !== ca) {
		return (la ?? 0) > (ca ?? 0);
	}
	if (lb !== cb) {
		return (lb ?? 0) > (cb ?? 0);
	}
	return (lc ?? 0) > (cc ?? 0);
}

export async function resolveMarkerPath(): Promise<string> {
	try {
		const config = await loadConfig();
		return join(dirname(config.database.path), ".just_updated");
	} catch {
		return "/var/lib/baba/.just_updated";
	}
}

export type UpdateDeps = {
	getLatestVersion: typeof getLatestVersion;
	fetch: typeof fetch;
	gunzipSync: typeof Bun.gunzipSync;
	writeFile: (path: string, data: Uint8Array | string) => Promise<void>;
	spawnSync: (cmd: string[]) => { exitCode: number };
	resolveMarkerPath: typeof resolveMarkerPath;
};

export const defaultDeps: UpdateDeps = {
	getLatestVersion,
	fetch,
	gunzipSync: Bun.gunzipSync,
	writeFile: async (path, data) => {
		await Bun.write(path, data);
	},
	spawnSync: (cmd) => Bun.spawnSync(cmd),
	resolveMarkerPath,
};

export async function runUpdate(deps: UpdateDeps = defaultDeps): Promise<void> {
	const current = packagejson.version;
	process.stdout.write(
		`Current version: v${current}\nChecking for updates...\n`,
	);

	const latest = await deps.getLatestVersion();
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
	const url = `https://github.com/${REPO}/releases/download/v${latest}/${asset}.gz`;

	let res: Response;
	try {
		res = await deps.fetch(url);
	} catch (err) {
		process.stdout.write(`Download failed: ${String(err)}\n`);
		return;
	}
	if (!res.ok) {
		process.stdout.write(`Download failed: HTTP ${res.status}\n`);
		return;
	}

	const compressed = new Uint8Array(await res.arrayBuffer());
	let binary: Uint8Array;
	try {
		binary = deps.gunzipSync(compressed);
	} catch (err) {
		process.stdout.write(`Failed to decompress download: ${String(err)}\n`);
		return;
	}

	const tmp = `/tmp/baba-update-${Date.now()}`;
	await deps.writeFile(tmp, binary);

	const chmod = deps.spawnSync(["chmod", "+x", tmp]);
	if (chmod.exitCode !== 0) {
		process.stdout.write("Failed to make binary executable.\n");
		return;
	}

	// self is the running binary's path; fall back for dev-mode (bun run)
	const self = process.execPath.endsWith("/bun")
		? "/usr/local/bin/baba"
		: process.execPath;

	let mv = deps.spawnSync(["mv", tmp, self]);
	if (mv.exitCode !== 0) {
		mv = deps.spawnSync(["sudo", "mv", tmp, self]);
		if (mv.exitCode !== 0) {
			process.stdout.write(
				`Failed to replace binary at ${self}.\nTry: sudo mv ${tmp} ${self}\n`,
			);
			return;
		}
	}

	// Leave a marker so the next startup skips the update notification,
	// even if the shell is still hashing the old binary.
	const markerPath = await deps.resolveMarkerPath();
	await deps.writeFile(markerPath, new Date().toISOString());

	logger.info(`Updated baba to v${latest}.`);
	process.stdout.write(`Updated to v${latest}. Restart baba to apply.\n`);
}
