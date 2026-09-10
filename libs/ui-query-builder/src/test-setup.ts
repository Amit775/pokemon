import { TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { setupZonelessTestEnv } from 'jest-preset-angular/setup-env/zoneless';

setupZonelessTestEnv({
	errorOnUnknownElements: true,
	errorOnUnknownProperties: true,
});

afterEach(() => {
	TestBed.inject(OverlayContainer).ngOnDestroy();
	TestBed.resetTestingModule();
});
