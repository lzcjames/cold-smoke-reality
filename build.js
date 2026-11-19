// concatenates src/*.js (sorted) + template into dist/index.html (single self-contained page)
// Blocks marked /*native{*/ … /*}native*/ are the iOS and visionOS paths. The web page leaves them out;
// ios/build-resources.sh concatenates the sources as they are.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const root = __dirname, srcDir = path.join(root, 'src');
function stripNative(src) {
  const open = (src.match(/\/\*native\{\*\//g) || []).length;
  const close = (src.match(/\/\*\}native\*\//g) || []).length;
  if (open !== close) throw new Error('unbalanced /*native{*/ markers: ' + open + ' open, ' + close + ' close');
  const out = src.replace(/\/\*native\{\*\/[\s\S]*?\/\*\}native\*\//g, '');
  if (out.includes('/*native{*/') || out.includes('/*}native*/')) throw new Error('unbalanced /*native{*/ markers');
  return { out, n: open };
}
const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.js')).sort();
let js = '';
for (const f of files) js += '\n// ===== ' + f + ' =====\n' + fs.readFileSync(path.join(srcDir, f), 'utf8');
const stripped = stripNative(js);
js = stripped.out;
let tpl = fs.readFileSync(path.join(root, 'template.html'), 'utf8');
// the three faces ride inside the page (the same subsets the 小红书 package carries, xhs/fonts/, made by tools/fetch-xhs-fonts.js), so the
// title is set in its own Song wherever Google Fonts cannot be reached. The template's loader sees #faces and fetches nothing
{
  const fd = path.join(root, 'xhs', 'fonts');
  const css = fs.readFileSync(path.join(fd, 'fonts.css'), 'utf8').replace(/\/\*[\s\S]*?\*\/\s*/g, '')
    .replace(/url\(\.\/([\w.-]+\.woff2)\)/g, (_, f) => 'url(data:font/woff2;base64,' + fs.readFileSync(path.join(fd, f)).toString('base64') + ')');
  if (!tpl.includes('<style>')) throw new Error('template.html: no <style> to put the faces before');
  tpl = tpl.replace('<style>', () => '<style id="faces">' + css.trim() + '</style>\n<style>');
}
// Resource catalog is tiny and lives in the HTML shell. DEMs remain separate,
// version-addressed JSON packs. The default procedural run never fetches them.
const registry = JSON.parse(fs.readFileSync(path.join(root, 'data/reality/catalog.json'), 'utf8'));
if (registry.version !== 1 || !Array.isArray(registry.resorts) || !registry.resorts.length ||
    registry.resorts.length > 100) throw Error('Invalid resort catalog.');
const outDir = path.join(root, 'dist/reality');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const list = [], seen = new Set();
const jsReality = ['02a_reality.js', '02b_piste_network.js']
  .map(file => fs.readFileSync(path.join(srcDir, file), 'utf8')).join('\n');
for (const entry of registry.resorts) {
  if (!entry || typeof entry.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id) ||
      typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 90 ||
      seen.has(entry.id)) throw Error('Invalid or duplicate resort catalog entry.');
  seen.add(entry.id);
  const source = path.join(root, 'data/reality', entry.id + '.json');
  const content = fs.readFileSync(source);
  const asset = JSON.parse(content.toString('utf8'));
  if (asset.id !== entry.id) throw Error('Resort identity mismatch: ' + entry.id);
  const context = vm.createContext({ asset });
  const network = vm.runInContext(jsReality + `
    const terrain = Reality.create(asset);
    if (asset.pistes || asset.junctions) PisteNetwork.create(terrain, asset);
    Boolean(asset.pistes && asset.junctions);
  `, context);
  const revision = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  list.push({ id: entry.id, name: entry.name, network, revision });
  fs.copyFileSync(source, path.join(outDir, entry.id + '.json'));
}
const escapeAttribute = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
if (!tpl.includes('data-reality-catalog="missing"')) {
  throw Error('template.html missing resort catalog placeholder.');
}
tpl = tpl.replace('data-reality-catalog="missing"',
  'data-reality-catalog="' + escapeAttribute(JSON.stringify(list)) + '"');
tpl = tpl.replace('data-reality-asset="missing"', 'data-reality-asset="available"');
if (list[0].network) tpl = tpl.replace('data-network-asset="missing"', 'data-network-asset="available"');
console.log('resort packs:', list.map(r => r.id + ' @' + r.revision).join(', '));
const out = tpl.replace('/*__JS__*/', () => js);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), out);
// dev variant with a full html skeleton (the artifact host adds its own)
fs.writeFileSync(path.join(root, 'dist', 'dev.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + out + '</body></html>');
console.log('built', (out.length / 1024).toFixed(1) + ' KB', files.length, 'files', 'left out', stripped.n, 'native blocks');
