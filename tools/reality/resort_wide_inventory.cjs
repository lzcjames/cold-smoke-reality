'use strict';
// General resort-wide GIS acquisition planner; no terrain or piste invented.
// All tile coordinates derive from actual projected OSM source segments.
const pair=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
function inventory(sectors,source) {
 if(sectors?.schema!=='cold-smoke-official-resort-sectors/v1'||
    !Array.isArray(sectors.sectors)||!sectors.sectors.length||
    source?.source!=='OpenStreetMap / Overpass'||
    !/^[a-f0-9]{64}$/.test(source.originalResponseSHA256||'')||
    !Array.isArray(source.features))
   throw Error('Sector registry and pinned OSM source required');
 const selected=source.features.filter(f=>f.type==='way'&&f.drawable===true);
 const ids=new Set(),labels=new Map();
 for(const f of selected){
   if(!Number.isSafeInteger(f.id)||f.id<=0||ids.has(f.id)||
      f.tags?.['piste:type']!=='downhill'||
      !Array.isArray(f.coordinates)||f.coordinates.length<2||
      !Array.isArray(f.nodes)||f.nodes.length!==f.coordinates.length)
     throw Error('Invalid pinned downhill OSM way');
   ids.add(f.id);
   for(const n of f.names||[]) {
     if(typeof n!=='string'||!n.trim())continue;
     const arr=labels.get(n)||[];
     arr.push(f.id);labels.set(n,arr);
   }
 }
 const sectorIds=new Set();
 for(const s of sectors.sectors){
   if(!s.id||sectorIds.has(s.id)||typeof s.mapLabel!=='string'||
      s.sourceBoundsLambert93!==null||!Array.isArray(s.osmWayIds)||
      s.osmWayIds.length!==0||s.approvedForGameplay!==false)
     throw Error('Official map sector cannot imply unverified GIS geometry');
   sectorIds.add(s.id);
 }
 const routeLabels=[...labels].sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([name,ways])=>({name,osmWays:ways.slice(),sourceWayCount:ways.length}));
 return {
  schema:'cold-smoke-resort-inventory/v1',resortId:sectors.resortId,
  officialMapSectorCount:sectors.sectors.length,
  officialMapSectors:sectors.sectors.map(s=>({id:s.id,label:s.mapLabel,
    hasGeoreferencedBoundaries:false,approvedForGameplay:false})),
  osm:{sourceSHA256:source.originalResponseSHA256,
    snapshotTimestampUTC:source.snapshotTimestampUTC,
    knownDownhillWays:selected.length,routeLabels},
  // This snapshot is restricted to Jandri. No program may treat it
  // as proof that the other 11 official areas have been surveyed.
  sourceScope:'partial-source-only',
  wholeResortSurveyComplete:false,
  wholeResortDEMComplete:false,
  missingWholeResortGIS:true,
  approvedForGameplay:false
 };
}
function planGroundTiles(source,projection,{tileSizeM=1000,marginM=90,
  sampleStepM=25,maxTiles=4000}={}) {
 if(source?.source!=='OpenStreetMap / Overpass'||
    !/^[a-f0-9]{64}$/.test(source.originalResponseSHA256||'')||
    typeof projection?.forward!=='function' ||
    projection.sourceCRS!=='EPSG:4326' ||
    projection.targetCRS!=='EPSG:2154'||
    projection.sourceVerified!==true ||
    !Number.isInteger(tileSizeM)||tileSizeM<250||tileSizeM>2000||
    !(Number.isFinite(marginM)&&marginM>=0&&marginM<=250)||
    !(Number.isFinite(sampleStepM)&&sampleStepM>0&&sampleStepM<=100)||
    !Number.isInteger(maxTiles)||maxTiles<1)
   throw Error('Pinned source, verified coordinate transform and bounded tile plan required');
 const tiles=new Map(),ways=[];
 const add=(tx,ty,id)=>{
   const key=tx+':'+ty;
   if(!tiles.has(key)){
     if(tiles.size>=maxTiles)throw Error('Tile inventory exceeds budget');
     tiles.set(key,{key,x:tx,y:ty,sourceWayIds:new Set()});
   }
   tiles.get(key).sourceWayIds.add(id);
 };
 const visited=new Set();
 for(const f of source.features||[]){
   if(f.type!=='way'||f.drawable!==true)continue;
   if(!Number.isSafeInteger(f.id)||f.id<=0||visited.has(f.id)||
      f.tags?.['piste:type']!=='downhill'||
      !Array.isArray(f.coordinates)||f.coordinates.length<2||
      !Array.isArray(f.nodes)||f.nodes.length!==f.coordinates.length||
      new Set(f.nodes).size!==f.nodes.length)
     throw Error('Invalid authentic route geometry');
   visited.add(f.id);
   const points=f.coordinates.map(p=>{
     if(!pair(p)||p[0]<-180||p[0]>180||p[1]<-90||p[1]>90)
       throw Error('Invalid WGS84 source coordinate');
     const q=projection.forward(p.slice());
     if(!pair(q))throw Error('Invalid projected source coordinate');
     return q;
   });
   let sampled=0;
   for(let i=1;i<points.length;i++){
     const a=points[i-1],b=points[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]);
     if(!(d>0))throw Error('Duplicate projected coordinates');
     const n=Math.ceil(d/sampleStepM);
     if(n>100000)throw Error('Source way exceeds audit sampling budget');
     for(let j=i===1?0:1;j<=n;j++){
       const t=j/n,x=a[0]+t*(b[0]-a[0]),y=a[1]+t*(b[1]-a[1]);
       const minX=Math.floor((x-marginM)/tileSizeM),maxX=Math.floor((x+marginM)/tileSizeM);
       const minY=Math.floor((y-marginM)/tileSizeM),maxY=Math.floor((y+marginM)/tileSizeM);
       for(let tx=minX;tx<=maxX;tx++)for(let ty=minY;ty<=maxY;ty++)add(tx,ty,f.id);
       sampled++;
     }
   }
   ways.push({osmWay:f.id,originalNodeCount:f.nodes.length,
     sampledPoints:sampled,approvedForGameplay:false});
 }
 if(!ways.length)throw Error('No source piste routes to plan');
 return {schema:'cold-smoke-resort-ground-tile-plan/v1',
  sourceOSMSHA256:source.originalResponseSHA256,
  tileSizeM,marginM,sampleStepM,sourceWayCount:ways.length,
  coordinateSystem:'EPSG:2154',scope:'only-provided-source-ways',
  noDEMDownloaded:true,approvedForGameplay:false,
  tiles:[...tiles.values()].sort((a,b)=>a.x-b.x||a.y-b.y)
    .map(t=>({id:t.key,boundsLambert93:[t.x*tileSizeM,t.y*tileSizeM,
      (t.x+1)*tileSizeM,(t.y+1)*tileSizeM],
      sourceWayIds:[...t.sourceWayIds].sort((a,b)=>a-b),
      detailedDEMVerified:false})),
  routes:ways};
}
module.exports={inventory,planGroundTiles};
