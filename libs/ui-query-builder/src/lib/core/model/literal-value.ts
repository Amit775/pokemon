export type LiteralScalar = string | number | boolean | null;

export type LiteralValue = LiteralScalar | readonly LiteralScalar[];

export function coerceToGraphQLType(value: LiteralValue, typeName: string): LiteralValue {
	if (value === null || Array.isArray(value)) return value;

	if (typeName === 'Int' && typeof value === 'number') return Math.round(value);
	if (typeName === 'Float' && typeof value === 'number') return value;
	if (typeName === 'String' && typeof value !== 'string') return String(value);
	if (typeName === 'Boolean' && typeof value !== 'boolean') return Boolean(value);

	return value;
}
