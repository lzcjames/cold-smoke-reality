#!/usr/bin/env node
'use strict';
// Source-only contact audit on original, verified IGN MNT snapshots.
// This exercises the real ski contact solver in isolation but never changes
// or authorizes production Course.height, skier physics or route membership.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {check}=require('./check_measured_tiles.cjs');
const source=fs.readFileSync(path.join(__dirname,'../../src/02l_terrain_height_snapshot.js'),'utf8');
const heightSource=vm.runInNewContext(source+'\nTerrainHeightSnapshot').create;
const solverSource=fs.readFileSync(path.join(__dirname,'../../src/08j_solver.js'),'utf8');

function audit(data,folder){
 const verified=check(data,folder);
 if(verified.sourceReconstructedExactly===false ||
    !verified.sourceGridReconstructedExactly ||
    data.approvedForGameplay!==false)
  throw Error('Original IGN DEM not approved for source-only contact audit');
 const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
 const sourceTiles=manifest.tiles.map(entry=>{
  const tile=JSON.parse(fs.readFileSync(path.join(folder,entry.filename),'utf8'));
  return {name:entry.filename,grid:tile.grid};
 });
 const height=heightSource(manifest,sourceTiles);
 const g=data.grid;
 const local=(x,z)=>height.sample(g.east+x,g.north-z);
 const results=[];
 function simulate({column,row,dx=0,frames=360}){
  if(column<3||row<3||column>=g.cols-4||row>=g.rows-4)
    throw Error('Test contact path would exit measured source ground');
  const initialX=column*g.step-20;
  const initialZ=row*g.step;
  const base=local(initialX,initialZ);
  if(!Number.isFinite(base))throw Error('Missing authentic height under ski');
  const Course={mogK:1,height(x,z){
   const h=local(x,z);
   if(!Number.isFinite(h))throw Error('Ski sampled beyond real IGN ground');
   return h;
  }};
  const context={Skier:{},Variants:{val:{solver:'b'},def(){}},
    Course,location:{search:''}};
  vm.runInNewContext(solverSource,context);
  const contact=context.Skier.ground,sec={},output=[];
  if(typeof contact!=='function')throw Error('Actual ski solver unavailable');
  for(let i=0;i<frames;i++){
   const root={pos:[initialX+i*dx,base,initialZ],fwd:[0,0,-1]};
   const toW=q=>[root.pos[0]+q[0],root.pos[1]+q[1],root.pos[2]+q[2]];
   const pair=contact({onSnow:1,stance:.31,sink:0,mogK:1,
    crouch:.2,lead:0},root,[0,1,0],toW,sec,1/60);
   const vec=Array.from(pair);
   if(vec.length!==5||vec.some(v=>!Number.isFinite(v)))
    throw Error('Nonfinite original ski-contact state over IGN ground');
   output.push(vec);
  }
  const active=output.slice(-120),ranges=[0,1,2,3,4].map(field=>{
   const v=active.map(x=>x[field]);
   return Math.max(...v)-Math.min(...v);
  });
  const maximumFrameDelta=[0,1,2,3,4].map(field=>{
   let max=0;
   for(let j=1;j<active.length;j++)
    max=Math.max(max,Math.abs(active[j][field]-active[j-1][field]));
   return max;
  });
  if(dx===0&&ranges.some(v=>v>0.002))
   throw Error('Stationary actual-ground ski contact oscillates: '+ranges);
  if(dx!==0&&(Math.max(maximumFrameDelta[0],maximumFrameDelta[2])>0.3 ||
    Math.max(maximumFrameDelta[1],maximumFrameDelta[3])>0.2))
   throw Error('Large sudden ski contact jump on measured ground: '+maximumFrameDelta);
  return {column,row,moveMPerFrame:dx,frames,
   last120Range:ranges,last120MaxStep:maximumFrameDelta};
 }
 // Fixed interior point and both sides of the original 64-cell tile seam:
 for(const column of [20,60,64,90])
  results.push(simulate({column,row:25}));
 // Smooth continuous movement across the 64-cell source tile seam.
 results.push(simulate({column:62,row:25,dx:.05}));
 return {schema:'cold-smoke-real-ign-ski-contact-audit/v1',
  measuredSourceOSMSHA256:data.sourceOSMSHA256,
  originalMeasuredCells:g.heights.length,sourceTiles:manifest.tiles.length,
  cases:results,sourceOnly:true,
  actualGameContactSolverUnmodified:true,
  networkCallsDuringContact:0,
  approvedForGameplay:false,readyForCollision:false};
}
function main(args){
 const [input,folder,out]=args;
 if(!input||!folder)throw Error('Usage: node tools/reality/audit_real_ign_ski_contact.cjs <source-grid.json> <tile-folder> [report.json]');
 const report=audit(JSON.parse(fs.readFileSync(input,'utf8')),folder);
 if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 console.log('IGN source-only ski contact:',report.cases.length,
  'real-ground 360-frame cases; gameplay not approved');
}
if(require.main===module){try{main(process.argv.slice(2));}
 catch(e){console.error(e.stack||e);process.exitCode=1;}}
module.exports={audit,main};
