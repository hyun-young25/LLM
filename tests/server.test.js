import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('production server serves files and reports API setup failure without exposing secrets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gpt-visualizer-'));
  await writeFile(join(dir, 'index.html'), '<h1>GPT visualizer</h1>');
  const server = createAppServer({ GEMINI_API_KEY: '' }, dir);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(origin);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /GPT visualizer/);
    assert.equal((await fetch(origin + '/.env')).status, 404);
    assert.equal((await fetch(origin + '/api/gemini-next-token')).status, 405);
    const api = await fetch(origin + '/api/gemini-next-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(api.status, 503);
    assert.match((await api.json()).error, /교육용 데모/);
    assert.equal(api.headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(origin + '/api/gemini-next-token', { method: 'POST', body: '{}' })).status, 415);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true });
  }
});
