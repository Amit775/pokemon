import { Clipboard } from '@angular/cdk/clipboard';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import type { CompileResult } from '../../core/compiler/compile-query';
import { QueryPreviewComponent } from './query-preview.component';

describe('QueryPreviewComponent', () => {
	let spectator: Spectator<QueryPreviewComponent>;
	const createComponent = createComponentFactory({ component: QueryPreviewComponent });

	it('renders the printed document and its variables for a complete result', () => {
		const compileResult: CompileResult = {
			status: 'complete',
			document: 'query BuiltQuery { pokemon { id } }',
			variables: { limit: 10 },
		};
		spectator = createComponent({ props: { compileResult } });

		expect(spectator.query('[data-testid="query-document"]')).toHaveText('query BuiltQuery { pokemon { id } }');
		expect(spectator.query('[data-testid="query-variables"]')).toHaveText(JSON.stringify({ limit: 10 }, null, 2));
	});

	it('renders each issue message instead of a document for an incomplete result', () => {
		const compileResult: CompileResult = {
			status: 'incomplete',
			issues: [
				{ nodeId: 'rule-1', reason: 'incompleteRule', message: 'This rule needs both a field and an operator.' },
				{ nodeId: null, reason: 'emptySelection', message: 'Choose at least one field to return.' },
			],
		};
		spectator = createComponent({ props: { compileResult } });

		expect(spectator.query('[data-testid="query-document"]')).not.toExist();
		const messages = spectator.queryAll('[data-testid="issue-message"]').map((element) => element.textContent?.trim());
		expect(messages).toEqual(['This rule needs both a field and an operator.', 'Choose at least one field to return.']);
	});

	it('copies the document to the clipboard when the copy button is used', () => {
		const compileResult: CompileResult = { status: 'complete', document: 'query BuiltQuery { pokemon { id } }', variables: {} };
		spectator = createComponent({ props: { compileResult } });
		const clipboard = spectator.inject(Clipboard);
		const copySpy = jest.spyOn(clipboard, 'copy').mockReturnValue(true);

		spectator.click('[data-testid="copy-button"]');

		expect(copySpy).toHaveBeenCalledWith('query BuiltQuery { pokemon { id } }');
	});
});
