import si from "systeminformation";
import { humanReadableBytes } from "../helpers";
import { logger } from "../logger";

type FsEntry = {
	fs: string;
	used: number;
	available: number;
	size: number;
	use: number;
	mount: string;
};

export type SetupDeps = {
	fsSize(): Promise<FsEntry[]>;
	exit(code: number): void;
};

const defaultDeps: SetupDeps = {
	fsSize: () => si.fsSize(),
	exit: process.exit,
};

export async function setup(deps: SetupDeps = defaultDeps) {
	const readableVolumes: {
		name: string;
		usedBytes: string;
		availableBytes: string;
		usePercentage: number;
		mountPoint: string;
		totalSize: string;
		rawSize: number;
	}[] = [];

	logger.info("Fetching volume information...");
	const volumes = await deps.fsSize();
	for (const vol of volumes) {
		readableVolumes.push({
			name: vol.fs,
			usedBytes: humanReadableBytes(vol.used),
			availableBytes: humanReadableBytes(vol.available),
			totalSize: humanReadableBytes(vol.size),
			rawSize: vol.size,
			usePercentage: vol.use,
			mountPoint: vol.mount,
		});
	}

	if (readableVolumes.length === 0) {
		logger.error("No volumes found.");
		deps.exit(0);
		return;
	}

	logger.info(`Found ${readableVolumes.length} volume(s)`);

	// Sort by size
	const sortedVolumes = readableVolumes.sort((a, b) => b.rawSize - a.rawSize);

	const likelyRootVolume = sortedVolumes[0];
	/* c8 ignore next */
	// biome-ignore format: single-line if needed for c8 ignore to cover unreachable guard
	if (!likelyRootVolume) { deps.exit(0); return; }

	logger.info("---");
	logger.info("---");
	logger.info("---");
	logger.info("Likely your root volume:");
	logger.info(
		`${likelyRootVolume.name}: ${likelyRootVolume.totalSize} (${likelyRootVolume.usePercentage}%) mounted at ${likelyRootVolume.mountPoint}`,
	);
	logger.info("---");
	logger.info("---");
	logger.info("---");
	logger.info("Other volumes:");
	for (const volume of sortedVolumes.slice(1)) {
		logger.info(
			`${volume.name}: ${volume.totalSize} (${volume.usePercentage}%) mounted at ${volume.mountPoint}`,
		);
	}
}
