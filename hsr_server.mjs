// 开发服务器。**开发用，成品不用它。**
//
//   node hsr_server.mjs            起在 http://localhost:8777
//   node hsr_server.mjs 9000       换端口
//
// 它只做一件事：把 ui/template.html 里的两个占位符换成开发期的注入方式，
// 其余文件原样返回。这样开发期和成品跑的是**同一份模板、同一份 app.mjs** ——
// 差别只有「数据怎么塞进去」，不会有「开发能跑、打包就坏」这种破事。
//
// 为什么需要它：浏览器对 ES 模块有 file:// 的 CORS 限制，双击打开 ui/template.html
// 会因为模块跨目录 import 被拦。走 http 就没这个问题。
// ★ 但成品（单文件 HTML）**双击即用**，它不 import 任何东西 —— 数据和控制台都在一个文件里。
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || 8777;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

/**
 * 占位符替换。
 *
 * ★ 必须断言「恰好出现一次」★
 *   这里踩过一次：模板的说明注释里也写了占位符的字面量，而 String.replace
 *   只换**第一处**，于是替换发生在注释里，真正的占位符原样留在页面上 ——
 *   页面白屏，控制台还什么都不说。断言一次就能挡住。
 */
function inject(tpl, marker, payload, what) {
  const n = tpl.split(marker).length - 1;
  if (n !== 1) throw new Error(`模板里 ${what} 占位符 ${marker} 出现了 ${n} 次，应该恰好 1 次`);
  return tpl.replace(marker, () => payload);
}

/** 用模板 + 开发期注入拼出首页。 */
function page() {
  const tpl = fs.readFileSync(path.join(ROOT, 'ui', 'template.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'ui', 'style.css'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'ui', 'theme-light.css'), 'utf8');
  const data = fs.existsSync(path.join(ROOT, '_data_cache', 'hsr_core.json'))
    ? '<script src="/_data_cache/data.inline.js"></script>'
    : '<div class="card">缺少 _data_cache/data.inline.js，先跑 <code>node _scripts/build_data.mjs</code></div>';
  let out = inject(tpl, '/*__CSS__*/', css, '样式');
  out = inject(out, '<!--__DATA__-->', data, '数据');
  return inject(out, '<!--__BOOT__-->', '<script type="module" src="/ui/app.mjs"></script>', '启动');
}

const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent((req.url ?? '/').split('?')[0]); }
  catch { res.writeHead(400); res.end('invalid URL'); return; }
  try {
    if(url === '/_data_cache/data.inline.js') {
      const raw=fs.readFileSync(path.join(ROOT,'_data_cache','hsr_core.json'),'utf8');
      JSON.parse(raw);
      res.writeHead(200,{'Content-Type':MIME['.js']});
      res.end('window.__HSR_DATA__ = JSON.parse('+JSON.stringify(raw)+');');
      return;
    }
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(page());
      return;
    }
    // 只允许访问仓库内的文件，挡住 ../
    const rel = url.replace(/^\/+/, '');
    const abs = path.resolve(ROOT, rel);
    if (!abs.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end('forbidden'); return; }
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) { res.writeHead(404); res.end('not found: ' + rel); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] ?? 'application/octet-stream' });
    res.end(fs.readFileSync(abs));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(e.stack ?? e));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`开发服务器: http://localhost:${PORT}/`);
  console.log('（关掉这个窗口就停；Ctrl+C 也行）');
});
