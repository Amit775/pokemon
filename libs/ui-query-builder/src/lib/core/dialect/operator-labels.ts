import { humanizeName } from '../../metadata/humanize-name';

const operatorLabels: Readonly<Record<string, string>> = {
	_eq: 'is',
	_neq: 'is not',
	_gt: 'is greater than',
	_gte: 'is at least',
	_lt: 'is less than',
	_lte: 'is at most',
	_in: 'is one of',
	_nin: 'is none of',
	_is_null: 'is empty',
	_ilike: 'contains',
	_nilike: 'does not contain',
	_like: 'contains, matching case',
	_nlike: 'does not contain, matching case',
	_similar: 'matches the pattern',
	_nsimilar: 'does not match the pattern',
	_regex: 'matches the expression, matching case',
	_nregex: 'does not match the expression, matching case',
	_iregex: 'matches the expression',
	_niregex: 'does not match the expression',
};

export function resolveOperatorLabel(operatorName: string): string {
	return operatorLabels[operatorName] ?? humanizeName(operatorName);
}
