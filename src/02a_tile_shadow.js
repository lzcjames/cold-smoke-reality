// Developer opt-in: exercise *real* hashed tile loading while the skier moves.
// The authoritative already-verified Reality grid keeps controlling both
// collision and rendering. Only audit counters read this bounded DEM cache.
// No per-frame network waits, fabricated ground, or gameplay side effects.
const TerrainTileShadow = (() => {
  const pair = v => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
  function create({asset,manifest,fetchTile,hashBytes,capacity=6,lookaheadSeconds=1.5}) {
    const g=asset?.grid,m=manifest?.grid;
    if(asset?.id!=='les-deux-alpes'||!g||!m ||
      manifest?.schema!=='cold-smoke-dem-tiles/v1' ||
      manifest.resortId!==asset.id ||
      m.east!==g.east||m.north!==g.north||m.step!==g.step||
      manifest.bounds?.cols!==g.cols||manifest.bounds?.rows!==g.rows||
      !Number.isInteger(m.cells)||m.cells<2||
      !Array.isArray(manifest.tiles)||!manifest.tiles.length||
      !Number.isInteger(capacity)||capacity<1||capacity>32)
      throw Error('Verified measured DEM manifest required for shadow audit');
    // Browser scripts share top-level declarations; standalone Node unit
    // tests instead resolve these dependencies from CommonJS modules.
    const DEM=typeof TiledDEM!=='undefined' ? TiledDEM :
      require('./02a_tiled_dem.js');
    const Stream=typeof TerrainTileStream!=='undefined' ? TerrainTileStream :
      require('./02a_tile_stream.js');
    const Neighborhood=typeof TerrainTileNeighborhood!=='undefined' ?
      TerrainTileNeighborhood : require('./02a_tile_neighborhood.js');
    const dem=DEM.create(m);
    const stream=Stream.create({dem,manifest,fetchTile,hashBytes,
      concurrency:2,capacity});
    const neighborhood=Neighborhood.create({
      scheme:{east:m.east,north:m.north,span:(m.cells-1)*m.step},
      tileIds:stream.catalogIds(),radius:1,lookaheadSeconds,
      budget:capacity});
    let running=false,queued=null,signature='',closed=false,generation=0;
    let checked=0,peakErrorM=0,failures=0,lastError='',updates=0;
    function expected(e,n) {
      const u=(e-g.east)/g.step,v=(g.north-n)/g.step;
      if(u<0||v<0||u>g.cols-1||v>g.rows-1)return null;
      const i=Math.min(g.cols-2,Math.floor(u)),
        j=Math.min(g.rows-2,Math.floor(v));
      const a=u-i,b=v-j,k=j*g.cols+i,h=g.heights;
      return (h[k]*(1-a)+h[k+1]*a)*(1-b)+
        (h[k+g.cols]*(1-a)+h[k+g.cols+1]*a)*b;
    }
    async function drain() {
      if(running)return;
      running=true;
      try {
        while(queued&&!closed) {
          const request=queued;
          queued=null;
          try {
            await stream.retain(request.ids);
            // Ground may have moved while the download ran. Only compare the
            // sample of the *latest* desired footprint, never an obsolete one.
            if(queued||closed||request.generation!==generation)continue;
            for(const [e,n] of request.probes) {
              const h=dem.sample(e,n),original=expected(e,n);
              // Off-crop lookahead is not surveyed, but an in-crop
              // missing tile is a genuine audit failure, not a zero-error
              // success that conceals the cache's missing ski contact.
              if(original===null)continue;
              if(h===null||!Number.isFinite(h))
                throw Error('Measured DEM shadow tile missing at ski contact');
              const error=Math.abs(h-original);
              peakErrorM=Math.max(peakErrorM,error);
              checked++;
              if(error>0.002)throw Error('Measured DEM shadow mismatch');
            }
            updates++;
          } catch(error) {
            if(closed||queued||request.generation!==generation)continue;
            failures++;
            lastError=error?.message||String(error);
            // Failed or corrupt requests must be eligible for a later
            // retry at the same location; no per-frame retry loop.
            signature='';
          }
        }
      } finally {running=false;}
    }
    function observe(position,velocity=[0,0]) {
      if(closed||!pair(position)||!pair(velocity))return false;
      const choice=neighborhood.select(position,velocity);
      if(!choice.ready) {
        // Leaving known coverage cancels queued comparisons and invalidates
        // an in-flight response. It must never masquerade as current ground.
        generation++;
        queued=null;
        signature='';
        return false;
      } // outside the sourced resort crop
      const sig=choice.ids.join(',');
      if(sig===signature)return true; // bound network work by tile changes
      signature=sig;
      // Sample both ski edges and the center along the future path;
      // only six very cheap height lookups at the scheduled 4 Hz audit
      // frequency, completely outside the physics/render height path.
      const dx=velocity[0]*lookaheadSeconds,dy=velocity[1]*lookaheadSeconds;
      const mag=Math.hypot(dx,dy),nx=mag>1e-9?-dy/mag:1,
        ny=mag>1e-9?dx/mag:0;
      const projected=[];
      for(const fraction of [0,0.5,1])for(const side of [-0.45,0,0.45])
        projected.push([position[0]+dx*fraction+nx*side,
          position[1]+dy*fraction+ny*side]);
      queued={ids:choice.ids,probes:projected,generation:++generation};
      void drain();
      return true;
    }
    function status() {
      return Object.freeze({checked,peakErrorM,failures,lastError,updates,
        running,loaded:stream.status().loaded.length,
        protected:stream.status().protected.slice()});
    }
    function close(){closed=true;generation++;queued=null;signature='';}
    return Object.freeze({observe,status,close});
  }
  return Object.freeze({create});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=TerrainTileShadow;
