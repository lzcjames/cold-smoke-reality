'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const tpl=fs.readFileSync(path.join(root,'template.html'),'utf8');
const boot=fs.readFileSync(path.join(root,'src/99_main.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'src/19_ui.js'),'utf8');

test('winter preview offers real 2600 and 3200 destinations but no boarding controls',()=>{
  assert.match(tpl,/<details id="jandri-winter-preview" hidden>/);
  assert.match(tpl,/<option value="jandri-2600">/);
  assert.match(tpl,/<option value="jandri-3200">/);
  for(const id of ['jandri-winter-normal','jandri-winter-express']){
    assert.match(tpl,new RegExp('<button[^>]+id="'+id+'"[^>]+disabled'));
  }
  assert.match(tpl,/乘降与安全通道待核验/);
  assert.match(tpl, /id="jandri-winter-date"/);
  assert.match(tpl, /id="jandri-winter-hours"/);
});
test('preview is only a route guide and updates after explicit destination selection',()=>{
  assert.match(boot,/jandriDestination\.addEventListener\('change', paintJandriPreview\)/);
  assert.match(boot,/jandriDate\.addEventListener\('change', paintJandriPreview\)/);
  assert.match(boot,/JandriWinterSchedule\.lookup\(jandriDate\.value, jandriDestination\.value\)/);
  assert.ok(boot.indexOf('const jandriPreview =') < boot.indexOf('if ((REALITY_MODE ||'), 'preview must display even without optional 3D resort packs');
  assert.match(boot,/1650 → 2600（中间站，换乘方式待核实）→ 3200/);
  assert.doesNotMatch(boot,/1650 → 2600（中间换乘）→ 3200/, 'do not assert an unverified mandatory passenger interchange');
  assert.match(boot,/1650 → 2600 · 第一段缆车/);
  assert.doesNotMatch(boot,/jandriDestination\.addEventListener\('change',\s*enterSelectedResort\)/);
  assert.doesNotMatch(boot,/jandri-winter-express.*\.click\(/);
});
test('preview pointer and keyboard actions never launch procedural skiing',()=>{
  assert.match(ui,/closest\?\.\('#reality-picker, #jandri-winter-preview'\)/);
  assert.match(ui,/closest\?\.\('#reality-picker, #jandri-winter-preview'\)/);
  assert.match(boot,/jandriPreview\.addEventListener\('click', event => event\.stopPropagation\(\)\)/);
});
