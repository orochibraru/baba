export type BreachOpts = {
	metric: string;
	volume: string | null;
	value: number;
	threshold: number;
	consecutiveRequired: number;
	openMsg: string;
	reminderMsg: string;
	recoveryMsg: string;
};
