// Build a second *synthetic* resort in an isolated temporary directory.
// No invented piste or DEM is added to the published game's resources.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fixture = require('./reality-fixture.cjs');
const root = path.join(__dirname, '..');

function catalogFromHTML(html) {
  const attr = /data-reality-catalog="([^"]+)"/.exec(html);
  assert(attr, 'built HTML must have a tiny inline catalog');
  return JSON.parse(attr[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
}

test('build adds a second resort without engine edits and revisions only the changed pack', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cold-smoke-resort-build-'));
  try {
    for (const rel of ['src', 'xhs/fonts']) {
      fs.cpSync(path.join(root, rel), path.join(temp, rel), { recursive: true });
    }
    for (const rel of ['build.js', 'template.html']) {
      fs.copyFileSync(path.join(root, rel), path.join(temp, rel));
    }
    fs.mkdirSync(path.join(temp, 'data/reality'), { recursive: true });
    const registry = { version: 1, resorts: [
      { id: 'alpe-dhuez', name: 'Alpe d’Huez' },
      { id: 'second-resort', name: 'Test-only Resort' },
    ] };
    const write = (p, data) => fs.writeFileSync(path.join(temp, p), JSON.stringify(data) + '\n');
    write('data/reality/catalog.json', registry);
    write('data/reality/alpe-dhuez.json', fixture());
    const other = fixture();
    other.id = 'second-resort';
    other.elevationSource = 'TEST-ONLY-SECOND-DEM-PACK';
    write('data/reality/second-resort.json', other);
    const build = () => {
      const result = spawnSync(process.execPath, ['build.js'], { cwd: temp, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      return fs.readFileSync(path.join(temp, 'dist/index.html'), 'utf8');
    };
    const first = build();
    const list = catalogFromHTML(first);
    assert.equal(list.length, 2);
    assert.deepEqual(list.map(r => r.id), ['alpe-dhuez', 'second-resort']);
    assert.equal(list[0].network, false);
    assert.equal(list[1].network, false);
    assert.match(list[0].revision, /^[a-f0-9]{16}$/);
    assert.equal(first.includes('TEST-ONLY-SECOND-DEM-PACK'), false);
    assert.equal(first.includes('data-reality-asset="available"'), true);
    for (const id of ['alpe-dhuez', 'second-resort']) {
      assert.equal(fs.existsSync(path.join(temp, 'dist/reality', id + '.json')), true);
    }
    other.elevationSource = 'TEST-ONLY-SECOND-DEM-PACK-updated';
    write('data/reality/second-resort.json', other);
    const second = catalogFromHTML(build());
    assert.equal(list[0].revision, second[0].revision);
    assert.notEqual(list[1].revision, second[1].revision);
    assert.equal(first.length > 100000, true);
    registry.resorts[1].id = '../arbitrary-asset';
    write('data/reality/catalog.json', registry);
    const invalid = spawnSync(process.execPath, ['build.js'], { cwd: temp, encoding: 'utf8' });
    assert.notEqual(invalid.status, 0, 'path traversal must fail build validation');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});


test('procedural-only build works without a catalog or DEM; optional packs are skipped', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cold-smoke-no-resort-'));
  try {
    for (const rel of ['src', 'xhs/fonts'])
      fs.cpSync(path.join(root, rel), path.join(temp, rel), { recursive: true });
    for (const rel of ['build.js', 'template.html'])
      fs.copyFileSync(path.join(root, rel), path.join(temp, rel));
    const run = () => spawnSync(process.execPath, ['build.js'], { cwd: temp, encoding: 'utf8' });
    const verifyNoReality = () => {
      const html = fs.readFileSync(path.join(temp, 'dist/index.html'), 'utf8');
      assert.equal(html.includes('data-reality-asset="missing"'), true);
      assert.equal(html.includes('data-network-asset="missing"'), true);
      assert.deepEqual(catalogFromHTML(html), []);
      assert.deepEqual(fs.readdirSync(path.join(temp, 'dist/reality')), []);
      assert.match(html, /id="view"/, 'procedural game remains playable');
    };
    let build = run();
    assert.equal(build.status, 0, build.stderr);
    verifyNoReality(); // also supports checkouts without the catalog
    fs.mkdirSync(path.join(temp, 'data/reality'), { recursive: true });
    const catalogPath = path.join(temp, 'data/reality/catalog.json');
    fs.writeFileSync(catalogPath, JSON.stringify({
      version: 1, resorts: [{ id: 'alpe-dhuez', name: 'Alpe d’Huez', optional: true }],
    }));
    build = run();
    assert.equal(build.status, 0, build.stderr);
    assert.match(build.stderr, /Skipping optional resort pack/);
    verifyNoReality(); // absent licensed DEM must not block original Cold Smoke
    fs.writeFileSync(catalogPath, JSON.stringify({
      version: 1, resorts: [{ id: 'alpe-dhuez', name: 'Required Resort' }],
    }));
    build = run();
    assert.notEqual(build.status, 0, 'missing required pack must still fail');
    fs.writeFileSync(catalogPath, JSON.stringify({ version: 1, resorts: [] }));
    build = run();
    assert.equal(build.status, 0, build.stderr);
    verifyNoReality();
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
