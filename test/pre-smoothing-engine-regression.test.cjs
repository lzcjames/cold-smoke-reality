'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');

// Regression bisect: compare whole-file Git blobs to the last known pre-
// smoothing shared movement engine, which shipped with Jandri lower preview.
// Do not pin these forever: replace after measured per-frame profiling.
const baseline={
  'src/03_course.js':'dd541a6b4693141b6632deb9f38be7d13f33dad8',
  'src/04_terrain.js':'fd5256f4f2aaeb53b7305f57cce5fcf534f5e149',
  'src/07_game.js':'3f867ed8a7e7b0b0fe95bd98585c4ffa1cb4235b',
  'src/08_skier.js':'c1731b3a5b9a6850e9a7f56e0dfcfb7f9dfd003d',
  'src/08j_solver.js':'81d7961fd122c45c9c3586bd646917c30bc43f4f'
};
test('five shared gameplay engine files match pre-smoothing reference byte for byte',()=>{
  for(const [path,sha] of Object.entries(baseline)){
    const bytes=fs.readFileSync(path);
    const header=Buffer.from('blob '+bytes.length+'\0');
    const actual=createHash('sha1').update(header).update(bytes).digest('hex');
    assert.equal(actual,sha,path+' must be identical to pre-regression baseline');
  }
});
test('Jandri OSM gameplay and clean title resort picker remain available',()=>{
  const main=fs.readFileSync('src/99_main.js','utf8');
  const menu=fs.readFileSync('template.html','utf8');
  const jandri=fs.readFileSync('src/02e_jandri_lower.js','utf8');
  assert.match(main,/644393970, 219275197/);
  assert.match(jandri,/219275197/);
  assert.match(jandri,/644393970/);
  assert.match(menu,/id="reality-picker" hidden/);
  assert.match(menu,/id="reality-start-piste-wrap" class="resort-field" hidden/);
  assert.match(menu,/#reality-picker \.resort-field\[hidden\]/);
  assert.match(menu,/id="reality-enter" type="button"/);
});
