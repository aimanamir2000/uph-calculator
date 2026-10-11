// Dependency-free server: static files + tiny JSON API. Data lives in DATA_DIR (a Docker volume).
import http from 'node:http';
import { readFile, writeFile, readdir, mkdir, rm, cp, access, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.DATA_DIR || path.join(root, 'data'), PORT = +process.env.PORT || 8080;
const PRJ = path.join(DATA, 'projects'), LIB = path.join(DATA, 'library.json'), PUB = path.join(root, 'public');
const exists = p => access(p).then(() => true, () => false);
if (!await exists(LIB)) { // first run: seed library + sample projects
  await mkdir(PRJ, { recursive: true });
  await cp(path.join(root, 'seed/library.json'), LIB);
  await cp(path.join(root, 'seed/projects'), PRJ, { recursive: true });
}
{ // one-time upgrade of an existing library: servo types get the workbook's servo assumptions
  const l = JSON.parse(await readFile(LIB, 'utf8'));
  if (!l.version) {
    for (const m of l.moveTypes) if (m.id.startsWith('servo-') && m.acc == null) Object.assign(m, { vel: 1000, acc: 9810, settle: 0.05 });
    l.version = 2; await writeFile(LIB, JSON.stringify(l));
  }
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = req => new Promise((ok, no) => {
  const b = []; let n = 0;
  req.on('data', c => { n += c.length; if (n > 5e6) { no(new Error('body too large')); req.destroy(); } else b.push(c); });
  req.on('end', () => ok(Buffer.concat(b).toString())); req.on('error', no);
});

http.createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://x').pathname, m = req.method;
    if (p.startsWith('/api/')) {
      const [kind, id] = p.slice(5).split('/');
      if (kind === 'library') {
        if (m === 'PUT') await writeFile(LIB, JSON.stringify(JSON.parse(await readBody(req))));
        return send(res, 200, await readFile(LIB, 'utf8'));
      }
      if (kind === 'reference') return send(res, 200, await readFile(path.join(root, 'seed/motion_reference.json'), 'utf8'));
      if (kind === 'projects') {
        if (!id) {
          const out = [];
          for (const f of await readdir(PRJ)) if (f.endsWith('.json')) {
            const j = JSON.parse(await readFile(path.join(PRJ, f), 'utf8'));
            out.push({ id: j.id, customer: j.customer, job: j.job, updated: (await stat(path.join(PRJ, f))).mtimeMs });
          }
          return send(res, 200, out);
        }
        if (!/^[\w-]+$/.test(id)) return send(res, 400, { error: 'bad id' });
        const f = path.join(PRJ, id + '.json');
        if (m === 'PUT') { const j = JSON.parse(await readBody(req)); j.id = id; await writeFile(f, JSON.stringify(j, null, 1)); return send(res, 200, { ok: true }); }
        if (m === 'DELETE') { await rm(f, { force: true }); return send(res, 200, { ok: true }); }
        return send(res, 200, await readFile(f, 'utf8'));
      }
      return send(res, 404, { error: 'not found' });
    }
    const f = path.join(PUB, p === '/' ? 'index.html' : p);
    if (!f.startsWith(PUB)) return send(res, 403, 'forbidden', 'text/plain');
    send(res, 200, await readFile(f), MIME[path.extname(f)] || 'application/octet-stream');
  } catch (e) { send(res, e.code === 'ENOENT' ? 404 : 500, { error: e.message }); }
}).listen(PORT, () => console.log(`UPH Calc listening on :${PORT} (data: ${DATA})`));
