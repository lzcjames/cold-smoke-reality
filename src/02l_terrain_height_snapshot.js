// Synchronous source-only DEM height snapshot for already loaded, verified tiles.
// Never fetches during a physics tick and never approves new skiable terrain.
const TerrainHeightSnapshot = (() => {
  function create(manifest, loaded, {seamToleranceM=0.002, maxTiles=32}={}) {
    if (manifest?.schema!=='cold-smoke-measured-tiles-staging/v1' ||
        manifest.sourceOnly!==true || manifest.approvedForGameplay!==false ||
        manifest.readyForRuntime!==false ||
        !Array.isArray(manifest.tiles) || !manifest.tiles.length ||
        !Array.isArray(loaded) || !loaded.length ||
        !Number.isInteger(maxTiles) || maxTiles<1 || maxTiles>32 ||
        loaded.length>maxTiles ||
        !Number.isFinite(seamToleranceM) || seamToleranceM<0 || seamToleranceM>0.01)
      throw Error('Only bounded, non-playable measured tile snapshots may be sampled');
    const global=manifest.grid, list=[];
    if (!global || !Number.isFinite(global.step) || global.step<=0 ||
        !Number.isFinite(global.east) || !Number.isFinite(global.north) ||
        !Number.isInteger(global.cols) || global.cols<2 ||
        !Number.isInteger(global.rows) || global.rows<2)
      throw Error('Invalid measured source grid');
    const byName=new Map();
    for (const e of manifest.tiles) {
      if (typeof e.filename!=='string' || byName.has(e.filename) ||
          !/^tile-[0-9]+-[0-9]+\.json$/.test(e.filename))
        throw Error('Invalid source tile inventory');
      byName.set(e.filename,e);
    }
    const names=new Set();
    for(const tile of loaded){
      const e=byName.get(tile?.name),g=tile?.grid;
      if(!e||names.has(tile.name) || !g || g.cols!==e.cols ||
         g.rows!==e.rows || g.step!==global.step ||
         !Number.isInteger(e.startCol) || !Number.isInteger(e.startRow) ||
         e.startCol<0 || e.startRow<0 || e.startCol+e.cols>global.cols ||
         e.startRow+e.rows>global.rows ||
         Math.abs(g.east-(global.east+e.startCol*global.step))>0.0001 ||
         Math.abs(g.north-(global.north-e.startRow*global.step))>0.0001 ||
         !g.heights || g.heights.length!==g.cols*g.rows)
        throw Error('Unlisted or inconsistent measured source tile');
      names.add(tile.name);
      // Snapshot is independent from cache LRU eviction: fixed checked numeric
      // buffers, no mutable tile object references in each physics query.
      const heights=Float32Array.from(g.heights);
      if(heights.some(h=>!Number.isFinite(h)||h<0||h>=5000))
        throw Error('Unmeasured or invalid terrain height');
      list.push({cols:g.cols,rows:g.rows,step:g.step,
        east:g.east,north:g.north,heights});
    }
    // Neighboring source chunks must agree at every overlapping grid node.
    // Missing chunks are allowed (source-only local cache, never a fill).
    for(let a=0;a<loaded.length;a++)for(let b=a+1;b<loaded.length;b++){
      const x=byName.get(loaded[a].name),y=byName.get(loaded[b].name);
      const loX=Math.max(x.startCol,y.startCol),hiX=Math.min(x.startCol+x.cols-1,y.startCol+y.cols-1);
      const loY=Math.max(x.startRow,y.startRow),hiY=Math.min(x.startRow+x.rows-1,y.startRow+y.rows-1);
      if(hiX<loX||hiY<loY)continue;
      for(let row=loY;row<=hiY;row++)for(let col=loX;col<=hiX;col++){
        const av=list[a].heights[(row-x.startRow)*x.cols+col-x.startCol];
        const bv=list[b].heights[(row-y.startRow)*y.cols+col-y.startCol];
        if(Math.abs(av-bv)>seamToleranceM)throw Error('Source DEM tile seam disagrees');
      }
    }
    function height(east,north) {
      if(!Number.isFinite(east)||!Number.isFinite(north))return null;
      for(let t=0;t<list.length;t++){
        const g=list[t],u=(east-g.east)/g.step,v=(g.north-north)/g.step;
        if(u<0||v<0||u>g.cols-1||v>g.rows-1)continue;
        const i=Math.min(g.cols-2,Math.floor(u)),j=Math.min(g.rows-2,Math.floor(v));
        const dx=u-i,dy=v-j,k=j*g.cols+i,h=g.heights;
        return (h[k]*(1-dx)+h[k+1]*dx)*(1-dy)+
               (h[k+g.cols]*(1-dx)+h[k+g.cols+1]*dx)*dy;
      }
      return null;
    }
    return Object.freeze({
      sample:height,
      residentTiles:list.length,
      sourceOnly:true,approvedForGameplay:false,
      readyForPhysics:false
    });
  }
  return Object.freeze({create});
})();
