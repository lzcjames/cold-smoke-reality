'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/02m_terrain_source_mesh.js','utf8');
const make=vm.runInNewContext(source+'\nTerrainSourceMesh').fromMeasuredTile;
function tile(index=0){
 const cols=3,rows=3;
 return {name:'tile-'+index+'-0.json',
  grid:{cols,rows,step:15,east:947000+30*index,north:6439000,
   heights:Array.from({length:rows*cols},(_,k)=>{
    const row=Math.floor(k/cols),column=k%cols;
    return 2500-4*(index*2+column)-3*row;
   })}};
}
const origin={originEast:947000,originNorth:6439000,baseElevationM:2400};
test('flat data gives upward-facing triangles and finite upward normals',()=>{
 const t=tile();t.grid.heights.fill(2500);
 const m=make(t,origin);
 assert.equal(m.vertexCount,9);
 assert.equal(m.triangleCount,8);
 assert.deepEqual(Array.from(m.positions.slice(0,6)),[0,100,0,15,100,0]);
 assert.deepEqual(Array.from(m.indices.slice(0,6)),[0,3,1,1,3,4]);
 for(let k=0;k<m.normals.length;k+=3){
  assert.equal(m.normals[k],0);
  assert.equal(m.normals[k+1],1);
  assert.equal(m.normals[k+2],0);
 }
 assert.equal(m.readyForCollision,false);
 assert.equal(m.approvedForGameplay,false);
});
test('real-metre edges of adjacent independently meshed source tiles coincide',()=>{
 const a=make(tile(0),origin),b=make(tile(1),origin);
 for(let r=0;r<3;r++){
  const ai=(r*3+2)*3,bi=(r*3)*3;
  for(let k=0;k<3;k++)assert.equal(a.positions[ai+k],b.positions[bi+k]);
 }
});
test('rejects missing original height, unreasonable mesh size and malformed coordinates',()=>{
 const missing=tile();missing.grid.heights[4]=Number.NaN;
 assert.throws(()=>make(missing,origin),/Missing or unmeasured/);
 assert.throws(()=>make(tile(),{...origin,maxVertices:8}),/budget/);
 assert.throws(()=>make(tile(),{...origin,originEast:Number.NaN}),/Invalid/);
});
test('bounded source mesh triangle cells and normals remain finite on slopes',()=>{
 const m=make(tile(),origin);
 assert.equal(m.minimumLocalElevationM,2476-2400);
 assert.equal(m.maximumLocalElevationM,100);
 assert.ok(Array.from(m.normals).every(Number.isFinite));
 assert.ok(Array.from(m.indices).every(x=>x>=0&&x<m.vertexCount));
});
