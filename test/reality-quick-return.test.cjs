'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const tpl=fs.readFileSync('template.html','utf8');
const main=fs.readFileSync('src/99_main.js','utf8');
const p4=JSON.parse(fs.readFileSync('data/reality/les-deux-alpes.json','utf8'));

test('quick restart is an honest current-piste gameplay shortcut, not a 3S station teleport',()=>{
  assert.match(tpl,/<button type="button" id="reality-return-start" hidden/);
  assert.match(tpl,/非 Jandri 3S 真正终点站/);
  assert.match(main,/returnStart\.addEventListener\('click', event =>/);
  assert.match(main,/App\.swap\(Game\.resetReality\)/);
  assert.match(main,/terrain\.selectedSpawn && terrain\.selectedPiste/);
  assert.match(main,/nearest\.piste\?\.osmWay !== terrain\.selectedPiste\.osmWay/);
  assert.doesNotMatch(main,/returnStart\.addEventListener[\s\S]*?const link = [\s\S]*?JandriQuickTransition\.run\(/);
});

test('quick return cannot be a Jandri 2600/3200 destination in this real DEM',()=>{
  const heights=p4.grid.heights;
  assert.ok(Math.max(...heights)<2600);
  assert.ok(p4.pistes.every(p=>[643745486,643786947,219409078].includes(p.osmWay)));
});
