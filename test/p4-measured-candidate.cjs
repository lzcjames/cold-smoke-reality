// Validate the *unpublished* measured Les Deux Alpes pack through the same
// JS terrain/network modules shipped in the game. Never use synthetic P4 data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const assetPath = process.argv[2];
if (!assetPath) throw Error('Usage: node test/p4-measured-candidate.cjs <authentic JSON>');
const asset = JSON.parse(fs.readFileSync(assetPath, 'utf8'));
const alpe = JSON.parse(fs.readFileSync(path.join(root, 'data/reality/alpe-dhuez.json'), 'utf8'));
assert.equal(asset.id, 'les-deux-alpes');
assert.equal(alpe.id, 'alpe-dhuez');
assert.equal(asset.version, 1);
assert.equal(asset.piste.osmWay, 219409078);
assert.deepEqual(asset.pistes.map(p => p.osmWay).sort((a,b)=>a-b),
  [219409078, 643745486, 643786947].sort((a,b)=>a-b));
assert.equal(asset.junctions.length, 2);
assert.deepEqual(asset.junctions.map(j=>j.osmNode).sort((a,b)=>a-b),
  [6057592057,6057592113].sort((a,b)=>a-b));
assert.equal(asset.grid.heights.length, asset.grid.cols * asset.grid.rows);
assert.match(asset.elevationSource, /IGN LiDAR HD MNT 0\.5 m/);
assert.match(asset.provenance.demSource, /IGN LiDAR HD MNT 0\.5 m/);
assert.equal(asset.elevationSource.includes('RGE ALTI'), false);
assert.equal(asset.provenance.osmTimestampUTC, '2026-07-24T11:04:51Z');
for (const key of ['osmSha256','demSha256']) {
  assert.match(asset.provenance[key], /^[a-f0-9]{64}$/);
}
assert.deepEqual(asset.provenance.wayIds.slice().sort((a,b)=>a-b),
  asset.pistes.map(p=>p.osmWay).sort((a,b)=>a-b));
const src = ['src/02a_reality.js', 'src/02b_piste_network.js']
  .map(file => fs.readFileSync(path.join(root,file),'utf8')).join('\n');
const ctx = vm.createContext({});
vm.runInContext(src + '\nthis.makeReality=Reality.create;this.makeNetwork=PisteNetwork.create;',ctx);
const terrain = ctx.makeReality(asset);
const network = ctx.makeNetwork(terrain,asset);
assert.equal(terrain.id,'les-deux-alpes');
assert.equal(terrain.osmWay,219409078);
assert.ok(network.signs.length > 0,'valid network must yield skier-facing signposts');
assert.ok(network.stakes.length > 0,'secondary piste network should have side stakes');
assert.ok(network.spawn.every(Number.isFinite));
for (const sign of network.signs) {
  assert.ok(terrain.withinDEM(sign.x,sign.z));
  assert.ok([219409078,643745486,643786947].includes(sign.from));
  assert.ok([219409078,643745486,643786947].includes(sign.to));
}
const alpeTerrain = ctx.makeReality(alpe);
const alpeNetwork = ctx.makeNetwork(alpeTerrain,alpe);
assert.equal(alpeTerrain.id,'alpe-dhuez');
assert.deepEqual(alpeNetwork.junctions.map(j=>j.osmNode),alpe.junctions.map(j=>j.osmNode));
assert.notEqual(terrain.osmWay,alpeTerrain.osmWay);
assert.notEqual(terrain.elevationSource,undefined);
console.log(JSON.stringify({resort:asset.id,pistes:asset.pistes.length,junctions:network.junctions.length,
 signs:network.signs.length,stakes:network.stakes.length,grid:[asset.grid.cols,asset.grid.rows],
 otherResort:alpeTerrain.id}));
