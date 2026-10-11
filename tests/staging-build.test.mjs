import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
for (const origin of ['', 'https://naatti21.github.io', 'https://naatti21.github.io/staging', 'http://example.pages.dev', 'https://example.pages.dev/path']) {
  test(`staging refuses unsafe or absent origin: ${origin || '(missing)'}`, () => {
    const r = spawnSync(process.execPath, ['scripts/build-staging.mjs'], { env: { ...process.env, STAGING_ORIGIN: origin }, encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /STAGING_ORIGIN|exact HTTPS/);
  });
}
test('Cloudflare refuses to build staging from main', () => {
  const r = spawnSync(process.execPath, ['scripts/build-staging.mjs'], { env: { ...process.env,
    STAGING_ORIGIN: 'https://example.pages.dev', CF_PAGES: '1', CF_PAGES_BRANCH: 'main' }, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /develop only/);
});
