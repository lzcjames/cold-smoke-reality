// Developer-only loader for published source-exact DEM tiles.
// It waits for every source tile and checksum before exposing a height sampler
// to live Reality physics. This does NOT activate moving-tile streaming.
const RealityTileExternal = (() => {
  const sha = bytes => TerrainTileStream.sha256(bytes);
  async function load(asset, manifestUrl, fetcher = fetch) {
    const response = await fetcher(manifestUrl, {cache:'force-cache'});
    if (!response?.ok) throw Error('Measured tile manifest unavailable');
    const manifest = await response.json();
    const g = asset?.grid, m = manifest?.grid, bounds = manifest?.bounds;
    if (asset?.id !== 'les-deux-alpes' ||
        manifest?.schema !== 'cold-smoke-dem-tiles/v1' ||
        manifest.resortId !== asset.id || !g || !m || !bounds ||
        m.east !== g.east || m.north !== g.north || m.step !== g.step ||
        bounds.cols !== g.cols || bounds.rows !== g.rows ||
        !Number.isInteger(m.cells) || m.cells < 2 || m.cells > 2049 ||
        !Array.isArray(manifest.tiles) || !manifest.tiles.length ||
        manifest.tiles.length > 256)
      throw Error('Tile manifest is not the measured Les Deux Alpes DEM');
    const originalBytes = new TextEncoder().encode(JSON.stringify(g.heights));
    if (await sha(originalBytes) !== manifest.sourceHeightSHA256)
      throw Error('Tile manifest source DEM checksum mismatch');
    const dem = TiledDEM.create(m);
    const directory = manifestUrl.slice(0, manifestUrl.lastIndexOf('/')+1);
    const stream = TerrainTileStream.create({dem,manifest,
      capacity:manifest.tiles.length, concurrency:3,
      fetchTile:url=>fetcher(directory+url,{cache:'force-cache'})});
    await stream.retain(manifest.tiles.map(t=>t.id));
    // Original grid is still the authoritative source. Recheck every point
    // before allowing this already loaded world into render and collision.
    for(let j=0;j<g.rows;j++)for(let i=0;i<g.cols;i++){
      const h=dem.sample(g.east+i*g.step,g.north-j*g.step);
      if (h===null || Math.abs(h-g.heights[j*g.cols+i])>1e-6)
        throw Error('Published measured DEM tiles disagree with original grid');
    }
    return Object.freeze({
      tiles:dem.loaded(), external:true,
      covers(e,n) {
        const eps=1e-7;
        return e>=g.east-eps && e<=g.east+(g.cols-1)*g.step+eps &&
          n<=g.north+eps && n>=g.north-(g.rows-1)*g.step-eps;
      },
      height(e,n) {
        const value=dem.sample(e,n);
        if(value===null)throw Error('Measured DEM tile unavailable');
        return value;
      }
    });
  }
  return Object.freeze({load});
})();
if(typeof module!=='undefined' && module.exports)module.exports=RealityTileExternal;
