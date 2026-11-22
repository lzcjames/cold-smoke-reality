#!/usr/bin/env node
'use strict';
// Review separate attributed regional OSM responses without fabricating
// a single atomic survey or declaring a piste safe/inside the resort.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function summarize(directory){
 const folder=path.resolve(directory);
 const status=JSON.parse(fs.readFileSync(path.join(folder,'status.json'),'utf8'));
 if(status?.schema!=='cold-smoke-regional-shard-survey/v1'||
    status.resortId!=='les-deux-alpes'||status.approvedForGameplay!==false||
    status.wholeResortMembershipReviewed!==false||
    status.wholeResortCoverageApproved!==false||
    status.combinedAtomicSnapshot!==false||
    !Array.isArray(status.shards)||status.shards.length!==4)
    throw Error('Unreviewed non-atomic four-shard source ledger required');
 const snapshots=[],byId=new Map(),labels=new Set(),missing=[];
 let seenCount=0;
 const safe=name=>/^[a-z0-9-]+\.json$/.test(name);
 for(const item of status.shards){
  if(item.status!=='source_candidates_unreviewed'){
   if(item.status!=='blocked_no_usable_source'||item.file)
     throw Error('Incomplete source cannot claim valid raw data');
   missing.push(item.id);continue;
  }
  if(!safe(item.file)||!safe(item.id+'-source-index.json')||
     !/^[0-9a-f]{64}$/.test(item.rawResponseSHA256||'')||
     typeof item.timestampUTC!=='string')
    throw Error('Invalid original regional response reference');
  const bytes=fs.readFileSync(path.join(folder,item.file));
  if(sha(bytes)!==item.rawResponseSHA256)
    throw Error('Regional raw OSM response SHA mismatch: '+item.id);
  const raw=JSON.parse(bytes),index=JSON.parse(
    fs.readFileSync(path.join(folder,item.id+'-source-index.json'),'utf8'));
  if(index.source!=='OpenStreetMap / Overpass'||
     index.originalResponseSHA256!==item.rawResponseSHA256||
     index.snapshotTimestampUTC!==item.timestampUTC||
     raw.osm3s?.timestamp_osm_base!==item.timestampUTC||
     index.wayCount!==index.features?.length||
     index.features.length!==item.namedDownhillWays)
    throw Error('Regional source index does not match original response: '+item.id);
  const sourceById=new Map((raw.elements||[]).filter(x=>x.type==='way')
    .map(x=>[x.id,x]));
  const localIds=new Set();
  for(const f of index.features){
   const source=sourceById.get(f.id);
   if(localIds.has(f.id)||!source||source.tags?.['piste:type']!=='downhill'||
      !Array.isArray(f.nodes)||!Array.isArray(f.coordinates)||
      f.nodes.length!==f.coordinates.length||
      !Array.isArray(source.geometry)||!Array.isArray(source.nodes)||
      f.nodes.length!==source.nodes.length||
      f.nodes.some((n,i)=>n!==source.nodes[i])||
      f.coordinates.some((p,i)=>p[0]!==source.geometry[i].lon||
                                p[1]!==source.geometry[i].lat))
     throw Error('OSM node identity or original coordinate changed: '+item.id);
   localIds.add(f.id);
   for(const name of f.names||[]) if(typeof name==='string'&&name.trim())labels.add(name);
   const previous=byId.get(f.id);
   const signature=sha(JSON.stringify([f.nodes,f.coordinates]));
   if(previous) {
     previous.sources.push(item.id);
     if(previous.geometrySHA256!==signature)previous.conflictingSnapshots=true;
   }else byId.set(f.id,{id:f.id,names:f.names.slice(),
     geometrySHA256:signature,sources:[item.id],conflictingSnapshots:false});
  }
  snapshots.push({id:item.id,rawResponseSHA256:item.rawResponseSHA256,
    timestampUTC:item.timestampUTC,sourceWayOccurrences:index.features.length,
    uniqueInThisResponse:localIds.size,
    reviewedAsLesDeuxAlpes:false});
  seenCount+=index.features.length;
 }
 const overlaps=[...byId.values()].filter(x=>x.sources.length>1)
   .map(x=>({osmWay:x.id,shards:x.sources,conflictingSnapshots:x.conflictingSnapshots}));
 const conflicting=overlaps.filter(x=>x.conflictingSnapshots);
 return {schema:'cold-smoke-regional-osm-evidence/v1',resortId:'les-deux-alpes',
   sourceRunIsPartial:missing.length>0,missingShards:missing,
   snapshotCount:snapshots.length,snapshots,
   sourceWayOccurrences:seenCount,uniqueOsmWayIds:byId.size,
   overlappingWayIds:overlaps.length,geometryConflicts:conflicting,
   candidateRouteNameCount:labels.size,
   candidateRouteNames:[...labels].sort((a,b)=>a.localeCompare(b)),
   wholeResortMembershipReviewed:false,wholeResortCoverageApproved:false,
   approvedForGameplay:false,mergedAtomicSnapshot:false,
   note:'Separate Overpass timestamps and regional query boundary; membership, piste widths and skier joins not independently reviewed'};
}
function main(args){
 const [folder,output]=args;
 if(!folder)throw Error('Usage: node tools/reality/audit_osm_shards.cjs <source-directory> [report.json]');
 const result=summarize(folder);
 if(output)fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
 console.log('Reviewed source provenance only:',result.sourceWayOccurrences,
  'occurrences,',result.uniqueOsmWayIds,'unique OSM IDs,',
  result.missingShards.length,'missing quadrants');
 return result;
}
if(require.main===module)try{main(process.argv.slice(2));}
 catch(e){console.error(e.message);process.exitCode=1;}
module.exports={summarize,main};
