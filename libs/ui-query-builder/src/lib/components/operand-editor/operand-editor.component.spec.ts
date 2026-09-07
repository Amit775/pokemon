import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import type { FilterOperand } from '../../core/model/query-tree';
import { OperandEditorComponent } from './operand-editor.component';

describe('OperandEditorComponent', () => {
	let spectator: Spectator<OperandEditorComponent>;
	const createComponent = createComponentFactory({ component: OperandEditorComponent });

	it('renders a literal input by default', () => {
		spectator = createComponent({ props: { operand: { source: 'literal', value: 'pikachu' } } });

		const literalInput = spectator.query<HTMLInputElement>('[data-testid="operand-literal-input"]');
		expect(literalInput).toExist();
		expect(literalInput?.value).toBe('pikachu');
		expect(spectator.query('[data-testid="operand-subquery-editor"]')).not.toExist();
	});

	it('reveals the subquery editor when the source switches to subquery', () => {
		spectator = createComponent({ props: { operand: { source: 'literal', value: null } } });

		let latestOperand: FilterOperand | undefined;
		spectator.output('operandChange').subscribe((operand) => (latestOperand = operand));

		const subqueryOption = spectator.query<HTMLElement>('[data-testid="operand-source-subquery"]');
		if (!subqueryOption) throw new Error('expected a subquery source option');
		spectator.click(subqueryOption);
		spectator.detectChanges();

		expect(latestOperand?.source).toBe('subquery');
		if (!latestOperand) throw new Error('expected an emitted operand');
		spectator.setInput('operand', latestOperand);
		spectator.detectChanges();

		expect(spectator.query('[data-testid="operand-subquery-editor"]')).toExist();
	});

	it('emits a literal operand matching the discriminated union when typed', () => {
		spectator = createComponent({ props: { operand: { source: 'literal', value: '' } } });

		let latestOperand: FilterOperand | undefined;
		spectator.output('operandChange').subscribe((operand) => (latestOperand = operand));

		const literalInput = spectator.query<HTMLInputElement>('[data-testid="operand-literal-input"]');
		if (!literalInput) throw new Error('expected the literal input');
		spectator.typeInElement('25', literalInput);

		expect(latestOperand).toEqual({ source: 'literal', value: '25' });
	});

	it('displays the resolved value alongside the subquery description', () => {
		const operand: FilterOperand = {
			source: 'subquery',
			subquery: {
				resourceName: 'Pokemon',
				filter: null,
				selector: { kind: 'aggregate', functionName: 'avg', fieldPath: ['height'] },
			},
		};
		spectator = createComponent({ props: { operand, resolvedValue: 12 } });

		const resolved = spectator.query('[data-testid="operand-resolved-value"]');
		expect(resolved).toExist();
		expect(resolved?.textContent).toContain('avg of height on Pokemon');
		expect(resolved?.textContent).toContain('12');
	});
});
