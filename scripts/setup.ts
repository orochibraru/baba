import si from "systeminformation";
import { humanReadableBytes } from "../src/lib/helpers";
import { logger } from "../src/lib/logger";

export async function setup() {
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
	const volumes = await si.fsSize();
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
		process.exit(0);
	}

	logger.info(`Found ${readableVolumes.length} volume(s)`);

	// Sort by size
	const sortedVolumes = readableVolumes.sort((a, b) => b.rawSize - a.rawSize);

	const likelyRootVolume = sortedVolumes[0];
	if (!likelyRootVolume) {
		logger.error("No volumes found.");
		process.exit(0);
	}

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
