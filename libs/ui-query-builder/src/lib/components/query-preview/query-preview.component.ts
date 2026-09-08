import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CdkCopyToClipboard } from '@angular/cdk/clipboard';
import type { CompileResult } from '../../core/compiler/compile-query';

@Component({
	selector: 'pokedex-query-preview',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CdkCopyToClipboard],
	template: `
		<div class="query-preview">
			@if (compileResult().status === 'complete') {
				<button type="button" class="copy-button" data-testid="copy-button" [cdkCopyToClipboard]="documentText()">Copy</button>
				<pre class="query-document" data-testid="query-document">{{ documentText() }}</pre>
				<pre class="query-variables" data-testid="query-variables">{{ variablesText() }}</pre>
			} @else {
				<ul class="issue-list">
					@for (issue of issues(); track issue.nodeId ?? issue.reason) {
						<li class="issue-message" data-testid="issue-message" role="alert">{{ issue.message }}</li>
					}
				</ul>
			}
		</div>
	`,
	styles: `
		:host { display: block; }
		.query-preview { display: flex; flex-direction: column; gap: var(--s-2); }
		.copy-button {
			align-self: flex-start;
			font-size: var(--fs-xs);
			padding: var(--s-1) var(--s-3);
			border-radius: var(--r-pill);
			border: 1px solid var(--line);
			background: var(--surface);
			color: var(--accent);
			cursor: pointer;
		}
		.copy-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
		.query-document, .query-variables {
			margin: 0;
			padding: var(--s-2);
			border-radius: var(--r-md);
			border: 1px solid var(--line);
			background: var(--surface-sunken);
			color: var(--ink);
			font-family: var(--font-mono);
			font-size: var(--fs-xs);
			overflow-x: auto;
			white-space: pre;
		}
		.issue-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-1); }
		.issue-message { font-size: var(--fs-sm); color: var(--crit); }
	`,
})
export class QueryPreviewComponent {
	readonly compileResult = input.required<CompileResult>();

	protected readonly documentText = computed(() => {
		const result = this.compileResult();
		return result.status === 'complete' ? result.document : '';
	});

	protected readonly variablesText = computed(() => {
		const result = this.compileResult();
		return result.status === 'complete' ? JSON.stringify(result.variables, null, 2) : '';
	});

	protected readonly issues = computed(() => {
		const result = this.compileResult();
		return result.status === 'incomplete' ? result.issues : [];
	});
}
