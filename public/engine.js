// Pure calculation engine, shared by the browser and the tests. No I/O.
const has = x => x !== null && x !== undefined && x !== '';

/** Trapezoidal servo move time (s). d mm, v mm/s, a mm/s², s settling s. null if v/a invalid. */
export function servoTime(d, v, a, s = 0) {
  if (!(v > 0 && a > 0)) return null;
  d = d || 0;
  const t = v * v / a >= d ? 2 * Math.sqrt(d / a) : (d - v * v / a) / v + 2 * v / a;
  return t + (s || 0);
}

/** steps: [{id,task,typeId,dist,vel,acc,settle,ovr,deps:[stepId]}], lib: Map(typeId -> {time}) */
export function schedule(steps, lib) {
  const idx = new Map(steps.map((s, i) => [s.id, i])), rows = [], busy = new Set();
  const get = i => {
    if (rows[i]) return rows[i];
    if (busy.has(i)) throw new Error(`Circular dependency at step ${i + 1}`);
    busy.add(i);
    const s = steps[i];
    const t = lib.get(s.typeId);
    const calc = has(s.acc) && +s.acc !== 0 ? servoTime(+s.dist, +s.vel, +s.acc, +s.settle)   // step's own servo values
      : t && has(t.acc) && +t.acc > 0 && has(s.dist) ? servoTime(+s.dist, +t.vel, +t.acc, t.settle) // type's servo values + distance
      : (t?.time ?? null);                                                                     // type table time
    const ovr = has(s.ovr) ? +s.ovr : null, dur = ovr ?? calc ?? 0;
    const deps = (s.deps || []).map(d => idx.get(d)).filter(d => d !== undefined);
    const start = deps.length ? Math.max(...deps.map(d => get(d).finish)) : (i ? get(i - 1).finish : 0);
    busy.delete(i);
    return rows[i] = { id: s.id, n: i + 1, calc, dur, start, finish: start + dur, warn: calc == null && ovr == null && !!s.task };
  };
  try { steps.forEach((_, i) => get(i)); return { rows, cycle: Math.max(0, ...rows.map(r => r.finish)) }; }
  catch (e) { return { rows: [], cycle: 0, error: e.message }; }
}

export const summary = (rows, sf = 0.1, nUp = 1) => {
  const cycle = Math.max(0, ...rows.map(r => r.finish)), est = cycle * (1 + sf), ppm = est ? nUp * 60 / est : null;
  return { cycle, est, ppm, uph: ppm == null ? null : ppm * 60 };
};
