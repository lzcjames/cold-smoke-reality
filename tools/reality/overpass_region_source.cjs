'use strict';
// Convert *raw* archived Overpass JSON bytes into audited source candidates.
// Bounding-box discovery is NEVER a legal/operational resort boundary.
const crypto=require('node:crypto');
function fromOverpassBytes(bytes,{surveyBBox}={}) {
 if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>26*1024*1024||
    !Array.isArray(surveyBBox)||surveyBBox.length!==4||
    surveyBBox.some(x=>!Number.isFinite(x))||
    surveyBBox[0]>=surveyBBox[2]||surveyBBox[1]>=surveyBBox[3])
   throw Error('Raw Overpass bytes and a documented WGS84 survey box required');
 const raw=JSON.parse(bytes.toString('utf8'));
 const timestamp=raw.osm3s?.timestamp_osm_base;
 if(!Number.isFinite(Date.parse(timestamp||''))||!Array.isArray(raw.elements))
   throw Error('OSM snapshot timestamp and complete way elements required');
 const features=[],seen=new Set();
 for(const w of raw.elements){
  if(w.type!=='way'||w.tags?.['piste:type']!=='downhill'||w.tags.area==='yes')continue;
  const n=w.tags['piste:name']||w.tags.name;
  if(typeof n!=='string'||!n.trim())continue;
  if(!Number.isSafeInteger(w.id)||w.id<=0||seen.has(w.id)||
     !Array.isArray(w.nodes)||!Array.isArray(w.geometry)||
     w.nodes.length!==w.geometry.length||w.nodes.length<2||
     new Set(w.nodes).size!==w.nodes.length)
   throw Error('Corrupt or duplicate OSM way geometry');
  seen.add(w.id);
  const coordinates=w.geometry.map(p=>{
   if(!Number.isFinite(p.lon)||!Number.isFinite(p.lat)||
      Math.abs(p.lon)>180||Math.abs(p.lat)>90)
    throw Error('Invalid OSM source coordinate');
   return [p.lon,p.lat];
  });
  let approx=0;const R=6371000;
  for(let i=1;i<coordinates.length;i++){
   const [lon1,lat1]=coordinates[i-1], [lon2,lat2]=coordinates[i];
   const dp=(lat2-lat1)*Math.PI/180,dl=(lon2-lon1)*Math.PI/180;
   const a=Math.sin(dp/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dl/2)**2;
   const d=2*R*Math.asin(Math.min(1,Math.sqrt(a)));
   if(!(d>0))throw Error('Duplicate OSM source coordinate');
   approx+=d;
  }
  features.push({type:'way',id:w.id,drawable:true,
   names:[n],tags:{'piste:type':'downhill','piste:difficulty':w.tags['piste:difficulty']||null},
   nodes:w.nodes.slice(),coordinates,
   approxPlanarLengthM:+approx.toFixed(2)});
 }
 if(!features.length)throw Error('No named downhill ways found in raw OSM survey');
 return {source:'OpenStreetMap / Overpass',
  originalResponseSHA256:crypto.createHash('sha256').update(bytes).digest('hex'),
  snapshotTimestampUTC:timestamp,
  wayCount:features.length,
  scope:'regional-OSM-candidates-not-verified-resort-boundary',
  surveyBBoxWGS84:surveyBBox.slice(),
  provenanceNote:'All selected ways require individual Les Deux Alpes membership review; nearby resorts may occur.',
  features};
}
module.exports={fromOverpassBytes};
