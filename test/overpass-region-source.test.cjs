'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {fromOverpassBytes}=require('../tools/reality/overpass_region_source.cjs');
const bbox=[44.97,6.05,45.09,6.23];
const raw=()=>Buffer.from(JSON.stringify({
 osm3s:{timestamp_osm_base:'2026-11-22T16:00:00Z'},
 elements:[{type:'way',id:481,nodes:[11,12],tags:{'piste:type':'downhill',
 'piste:name':'Example'},geometry:[{lon:6.10,lat:45.01},{lon:6.101,lat:45.02}]}]
}));
test('archived Overpass raw bytes preserve original SHA and source geometry',()=>{
 const bytes=raw(),index=fromOverpassBytes(bytes,{surveyBBox:bbox});
 assert.equal(index.originalResponseSHA256,crypto.createHash('sha256').update(bytes).digest('hex'));
 assert.deepEqual(index.features[0].nodes,[11,12]);
 assert.deepEqual(index.features[0].coordinates,[[6.10,45.01],[6.101,45.02]]);
 assert.match(index.scope,/not-verified-resort-boundary/);
 assert.ok(index.features[0].approxPlanarLengthM>0);
});
test('fail closed when source contains duplicate OSM nodes or lacks timestamp',()=>{
 let doc=JSON.parse(raw().toString());
 doc.elements[0].nodes=[11,11];
 assert.throws(()=>fromOverpassBytes(Buffer.from(JSON.stringify(doc)),{surveyBBox:bbox}),/Corrupt/);
 doc=JSON.parse(raw().toString());delete doc.osm3s;
 assert.throws(()=>fromOverpassBytes(Buffer.from(JSON.stringify(doc)),{surveyBBox:bbox}),/timestamp/);
});
