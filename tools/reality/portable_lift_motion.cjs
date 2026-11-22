'use strict';
// Minimal lift *visual* playback. No collision, rope force, or safe boarding.
// Cabins may be rendered from world-space polylines + approved elevations.
function geometry(lift,groundAltitude,options={}) {
 if(!lift||!Array.isArray(lift.points)||lift.points.length<2||
    typeof groundAltitude!=='function')throw Error('Lift line and altitude sampler required');
 const clearance=options.visualClearanceM??8;
 if(!Number.isFinite(clearance)||clearance<0||clearance>100)
   throw Error('Invalid illustrative lift clearance');
 const points=lift.points.map(p=>{
   if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))
     throw Error('Invalid lift source coordinate');
   const y=groundAltitude(p[0],p[1]);
   if(!Number.isFinite(y))throw Error('Lift outside known altitude coverage');
   return [p[0],y+clearance,p[1]];
 });
 const spans=[],dist=[0];
 for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i];
   const d=Math.hypot(b[0]-a[0],b[2]-a[2]);
   if(!(d>0))throw Error('Duplicate lift coordinates');
   spans.push(d);dist.push(dist.at(-1)+d);
 }
 return {points,dist,lengthM:dist.at(-1),
   model:'illustrative-straight-segments-not-surveyed-cable',
   approvedForBoarding:false};
}
function position(track,fraction) {
 if(!track||!Array.isArray(track.points)||!Array.isArray(track.dist)||
    !(track.lengthM>0)||!Number.isFinite(fraction))throw Error('Invalid lift track');
 const s=Math.min(1,Math.max(0,fraction))*track.lengthM;
 let i=1;while(i<track.dist.length-1&&track.dist[i]<s)i++;
 const t=(s-track.dist[i-1])/(track.dist[i]-track.dist[i-1]);
 return track.points[i-1].map((v,k)=>v+(track.points[i][k]-v)*t);
}
function carrier(track,seconds,{durationSeconds,phaseOffset=0,direction=1}={}) {
 if(!Number.isFinite(seconds)||!Number.isFinite(durationSeconds)||
    durationSeconds<=0||!Number.isFinite(phaseOffset)||
    ![1,-1].includes(direction))throw Error('Invalid lift visual clock');
 const u=(((seconds/durationSeconds+phaseOffset)%2)+2)%2;
 const fraction=u<=1?u:2-u;
 const ascending=direction===1?u<=1:u>1;
 return {position:position(track,direction===1?fraction:1-fraction),
   ascending,progress:fraction,approvedForBoarding:false};
}
module.exports={geometry,position,carrier};
