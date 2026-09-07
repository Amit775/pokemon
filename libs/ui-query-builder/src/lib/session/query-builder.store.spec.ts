import { TestBed } from '@angular/core/testing';
import { QueryBuilderStore } from './query-builder.store';

describe('QueryBuilderStore', () => {
	function createStore() {
		return TestBed.configureTestingModule({ providers: [QueryBuilderStore] }).inject(QueryBuilderStore);
	}

	it('starts with an empty AND group and no resource', () => {
		const store = createStore();

		expect(store.resourceName()).toBe('');
		expect(store.filter().combinator).toBe('and');
		expect(store.filter().children).toEqual([]);
	});

	it('adds a rule to the root group', () => {
		const store = createStore();
		store.addRule(store.filter().nodeId);

		expect(store.filter().children).toHaveLength(1);
	});

	it('updates a rule in place without disturbing its siblings', () => {
		const store = createStore();
		store.addRule(store.filter().nodeId);
		store.addRule(store.filter().nodeId);
		const [first, second] = store.filter().children;

		store.updateRule(first.nodeId, { fieldPath: ['name'], operatorName: '_eq', operand: { source: 'literal', value: 'grass' } });

		const updated = store.filter().children;
		expect(updated[0]).toMatchObject({ fieldPath: ['name'], operatorName: '_eq' });
		expect(updated[1].nodeId).toBe(second.nodeId);
	});

	it('removes a node by identifier, including from a nested group', () => {
		const store = createStore();
		store.addGroup(store.filter().nodeId);
		const nested = store.filter().children[0];
		store.addRule(nested.nodeId);
		const nestedRule = (store.filter().children[0] as unknown as { children: { nodeId: string }[] }).children[0];

		store.removeNode(nestedRule.nodeId);

		expect((store.filter().children[0] as unknown as { children: unknown[] }).children).toEqual([]);
	});

	it('reports the compile result as incomplete while the builder is empty', () => {
		const store = createStore();

		expect(store.compileResult().status).toBe('incomplete');
	});

	it('records both the value and the GraphQL type name when a value is resolved', () => {
		const store = createStore();

		store.setResolvedValue('variable_1', 'grass', 'String');

		expect(store.resolvedValues().get('variable_1')).toBe('grass');
		expect(store.variableTypeNames().get('variable_1')).toBe('String');
	});

	it('resets the filter to a fresh empty root group when the resource changes', () => {
		const store = createStore();
		store.addRule(store.filter().nodeId);

		store.selectResource('pokemon');

		expect(store.resourceName()).toBe('pokemon');
		expect(store.filter().children).toEqual([]);
		expect(store.filter().combinator).toBe('and');
	});

	it('rebuilds only the path to the changed node, leaving untouched branches referentially identical', () => {
		const store = createStore();
		store.addRule(store.filter().nodeId);
		store.addGroup(store.filter().nodeId);
		const [firstRule, untouchedGroup] = store.filter().children;

		store.updateRule(firstRule.nodeId, { operatorName: '_eq' });

		const updatedChildren = store.filter().children;
		expect(updatedChildren[1]).toBe(untouchedGroup);
	});
});
