'use strict';
// Deterministic ski-contact stencil audit across seams of a real-source DEM.
// This does not assert player FPS, rendered GPU vertices, or a real ski ride.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname,'..');
const source = ['src/02a_reality.js','src/02a_tiled_dem.js',
  'src/02a_tiled_preview.js'].map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n');
function reality(asset,search) {
  return vm.runInNewContext(source+'\nReality.create(asset);',
    {asset,location:{search}});
}
test('real-source ski contact stencils cross tile seams without new height oscillations',t=>{
  const file=path.join(root,'data/reality/les-deux-alpes.json');
  if(!fs.existsSync(file))return t.skip('Optional licensed measured DEM unavailable');
  const asset=JSON.parse(fs.readFileSync(file,'utf8'));
  const a=reality(asset,'?reality=les-deux-alpes');
  const b=reality(asset,'?reality=les-deux-alpes&tileCollision=1');
  assert.equal(b.tilePreviewEnabled,true);
  const g=asset.grid, pitch=40;
  let contacts=0, worstHeight=0, worstPitch=0;
  // Traverse every available internal tile boundary, along and across it.
  // 9 lengthwise samples under each ski, at +/-0.45m lateral boot offsets.
  // This is the same order of magnitude as the solver's ski sampling stencil.
  function stencil(e,n) {
    const yaw=0.24;
    for(const side of [-0.45,0.45]) {
      const valuesA=[],valuesB=[];
      for(let k=-4;k<=4;k++) {
        const forward=k*0.1875;
        const ee=e+side*Math.cos(yaw)+forward*Math.sin(yaw);
        const nn=n-side*Math.sin(yaw)+forward*Math.cos(yaw);
        const point=a.project(ee,nn);
        const hA=a.height(...point), hB=b.height(...point);
        assert.ok(Number.isFinite(hA)&&Number.isFinite(hB));
        worstHeight=Math.max(worstHeight,Math.abs(hA-hB));
        valuesA.push(hA);valuesB.push(hB);
        contacts++;
      }
      // A stiff ski's end-to-end height estimate must not change because
      // the sample footprint crossed from one tile into the next.
      const pitchA=Math.atan2(valuesA[8]-valuesA[0],1.5);
      const pitchB=Math.atan2(valuesB[8]-valuesB[0],1.5);
      worstPitch=Math.max(worstPitch,Math.abs(pitchA-pitchB));
    }
  }
  for(let x=pitch;x<g.cols-1;x+=pitch) {
    for(let y=5;y<g.rows-5;y+=5)
      for(const d of [-0.75,-0.15,0,0.15,0.75])
        stencil(g.east+x*g.step+d,g.north-y*g.step);
  }
  for(let y=pitch;y<g.rows-1;y+=pitch) {
    for(let x=5;x<g.cols-5;x+=5)
      for(const d of [-0.75,-0.15,0,0.15,0.75])
        stencil(g.east+x*g.step,g.north-y*g.step+d);
  }
  assert.ok(contacts>1000,'No real contact samples across measured seams');
  assert.ok(worstHeight<0.002,'Ski contact height changed by '+worstHeight+'m');
  assert.ok(worstPitch<0.002,'Ski pitch changed by '+worstPitch+'rad');
  console.log('Measured ski-stencil audit', {contacts,worstHeight,worstPitch});
});
