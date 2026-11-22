'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalize,toVerifiedPisteNetwork}=require('../tools/reality/portable_resort_adapter.cjs');
const h='a'.repeat(64);
const world=()=>({
 origin:{lon:87.55,lat:48.63},elevationOrigin:2000,
 detail:{cells:720,size:7200,center:[0,0],encoding:'uint16-le',sha256:h},
 backdrop:{cells:640,size:40000,center:[0,0],encoding:'uint16-le',sha256:h},
 pistes:[{id:'12',name:'Example Run',difficulty:'easy',
   points:[[0,0],[0,20],[0,40]],osmRef:'W1'}],
 lifts:[{id:'22',name:'Example Lift',type:'gondola',points:[[0,0],[20,40]],
   stationIds:['low','high']}],
 stations:[{id:'low',point:[0,0],terminals:[{liftId:'22',end:'lower'}]},
   {id:'high',point:[20,40],terminals:[{liftId:'22',end:'upper'}]}]
});
test('portable normalization preserves routes, lifts and source identity without inventing gameplay access',()=>{
 const w=world(),m=normalize(w,{resortId:'demo-resort'});
 assert.equal(m.pistes[0].sourceId,'12');
 assert.equal(m.pistes[0].lengthM,40);
 assert.equal(m.lifts[0].kind,'gondola');
 assert.equal(m.lifts[0].stationIds[1],'high');
 assert.equal(m.localFrame.requiresIndependentGeoreferencing,true);
 assert.equal(m.terrain.certifiedPlayableDEM,false);
 assert.equal(m.pistes[0].approvedForGameplay,false);
 assert.equal(m.lifts[0].approvedForBoarding,false);
 w.pistes[0].points[0][0]=999;
 assert.deepEqual(m.pistes[0].points[0],[0,0]);
});
test('rejects broken source topology, duplicate IDs and invalid terrain metadata',()=>{
 const w=world();w.stations[1].id='low';
 assert.throws(()=>normalize(w,{resortId:'demo-resort'}),/Duplicate/);
 const w2=world();w2.lifts[0].stationIds[1]='unknown';
 assert.throws(()=>normalize(w2,{resortId:'demo-resort'}),/existing/);
 const w3=world();w3.detail.sha256='bad';
 assert.throws(()=>normalize(w3,{resortId:'demo-resort'}),/metadata/);
 const w4=world();w4.pistes[0].points[1]=[0,0];
 assert.throws(()=>normalize(w4,{resortId:'demo-resort'}),/Duplicate consecutive/);
});
test('verified export requires real OSM node identity and a complete source-ground corridor',()=>{
 const m=normalize(world(),{resortId:'demo-resort'});
 const approval={projectToLambert93:([x,z])=>[950000+x,6440000+z],
   coversDetailedGround:()=>true,
   routes:[{sourceId:'12',osmWay:123,verified:true,osmNodeIds:[101,102,103]}]};
 const a=toVerifiedPisteNetwork(m,approval);
 assert.equal(a.pistes[0].osmWay,123);
 assert.deepEqual(a.pistes[0].points[2],[950000,6440040]);
 assert.deepEqual(a.junctions,[]);
 assert.throws(()=>toVerifiedPisteNetwork(m,{...approval,routes:[{...approval.routes[0],osmNodeIds:[1,2,2]}]}),/approved/);
 assert.throws(()=>toVerifiedPisteNetwork(m,{...approval,
   coversDetailedGround:(x,z)=>z!==6440010}),/missing detailed ground/);
 assert.throws(()=>toVerifiedPisteNetwork(m,{...approval,junctions:[{id:1}]}),/independently/);
 assert.throws(()=>toVerifiedPisteNetwork(m,{}),/georeferencing/);
});
