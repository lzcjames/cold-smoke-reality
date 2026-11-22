// Diagnostic only: measured source DEM height continuity across real tile seams.
// This is intentionally NOT called by Course, skier ground contact or renderer.
const TerrainTileProbe = (() => {
  function create(cache,{seamToleranceM=0.001}={}) {
    if (!cache || cache.sourceOnly!==true ||
        cache.approvedForGameplay!==false ||
        typeof cache.nearby!=='function' || typeof cache.acquire!=='function' ||
        !Number.isFinite(seamToleranceM)||seamToleranceM<0||seamToleranceM>0.01)
      throw Error('Only audited source-only terrain cache may be probed');
    function localHeight(tile,east,north) {
      const g=tile.grid;
      const u=(east-g.east)/g.step,v=(g.north-north)/g.step;
      // No extrapolation across source grid limits.
      if(u < -1e-9||v < -1e-9||u > g.cols-1+1e-9||v > g.rows-1+1e-9)
        return null;
      const x=Math.max(0,Math.min(g.cols-1,u));
      const y=Math.max(0,Math.min(g.rows-1,v));
      const i=Math.min(g.cols-2,Math.floor(x));
      const j=Math.min(g.rows-2,Math.floor(y));
      const dx=x-i,dy=y-j,k=j*g.cols+i,h=g.heights;
      return (h[k]*(1-dx)+h[k+1]*dx)*(1-dy)+
             (h[k+g.cols]*(1-dx)+h[k+g.cols+1]*dx)*dy;
    }
    async function sample(east,north) {
      if(!Number.isFinite(east)||!Number.isFinite(north))
        throw Error('Invalid measured terrain query');
      const candidates=cache.nearby(east,north);
      if(!candidates.length)return null;
      let observed=null;
      for(const name of candidates){
        const tile=await cache.acquire(name);
        const h=localHeight(tile,east,north);
        if(h===null)continue;
        if(!Number.isFinite(h))throw Error('Nonfinite measured tile interpolation');
        if(observed!==null && Math.abs(h-observed)>seamToleranceM)
          throw Error('Measured DEM shared border height mismatch');
        observed=h;
      }
      return observed;
    }
    return Object.freeze({sample,sourceOnly:true,approvedForGameplay:false});
  }
  return Object.freeze({create});
})();
