// Cloudflare Worker adapter: same JSON API as server.js, stored in D1. Static files come from ./public (assets binding).
import library from '../seed/library.json' with { type: 'json' };
import reference from '../seed/motion_reference.json' with { type: 'json' };
import sample1 from '../seed/projects/sample-fiber-splicing.json' with { type: 'json' };
import sample2 from '../seed/projects/sample-fiber-splicing-2.json' with { type: 'json' };

const JSON_H = { 'Content-Type': 'application/json' };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: JSON_H });
const raw = body => new Response(body, { headers: JSON_H });
const put = (env, id, kind, obj) => env.DB.prepare(
  'INSERT INTO docs (id, kind, body, updated) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET body = ?3, updated = ?4'
).bind(id, kind, JSON.stringify(obj), Date.now());

let ready; // create table + seed once per isolate
const init = env => ready ??= (async () => {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS docs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL, updated INTEGER NOT NULL)').run();
  if (!await env.DB.prepare("SELECT 1 AS x FROM docs WHERE id = 'library'").first())
    await env.DB.batch([put(env, 'library', 'library', library), ...[sample1, sample2].map(p => put(env, 'project:' + p.id, 'project', p))]);
})().catch(e => { ready = undefined; throw e; });

export default {
  async fetch(req, env) {
    const url = new URL(req.url), m = req.method;
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      await init(env);
      const [, , kind, id] = url.pathname.split('/');
      if (kind === 'reference') return json(reference);
      if (kind === 'library') {
        if (m === 'PUT') await put(env, 'library', 'library', await req.json()).run();
        return raw((await env.DB.prepare("SELECT body FROM docs WHERE id = 'library'").first()).body);
      }
      if (kind === 'projects') {
        if (!id) {
          const { results } = await env.DB.prepare("SELECT body, updated FROM docs WHERE kind = 'project'").all();
          return json(results.map(r => { const j = JSON.parse(r.body); return { id: j.id, customer: j.customer, job: j.job, updated: r.updated }; }));
        }
        if (!/^[\w-]+$/.test(id)) return json({ error: 'bad id' }, 400);
        const key = 'project:' + id;
        if (m === 'PUT') { const j = await req.json(); j.id = id; await put(env, key, 'project', j).run(); return json({ ok: true }); }
        if (m === 'DELETE') { await env.DB.prepare('DELETE FROM docs WHERE id = ?1').bind(key).run(); return json({ ok: true }); }
        const r = await env.DB.prepare('SELECT body FROM docs WHERE id = ?1').bind(key).first();
        return r ? raw(r.body) : json({ error: 'not found' }, 404);
      }
      return json({ error: 'not found' }, 404);
    } catch (e) { return json({ error: e.message }, 500); }
  },
};
