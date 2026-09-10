export function humanizeName(rawName: string): string {
	return rawName
		.split('_')
		.filter((word) => word.length > 0)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

export function humanizeValue(rawValue: string): string {
	return humanizeName(rawValue.replace(/-/g, '_'));
}
