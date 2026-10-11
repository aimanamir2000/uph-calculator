import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schedule, summary, servoTime } from '../public/engine.js';
const load = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const lib = new Map(load('../seed/library.json').moveTypes.map(m => [m.id, m]));
const near = (a, b, m = '') => assert.ok(Math.abs(a - b) < 1e-9, `${m} ${a} vs ${b}`);

for (const f of load('./fixtures.json')) test(`matches Excel: ${f.name}`, () => {
  const { rows, error } = schedule(f.steps, lib);
  assert.equal(error, undefined);
  f.expect.forEach((e, i) => { if (e.finish != null) { near(rows[i].start, e.start, `start#${i}`); near(rows[i].finish, e.finish, `finish#${i}`); } });
  near(summary(rows, f.sf ?? 0.1, f.nUp ?? 1).cycle, f.cycle, 'cycle');
  if (f.uph != null) near(summary(rows, f.sf, f.nUp).uph, f.uph, 'uph');
});
test('servo: triangular and trapezoid profiles', () => {
  near(servoTime(100, 1000, 9810, 0.05), 2 * Math.sqrt(100 / 9810) + 0.05);
  near(servoTime(500, 1000, 9810, 0), (500 - 1e6 / 9810) / 1000 + 2000 / 9810);
  assert.equal(servoTime(100, 0, 9810), null);
});
test('circular dependency is reported', () => {
  const r = schedule([{ id: 'a', deps: ['b'], ovr: 1 }, { id: 'b', deps: ['a'], ovr: 1 }], new Map());
  assert.match(r.error, /Circular/);
});
