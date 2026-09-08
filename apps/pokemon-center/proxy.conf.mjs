import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Dev-server proxy for both GraphQL APIs.
 *
 * The frontend asks for `/api/champions/graphql`, never `http://localhost:3001/graphql`. That
 * indirection is what lets two checkouts run at once: an absolute port in the browser bundle
 * ties the app to exactly one backend, so a second worktree could build but never talk to its
 * own services.
 *
 * A module rather than JSON so the ports can be derived instead of edited. `.worktree-slot` is
 * written by `tools/worktree.mjs` and is untracked, which means this file — the one in git — is
 * byte-identical in every worktree and never shows up as a local modification.
 */

const SLOT_FILE = join(import.meta.dirname, '..', '..', '.worktree-slot');

/** Slot 0 is the main checkout, on the ports every doc already quotes. */
function slot() {
	if (!existsSync(SLOT_FILE)) return 0;

	const parsed = Number.parseInt(readFileSync(SLOT_FILE, 'utf8').trim(), 10);
	return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

const offset = slot() * 100;

const to = (port, prefix) => ({
	target: `http://localhost:${port + offset}`,
	secure: false,
	changeOrigin: true,
	pathRewrite: { [`^${prefix}`]: '' },
});

export default {
	'/api/pokedex': to(3000, '/api/pokedex'),
	'/api/champions': to(3001, '/api/champions'),
	'/api/query-builder': {
		target: 'http://localhost:8080',
		secure: false,
		changeOrigin: true,
		pathRewrite: { '^/api/query-builder/graphql': '/v1/graphql' },
	},
};
