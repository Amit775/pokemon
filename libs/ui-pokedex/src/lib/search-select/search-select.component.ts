import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { CdkListbox, CdkOption, type ListboxValueChangeEvent } from '@angular/cdk/listbox';

export interface SearchSelectOption {
	readonly value: string;
	readonly label: string;
	readonly group?: string;
	readonly hint?: string;
}

interface SearchSelectOptionGroup {
	readonly name: string | undefined;
	readonly options: readonly SearchSelectOption[];
}

@Component({
	selector: 'pokedex-search-select',
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CdkConnectedOverlay, CdkOverlayOrigin, CdkTrapFocus, CdkListbox, CdkOption],
	template: `
		<div class="search-select">
			<button
				type="button"
				class="trigger"
				cdkOverlayOrigin
				#origin="cdkOverlayOrigin"
				data-testid="search-select-trigger"
				aria-haspopup="listbox"
				[attr.aria-expanded]="isOpen()"
				(click)="toggleOpen()"
			>
				{{ triggerLabel() }}
			</button>

			<ng-template
				cdkConnectedOverlay
				[cdkConnectedOverlayOrigin]="origin"
				[cdkConnectedOverlayOpen]="isOpen()"
				[cdkConnectedOverlayHasBackdrop]="true"
				cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
				(backdropClick)="close()"
				(detach)="close()"
			>
				<div class="panel" cdkTrapFocus tabindex="-1" data-testid="search-select-panel">
					@if (searchable()) {
						<input
							type="text"
							class="search-input"
							data-testid="search-select-search"
							autocomplete="off"
							[value]="searchText()"
							(input)="onSearchInput($event)"
							(keydown.escape)="close()"
						/>
					}
					@if (loading()) {
						<div class="status" data-testid="search-select-loading">Loading…</div>
					} @else if (errorMessage()) {
						<div class="status status-error" data-testid="search-select-error">{{ errorMessage() }}</div>
					} @else if (groupedOptions().length === 0) {
						<div class="status" data-testid="search-select-empty">No matches</div>
					} @else {
						<ul class="option-list" cdkListbox [cdkListboxValue]="selectedValues()" (cdkListboxValueChange)="onValueChange($event)">
							@for (group of groupedOptions(); track group.name) {
								@if (group.name) {
									<li class="group-header" data-testid="search-select-group">{{ group.name }}</li>
								}
								@for (option of group.options; track option.value) {
									<li [cdkOption]="option.value" class="option" data-testid="search-select-option">
										{{ option.label }}
									</li>
								}
							}
						</ul>
					}
				</div>
			</ng-template>
		</div>
	`,
	styles: `
		:host {
			display: inline-block;
		}
		.trigger {
			font: inherit;
			font-size: var(--fs-sm);
			padding: var(--s-1) var(--s-3);
			border-radius: var(--r-md);
			border: 1px solid var(--line);
			background: var(--surface);
			color: var(--ink);
			cursor: pointer;
		}
		.panel {
			min-width: 14rem;
			max-height: 18rem;
			overflow-y: auto;
			padding: var(--s-2);
			border-radius: var(--r-md);
			border: 1px solid var(--line);
			background: var(--surface-raised);
			box-shadow: var(--shadow-lg);
		}
		.search-input {
			font: inherit;
			font-size: var(--fs-sm);
			width: 100%;
			box-sizing: border-box;
			padding: var(--s-1) var(--s-2);
			margin-bottom: var(--s-2);
			border-radius: var(--r-sm);
			border: 1px solid var(--line);
			background: var(--surface);
			color: var(--ink);
		}
		.option-list {
			list-style: none;
			margin: 0;
			padding: 0;
			display: flex;
			flex-direction: column;
		}
		.group-header {
			font-size: var(--fs-xs);
			font-weight: 700;
			color: var(--ink-muted);
			padding: var(--s-1) var(--s-2);
		}
		.option {
			font-size: var(--fs-sm);
			padding: var(--s-1) var(--s-2);
			border-radius: var(--r-sm);
			color: var(--ink);
			cursor: pointer;
		}
		.option:hover {
			background: var(--surface-sunken);
		}
		.status {
			font-size: var(--fs-sm);
			color: var(--ink-muted);
			padding: var(--s-2);
		}
		.status-error {
			color: var(--crit);
		}
		.trigger:focus-visible,
		.search-input:focus-visible,
		.option:focus-visible {
			outline: 2px solid var(--accent);
			outline-offset: 2px;
		}
		@media (prefers-reduced-motion: reduce) {
			.trigger {
				transition: none;
			}
		}
	`,
})
export class SearchSelectComponent {
	readonly options = input<readonly SearchSelectOption[]>([]);
	readonly value = input<string | null>(null);
	readonly placeholder = input<string>('');
	readonly loading = input<boolean>(false);
	readonly errorMessage = input<string | null>(null);
	readonly searchable = input<boolean>(true);

	readonly valueChosen = output<string>();
	readonly searchTextChanged = output<string>();

	protected readonly isOpen = signal(false);
	protected readonly searchText = signal('');

	protected readonly selectedValues = computed(() => {
		const currentValue = this.value();
		return currentValue === null ? [] : [currentValue];
	});

	protected readonly triggerLabel = computed(() => {
		const selectedOption = this.options().find((option) => option.value === this.value());
		return selectedOption ? selectedOption.label : this.placeholder();
	});

	protected readonly groupedOptions = computed<readonly SearchSelectOptionGroup[]>(() => {
		const searchTerm = this.searchable() ? this.searchText().trim().toLowerCase() : '';
		const matchingOptions = this.options().filter((option) => searchTerm === '' || option.label.toLowerCase().includes(searchTerm));

		const groups = new Map<string | undefined, SearchSelectOption[]>();
		for (const option of matchingOptions) {
			const existingGroup = groups.get(option.group);
			if (existingGroup) {
				existingGroup.push(option);
			} else {
				groups.set(option.group, [option]);
			}
		}

		return Array.from(groups.entries()).map(([name, groupOptions]) => ({ name, options: groupOptions }));
	});

	protected toggleOpen(): void {
		const nextOpen = !this.isOpen();
		this.isOpen.set(nextOpen);
		if (!nextOpen) this.searchText.set('');
	}

	protected close(): void {
		this.isOpen.set(false);
		this.searchText.set('');
	}

	protected onSearchInput(event: Event): void {
		const searchText = (event.target as HTMLInputElement).value;
		this.searchText.set(searchText);
		this.searchTextChanged.emit(searchText);
	}

	protected onValueChange(event: ListboxValueChangeEvent<string>): void {
		const chosenValue = event.value[0];
		if (chosenValue === undefined) return;
		this.valueChosen.emit(chosenValue);
		this.close();
	}
}
