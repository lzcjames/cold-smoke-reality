'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {summarize}=require('../tools/reality/audit_osm_shards.cjs');
const {fromOverpassBytes}=require('../tools/reality/overpass_region_source.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function withInputs(visit,{omit=3,corruptRaw=false,corruptIndex=false}={}){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'overpass-evidence-'));
 try{
  const shards=[];
  for(let i=1;i<=4;i++){
   const id='quadrant-'+i;
   if(i===omit){shards.push({id,status:'blocked_no_usable_source',
     error:'TimeoutError',sourceApprovedForGameplay:false});continue;}
   const wayId=i===2?101:100+i;
   const response={osm3s:{timestamp_osm_base:'2026-11-22T17:00:00Z'},
    elements:[{id:wayId,type:'way',nodes:[10,11],
     tags:{'piste:type':'downhill',name:'Example '+wayId},
     geometry:[{lon:6.1,lat:45.01},{lon:6.11,lat:45.02}]}]};
   const bytes=Buffer.from(JSON.stringify(response));
   const index=fromOverpassBytes(bytes,{surveyBBox:[44.97,6.05,45.09,6.23]});
   if(corruptIndex&&i===1)index.features[0].coordinates[0][0]+=0.1;
   fs.writeFileSync(path.join(folder,id+'-overpass-raw.json'),
     corruptRaw&&i===1?Buffer.from('{"changed":true}'):bytes);
   fs.writeFileSync(path.join(folder,id+'-source-index.json'),JSON.stringify(index));
   shards.push({id,status:'source_candidates_unreviewed',
    file:id+'-overpass-raw.json',rawResponseSHA256:sha(bytes),
    timestampUTC:response.osm3s.timestamp_osm_base,namedDownhillWays:1});
  }
  // Give two independent quadrants the exact same OSM way ID.
  const status={schema:'cold-smoke-regional-shard-survey/v1',
    resortId:'les-deux-alpes',wholeResortMembershipReviewed:false,
    wholeResortCoverageApproved:false,combinedAtomicSnapshot:false,
    approvedForGameplay:false,shards};
  fs.writeFileSync(path.join(folder,'status.json'),JSON.stringify(status));
  return visit(folder);
 }finally{fs.rmSync(folder,{force:true,recursive:true});}
}
test('partial real source is counted as 3 independent snapshots, never complete resort',()=>{
 withInputs(folder=>{
  const report=summarize(folder);
  assert.equal(report.snapshotCount,3);
  assert.deepEqual(report.missingShards,['quadrant-3']);
  assert.equal(report.sourceWayOccurrences,3);
  assert.equal(report.uniqueOsmWayIds,3);
  assert.equal(report.approvedForGameplay,false);
  assert.equal(report.mergedAtomicSnapshot,false);
 });
});
test('original raw response hash mismatch stops audit',()=>{
 withInputs(folder=>assert.throws(()=>summarize(folder),/SHA mismatch/),
  {corruptRaw:true});
});
test('original OSM coordinates may not be silently modified',()=>{
 withInputs(folder=>assert.throws(()=>summarize(folder),/coordinate changed/),
  {corruptIndex:true});
});
test('corrupt missing quadrant cannot falsely claim success',()=>{
 withInputs(folder=>{
  const file=path.join(folder,'status.json');
  const status=JSON.parse(fs.readFileSync(file,'utf8'));
  status.shards[2].status='source_candidates_unreviewed';
  fs.writeFileSync(file,JSON.stringify(status));
  assert.throws(()=>summarize(folder),/Invalid original regional response reference/);
 });
});
