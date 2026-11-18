// concatenates src/*.js (sorted) + template into dist/index.html (single self-contained page)
// Blocks marked /*native{*/ … /*}native*/ are the iOS and visionOS paths. The web page leaves them out;
// ios/build-resources.sh concatenates the sources as they are.
const fs = require('fs'), path = require('path'), vm = require('vm');
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
const realityAsset = 'reality/alpe-dhuez.json';
const source = path.join(root, 'data', realityAsset);
const target = path.join(root, 'dist', realityAsset);
const hasReality = fs.existsSync(source);
if (hasReality) {
  const context = vm.createContext({ asset: fs.readFileSync(source, 'utf8') });
  vm.runInContext(fs.readFileSync(path.join(srcDir, '02a_reality.js'), 'utf8') +
    '\nReality.create(JSON.parse(asset));', context);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  tpl = tpl.replace('data-reality-asset="missing"', 'data-reality-asset="available"');
} else {
  fs.rmSync(target, { force: true });
}
const out = tpl.replace('/*__JS__*/', () => js);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), out);
// dev variant with a full html skeleton (the artifact host adds its own)
fs.writeFileSync(path.join(root, 'dist', 'dev.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + out + '</body></html>');
console.log('built', (out.length / 1024).toFixed(1) + ' KB', files.length, 'files', 'left out', stripped.n, 'native blocks');
