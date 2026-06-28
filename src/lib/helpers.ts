/**
 * Converts a number of bytes to a human-readable string.
 * @param bytes
 * @returns {string} The human-readable string representation of the bytes.
 */
export function humanReadableBytes(bytes: number): string {
	const units = ["B", "KB", "MB", "GB", "TB"];
	let unitIndex = 0;

	while (bytes >= 1024 && unitIndex < units.length - 1) {
		bytes /= 1024;
		unitIndex++;
	}

	return `${bytes.toFixed(2)} ${units[unitIndex]}`;
}

export function formatDate(ms: number): string {
	return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}
