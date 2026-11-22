'use strict';
// Standalone terrain staging sampler for licensed, previously VERIFIED rasters.
// Inspired by the architectural pattern of a fine playable DEM plus a broader
// overview DEM in the user-provided Hemu simulator. None of its code/assets
// or geography is used here. This module is NOT wired to game physics.
//
// A DEM measures bare-ground elevations: this does not approve any piste,
// hazard boundary, cabin stop, ski passage or simulated grooming.
function createMultiResSampler({detail,backdrop,edgeCells=3}) {
  function check(g,label) {
    if(!g || !Number.isInteger(g.cols) || g.cols<2 ||
       !Number.isInteger(g.rows) || g.rows<2 ||
       !Number.isFinite(g.originX) || !Number.isFinite(g.originZ) ||
       !Number.isFinite(g.stepM) || g.stepM<=0 ||
       !ArrayBuffer.isView(g.heights) ||
       g.heights.length!==g.cols*g.rows ||
       typeof g.sourceSha256!=='string' || !/^[0-9a-f]{64}$/.test(g.sourceSha256) ||
       typeof g.crs!=='string' || g.crs!=='EPSG:2154' ||
       typeof g.verticalDatum!=='string' || !g.verticalDatum ||
       g.sourceVerified!==true)
      throw Error('Unverified '+label+' terrain grid');
    return g;
  }
  check(detail,'detail');
  check(backdrop,'backdrop');
  if(detail.verticalDatum!==backdrop.verticalDatum)
    throw Error('DEM vertical datums differ');
  if(!Number.isInteger(edgeCells)||edgeCells<1||edgeCells>24)
    throw Error('Invalid DEM transition width');
  const sample = (g,x,z)=>{
    const u=(x-g.originX)/g.stepM, v=(z-g.originZ)/g.stepM;
    if(!Number.isFinite(u)||!Number.isFinite(v)||u<0||v<0||
       u>g.cols-1||v>g.rows-1) return null;
    const i=Math.min(g.cols-2,Math.floor(u)), j=Math.min(g.rows-2,Math.floor(v));
    const sx=u-i, sz=v-j, k=j*g.cols+i;
    const h=g.heights;
    const a=h[k],b=h[k+1],c=h[k+g.cols],d=h[k+g.cols+1];
    if(![a,b,c,d].every(Number.isFinite))return null;
    return {height:(a*(1-sx)+b*sx)*(1-sz)+(c*(1-sx)+d*sx)*sz,
      margin:Math.min(u,v,g.cols-1-u,g.rows-1-v)};
  };
  function height(x,z){
    const near=sample(detail,x,z),far=sample(backdrop,x,z);
    if(!near)return far?far.height:null;
    if(!far)return near.margin>=edgeCells?near.height:null;
    const t=Math.max(0,Math.min(1,near.margin/edgeCells));
    const smooth=t*t*(3-2*t);
    return far.height*(1-smooth)+near.height*smooth;
  }
  function coverage(points){
    if(!Array.isArray(points)) throw Error('Expected projected way polyline');
    const missing=[],discontinuities=[];
    let nDetail=0,nFallback=0;
    const uncoveredSegmentIndices=[];
    let sampledInteriorPoints=0;
    for(let i=0;i<points.length;i++){
      const p=points[i];
      if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))
        throw Error('Invalid source OSM polyline point');
      const near=sample(detail,p[0],p[1]),far=sample(backdrop,p[0],p[1]);
      if(!near && !far) missing.push(i);
      else if(near)nDetail++;
      else nFallback++;
      // A route sitting on backdrop-only DEM remains non-playable; the
      // high-detail perimeter must cover every point plus its ski width.
      if(i>0 && (!near||!sample(detail,...points[i-1])))
        discontinuities.push(i);
    }
    // Vertex-only coverage misses holes and grid-edge crossings between
    // sparse OSM nodes. Sample every segment at <= half a detail raster cell.
    // This is a source-coverage gate, not piste-width or hazard approval.
    for(let i=1;i<points.length;i++) {
      const a=points[i-1], b=points[i];
      const distance=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const intervals=Math.max(1,Math.ceil(distance/(detail.stepM*0.5)));
      if(intervals>100000) throw Error('OSM segment exceeds DEM audit sampling limit');
      let covered=true;
      for(let j=1;j<intervals;j++) {
        const t=j/intervals;
        const x=a[0]+(b[0]-a[0])*t, z=a[1]+(b[1]-a[1])*t;
        sampledInteriorPoints++;
        if(!sample(detail,x,z)) {covered=false; break;}
      }
      if(!covered) uncoveredSegmentIndices.push(i);
    }
    return Object.freeze({total:points.length,detailVertices:nDetail,
      backdropOnlyVertices:nFallback,missingIndices:Object.freeze(missing),
      detailOnlyReady:missing.length===0&&nFallback===0&&nDetail===points.length&&uncoveredSegmentIndices.length===0,
      uncoveredSegmentIndices:Object.freeze(uncoveredSegmentIndices),
      sampledInteriorPoints,
      highDetailCoverageMarginM:null,  // must be checked against piste width separately
      requiresHazardAndPisteAreaReview:true});
  }
  // Measured near-source height only: backdrop blending is purely visual and\n  // must not bias audit of actual downhill gradients or player contact.\n  const detailHeight=(x,z)=>sample(detail,x,z)?.height??null;\n  return Object.freeze({height,detailHeight,coverage});
}
module.exports={createMultiResSampler};
