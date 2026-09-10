import { createComponentFactory, type Spectator } from '@ngneat/spectator/jest';
import { SearchSelectComponent } from './search-select.component';

const options = [
	{ value: 'pokemon', label: 'Pokémon', group: 'Core' },
	{ value: 'move', label: 'Move', group: 'Core' },
	{ value: 'berryflavor', label: 'Berry Flavor', group: 'Everything else' },
];

describe('SearchSelectComponent', () => {
	let spectator: Spectator<SearchSelectComponent>;
	const createComponent = createComponentFactory({ component: SearchSelectComponent });

	it('shows the chosen option label on the trigger', () => {
		spectator = createComponent({ props: { options, value: 'move', placeholder: 'Choose' } });

		expect(spectator.query('[data-testid="search-select-trigger"]')).toHaveText('Move');
	});

	it('shows the placeholder when nothing is chosen', () => {
		spectator = createComponent({ props: { options, value: null, placeholder: 'Choose a resource' } });

		expect(spectator.query('[data-testid="search-select-trigger"]')).toHaveText('Choose a resource');
	});

	it('lists every option grouped when opened', () => {
		spectator = createComponent({ props: { options, value: null, placeholder: 'Choose' } });
		spectator.click('[data-testid="search-select-trigger"]');

		expect(spectator.queryAll('[data-testid="search-select-option"]')).toHaveLength(3);
		expect(spectator.queryAll('[data-testid="search-select-group"]')).toHaveLength(2);
	});

	it('filters options by typed text, matching the label not the raw value', () => {
		spectator = createComponent({ props: { options, value: null, placeholder: 'Choose' } });
		spectator.click('[data-testid="search-select-trigger"]');
		spectator.typeInElement('berry', '[data-testid="search-select-search"]');
		spectator.detectChanges();

		const labels = spectator.queryAll('[data-testid="search-select-option"]').map((option) => option.textContent?.trim());
		expect(labels).toEqual(['Berry Flavor']);
	});

	it('emits the raw value, not the label, when an option is chosen', () => {
		spectator = createComponent({ props: { options, value: null, placeholder: 'Choose' } });
		const chosen: string[] = [];
		spectator.component.valueChosen.subscribe((value: string) => chosen.push(value));

		spectator.click('[data-testid="search-select-trigger"]');
		spectator.click('[data-testid="search-select-option"]');

		expect(chosen).toEqual(['pokemon']);
	});

	it('emits the search text so a caller can drive async options', () => {
		spectator = createComponent({ props: { options: [], value: null, placeholder: 'Choose' } });
		const searches: string[] = [];
		spectator.component.searchTextChanged.subscribe((text: string) => searches.push(text));

		spectator.click('[data-testid="search-select-trigger"]');
		spectator.typeInElement('raz', '[data-testid="search-select-search"]');

		expect(searches).toContain('raz');
	});

	it('shows a loading state instead of "no matches" while options are in flight', () => {
		spectator = createComponent({ props: { options: [], value: null, placeholder: 'Choose', loading: true } });
		spectator.click('[data-testid="search-select-trigger"]');

		expect(spectator.query('[data-testid="search-select-loading"]')).toExist();
		expect(spectator.query('[data-testid="search-select-empty"]')).not.toExist();
	});

	it('distinguishes an error from an empty result', () => {
		spectator = createComponent({ props: { options: [], value: null, placeholder: 'Choose', errorMessage: 'Request failed' } });
		spectator.click('[data-testid="search-select-trigger"]');

		expect(spectator.query('[data-testid="search-select-error"]')).toHaveText('Request failed');
		expect(spectator.query('[data-testid="search-select-empty"]')).not.toExist();
	});

	it('exposes combobox semantics on the trigger', () => {
		spectator = createComponent({ props: { options, value: null, placeholder: 'Choose' } });
		const trigger = spectator.query('[data-testid="search-select-trigger"]');

		expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
		expect(trigger).toHaveAttribute('aria-expanded', 'false');

		spectator.click('[data-testid="search-select-trigger"]');
		expect(spectator.query('[data-testid="search-select-trigger"]')).toHaveAttribute('aria-expanded', 'true');
	});

	it('closes on Escape without choosing anything', () => {
		spectator = createComponent({ props: { options, value: null, placeholder: 'Choose' } });
		const chosen: string[] = [];
		spectator.component.valueChosen.subscribe((value: string) => chosen.push(value));

		spectator.click('[data-testid="search-select-trigger"]');
		spectator.dispatchKeyboardEvent('[data-testid="search-select-search"]', 'keydown', 'Escape');
		spectator.detectChanges();

		expect(spectator.query('[data-testid="search-select-option"]')).not.toExist();
		expect(chosen).toEqual([]);
	});
});
