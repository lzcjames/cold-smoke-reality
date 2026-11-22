// Fail-closed projected-motion preflight for measured streamed DEM tiles.
// A live integration must await prepare() *before* committing skier movement.
// This module never silently clamps, teleports, or fabricates terrain.
const TerrainTileMotionGate = (() => {
  const pair=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
  function create({neighborhood,stream,dem,footprintM=1,sampleStepM=2.5}) {
    if(typeof neighborhood?.select!=='function' ||
       typeof neighborhood?.tileIdAt!=='function' ||
       typeof neighborhood?.known!=='function' ||
       typeof stream?.retain!=='function' ||
       typeof stream?.status!=='function' ||
       typeof dem?.has!=='function' ||
       !Number.isFinite(footprintM)||footprintM<0||footprintM>5 ||
       !Number.isFinite(sampleStepM)||sampleStepM<=0||sampleStepM>10)
      throw Error('Measured stream and bounded ski-contact footprint required');
    let revision=0, token=null;
    function samples(from,to) {
      if(!pair(from)||!pair(to))throw Error('Invalid projected motion segment');
      const dx=to[0]-from[0],dy=to[1]-from[1];
      const distance=Math.hypot(dx,dy);
      if(distance>2000)throw Error('Unbounded projected motion segment');
      // At zero speed, check both ski edges along the previous heading is
      // unknowable; demand a circular footprint around the contact point.
      const nx=distance>0?-dy/distance:1, ny=distance>0?dx/distance:0;
      const count=Math.max(1,Math.ceil(distance/sampleStepM));
      const points=[];
      for(let i=0;i<=count;i++){
        const x=from[0]+dx*i/count,y=from[1]+dy*i/count;
        for(const d of [-footprintM,0,footprintM])
          points.push([x+nx*d,y+ny*d]);
        if(distance===0) {
          points.push([x,y+footprintM],[x,y-footprintM]);
        }
      }
      return points;
    }
    function covered(points) {
      return points.every(p=>dem.has(p[0],p[1]));
    }
    function permit(ticket,from,to) {
      if(!ticket || token!==ticket || ticket.revision!==revision ||
         !pair(from)||!pair(to) ||
         from[0]!==ticket.from[0]||from[1]!==ticket.from[1]||
         to[0]!==ticket.to[0]||to[1]!==ticket.to[1])
        return false;
      // A later eviction invalidates a previously prepared step.
      return covered(ticket.points);
    }
    async function prepare(from,to,velocity=[0,0]) {
      const points=samples(from,to);
      if(!pair(velocity))throw Error('Invalid projected velocity');
      const current=++revision;
      token=null;
      const first=neighborhood.select(from,velocity);
      const second=neighborhood.select(to,velocity);
      if(!first.ready || !second.ready) return null;
      // Neighborhood prioritization alone can omit a ski-edge tile when
      // the lookahead budget is tight. Demand EVERY exact footprint tile.
      const required = new Set();
      for (const point of points) {
        const id = neighborhood.tileIdAt(point);
        if (!neighborhood.known(id)) return null;
        required.add(id);
      }
      const ids=[...required];
      for (const id of [...first.ids,...second.ids])
        if (!required.has(id) && ids.length < stream.status().capacity) {
          ids.push(id);
          required.add(id);
        }
      if(ids.length>stream.status().capacity) return null;
      await stream.retain(ids);
      if(current!==revision || !covered(points)) return null;
      const ticket=Object.freeze({revision:current,
        from:Object.freeze(from.slice()),to:Object.freeze(to.slice()),
        points:Object.freeze(points.map(p=>Object.freeze(p)))});
      token=ticket;
      return ticket;
    }
    function invalidate(){revision++;token=null;}
    return Object.freeze({prepare,permit,invalidate});
  }
  return Object.freeze({create});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=TerrainTileMotionGate;
