import { Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { applyEach, applyWhenValue, form, required, schema, type FieldTree, type Schema } from '@angular/forms/signals';

interface SpikeRule {
	kind: 'rule';
	fieldName: string;
}

interface SpikeGroup {
	kind: 'group';
	combinator: string;
	children: SpikeNode[];
}

type SpikeNode = SpikeGroup | SpikeRule;

const groupSchema: Schema<SpikeGroup> = schema<SpikeGroup>((groupPath) => {
	applyEach(groupPath.children, nodeSchema);
});

const nodeSchema: Schema<SpikeNode> = schema<SpikeNode>((nodePath) => {
	applyWhenValue(
		nodePath,
		(value): value is SpikeRule => value.kind === 'rule',
		(rulePath) => {
			required(rulePath.fieldName);
		},
	);
	applyWhenValue(nodePath, (value): value is SpikeGroup => value.kind === 'group', groupSchema);
});

function isGroupField(node: FieldTree<SpikeNode, number>): node is FieldTree<SpikeGroup, number> {
	return node().value().kind === 'group';
}

function isRuleField(node: FieldTree<SpikeNode, number>): node is FieldTree<SpikeRule, number> {
	return node().value().kind === 'rule';
}

function createTree(): SpikeGroup {
	return {
		kind: 'group',
		combinator: 'and',
		children: [
			{ kind: 'rule', fieldName: 'name' },
			{
				kind: 'group',
				combinator: 'or',
				children: [{ kind: 'rule', fieldName: '' }],
			},
		],
	};
}

function nestedRuleField(root: FieldTree<SpikeGroup>): FieldTree<SpikeRule, number> {
	const nestedGroup = root.children[1];
	if (!isGroupField(nestedGroup)) {
		throw new Error('expected a nested group');
	}
	const nestedRule = nestedGroup.children[0];
	if (!isRuleField(nestedRule)) {
		throw new Error('expected a nested rule');
	}
	return nestedRule;
}

function nestedRuleValue(root: SpikeGroup): SpikeRule {
	const nestedGroup = root.children[1];
	if (nestedGroup.kind !== 'group') {
		throw new Error('expected a nested group');
	}
	const nestedRule = nestedGroup.children[0];
	if (nestedRule.kind !== 'rule') {
		throw new Error('expected a nested rule');
	}
	return nestedRule;
}

describe('signal forms recursion spike', () => {
	let injector: Injector;

	beforeEach(() => {
		injector = TestBed.inject(Injector);
	});

	it('reaches and writes a nested rule field through a self referencing schema', () => {
		const model = signal(createTree());
		const filterForm = TestBed.runInInjectionContext(() => form(model, groupSchema));

		const nestedRule = nestedRuleField(filterForm);

		expect(nestedRule.fieldName().value()).toBe('');

		nestedRule.fieldName().value.set('height');

		expect(nestedRuleValue(model()).fieldName).toBe('height');
		expect(injector).toBeDefined();
	});

	it('surfaces a validation error attached to a nested rule', () => {
		const model = signal(createTree());
		const filterForm = TestBed.runInInjectionContext(() => form(model, groupSchema));

		const nestedRule = nestedRuleField(filterForm);

		expect(nestedRule.fieldName().errors().map((error) => error.kind)).toContain('required');
		expect(filterForm().invalid()).toBe(true);

		nestedRule.fieldName().value.set('height');

		expect(nestedRule.fieldName().errors()).toEqual([]);
		expect(filterForm().valid()).toBe(true);
	});

	it('applies the recursive schema to a branch grafted in after the form was created', () => {
		const model = signal(createTree());
		const filterForm = TestBed.runInInjectionContext(() => form(model, groupSchema));

		model.update((root) => ({
			...root,
			children: [
				...root.children,
				{
					kind: 'group',
					combinator: 'and',
					children: [{ kind: 'group', combinator: 'or', children: [{ kind: 'rule', fieldName: '' }] }],
				} satisfies SpikeGroup,
			],
		}));

		const graftedBranch = filterForm.children[2];
		if (!isGroupField(graftedBranch)) {
			throw new Error('expected a grafted group');
		}
		const graftedInnerGroup = graftedBranch.children[0];
		if (!isGroupField(graftedInnerGroup)) {
			throw new Error('expected a grafted inner group');
		}
		const graftedRule = graftedInnerGroup.children[0];
		if (!isRuleField(graftedRule)) {
			throw new Error('expected a grafted rule');
		}

		expect(graftedRule.fieldName().errors().map((error) => error.kind)).toContain('required');
	});
});
