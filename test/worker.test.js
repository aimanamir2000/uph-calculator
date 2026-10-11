import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/index.js';

// Minimal D1-shaped shim over real SQLite, so the Worker's SQL is genuinely exercised.
const sqlite = new DatabaseSync(':memory:');
const stmt = (sql, args = []) => ({
  bind: (...a) => stmt(sql, a),
  run: async () => { sqlite.prepare(sql).run(...args); return { success: true }; },
  first: async () => sqlite.prepare(sql).get(...args) ?? null,
  all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
});
const env = { DB: { prepare: sql => stmt(sql), batch: async ss => { for (const s of ss) await s.run(); } }, ASSETS: { fetch: async () => new Response('asset') } };
const call = (path, method = 'GET', body) => worker.fetch(new Request('http://x' + path, { method, body: body && JSON.stringify(body) }), env);

test('seeds library and sample projects on first request', async () => {
  const list = await (await call('/api/projects')).json();
  assert.equal(list.length, 2);
  assert.ok((await (await call('/api/library')).json()).moveTypes.length > 10);
  assert.ok((await (await call('/api/reference')).json()).length > 3);
});
test('project create / read / update / delete', async () => {
  await call('/api/projects/abc-1', 'PUT', { id: 'wrong', job: 'J1', customer: 'C', steps: [] });
  assert.equal((await (await call('/api/projects/abc-1')).json()).id, 'abc-1');
  await call('/api/projects/abc-1', 'PUT', { job: 'J2', steps: [] });
  assert.equal((await (await call('/api/projects/abc-1')).json()).job, 'J2');
  assert.equal((await (await call('/api/projects')).json()).length, 3);
  await call('/api/projects/abc-1', 'DELETE');
  assert.equal((await call('/api/projects/abc-1')).status, 404);
});
test('library edits persist and are not re-seeded', async () => {
  const lib = await (await call('/api/library')).json(); lib.moveTypes[0].name = 'Edited';
  await call('/api/library', 'PUT', lib);
  assert.equal((await (await call('/api/library')).json()).moveTypes[0].name, 'Edited');
});
test('bad ids rejected; non-API paths go to static assets', async () => {
  assert.equal((await call('/api/projects/a%20b')).status, 400);
  assert.equal(await (await call('/index.html')).text(), 'asset');
});
