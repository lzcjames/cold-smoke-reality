// Read-only, lazy DEM staging loader. Not connected to Course physics.
// A later independent gameplay approval gate can promote verified terrain.
const TerrainTileCache = (() => {
  const nameOk = name => /^tile-[0-9]+-[0-9]+\.json$/.test(name);
  const hashOk = hash => /^[0-9a-f]{64}$/.test(hash || '');
  function create(manifest, {fetchTile, digest, maxResident = 4} = {}) {
    if (manifest?.schema !== 'cold-smoke-measured-tiles-staging/v1' ||
        manifest.sourceOnly !== true || manifest.approvedForGameplay !== false ||
        manifest.readyForRuntime !== false ||
        !hashOk(manifest.sourceOSMSHA256) ||
        !Array.isArray(manifest.tiles) || !manifest.tiles.length ||
        typeof fetchTile !== 'function' || typeof digest !== 'function' ||
        !Number.isInteger(maxResident) || maxResident < 1 || maxResident > 32)
      throw Error('Invalid source-only DEM tile cache configuration');
    const g = manifest.grid;
    if (!g || !Number.isInteger(g.cols) || g.cols < 2 ||
        !Number.isInteger(g.rows) || g.rows < 2 ||
        !Number.isFinite(g.step) || g.step <= 0 ||
        !Number.isFinite(g.east) || !Number.isFinite(g.north))
      throw Error('Invalid measured DEM reference frame');
    const entries = new Map();
    for (const e of manifest.tiles) {
      if (!nameOk(e.filename) || entries.has(e.filename) || !hashOk(e.sha256) ||
          !Number.isInteger(e.bytes) || e.bytes <= 0 || e.bytes > 256 * 1024 ||
          !Number.isInteger(e.startCol) || !Number.isInteger(e.startRow) ||
          !Number.isInteger(e.cols) || !Number.isInteger(e.rows) ||
          e.cols < 2 || e.rows < 2 || e.startCol < 0 || e.startRow < 0 ||
          e.startCol + e.cols > g.cols || e.startRow + e.rows > g.rows)
        throw Error('Invalid measured DEM source tile descriptor');
      entries.set(e.filename, e);
    }
    const cache = new Map(), pending = new Map();
    const same = (a,b) => Math.abs(a-b) < 0.0001;
    async function acquire(name) {
      const e = entries.get(name);
      if (!e) throw Error('Unlisted measured DEM tile');
      if (cache.has(name)) {
        const t = cache.get(name);
        cache.delete(name);cache.set(name,t);
        return t;
      }
      if (pending.has(name)) return pending.get(name);
      const promise = (async () => {
        const raw = await fetchTile(name);
        if (typeof raw !== 'string' || new TextEncoder().encode(raw).length !== e.bytes ||
            await digest(raw) !== e.sha256)
          throw Error('DEM tile body failed original-source integrity');
        const tile = JSON.parse(raw), t = tile.grid;
        if (tile.schema !== 'cold-smoke-dem-source-tile/v1' ||
            tile.resortId !== manifest.resortId ||
            tile.sourceOSMSHA256 !== manifest.sourceOSMSHA256 ||
            tile.routeName !== manifest.routeName ||
            tile.approvedForGameplay !== false ||
            tile.startCol !== e.startCol || tile.startRow !== e.startRow ||
            !t || t.cols !== e.cols || t.rows !== e.rows || t.step !== g.step ||
            !same(t.east,g.east + e.startCol*g.step) ||
            !same(t.north,g.north-e.startRow*g.step) ||
            !Array.isArray(t.heights) || t.heights.length !== e.cols*e.rows ||
            t.heights.some(h => !Number.isFinite(h) || h < 0 || h >= 5000))
          throw Error('DEM tile has invalid georeference or elevation');
        const result = Object.freeze({name, boundsLambert93:e.boundsLambert93?.slice(),
          grid:Object.freeze({cols:t.cols,rows:t.rows,step:t.step,east:t.east,
            north:t.north,heights:Float32Array.from(t.heights)})});
        cache.set(name,result);
        while (cache.size > maxResident) cache.delete(cache.keys().next().value);
        return result;
      })();
      pending.set(name,promise);
      try { return await promise; }
      finally { pending.delete(name); }
    }
    function nearby(east,north,radiusM=0) {
      if (![east,north,radiusM].every(Number.isFinite) || radiusM < 0 || radiusM > 2500)
        throw Error('Invalid DEM neighbourhood query');
      const out=[];
      for (const [name,e] of entries) {
        const w=g.east+e.startCol*g.step, ee=w+(e.cols-1)*g.step;
        const n=g.north-e.startRow*g.step, s=n-(e.rows-1)*g.step;
        if (east+radiusM>=w && east-radiusM<=ee &&
            north+radiusM>=s && north-radiusM<=n)
          out.push({name,distanceSquared:Math.max(w-east,0,east-ee)**2+
            Math.max(s-north,0,north-n)**2});
      }
      return out.sort((a,b)=>a.distanceSquared-b.distanceSquared)
        .map(x=>x.name);
    }
    return Object.freeze({
      acquire,nearby,
      residentNames:()=>[...cache.keys()],
      residentCount:()=>cache.size,
      clear:()=>cache.clear(),
      sourceOnly:true,
      approvedForGameplay:false
    });
  }
  return Object.freeze({create});
})();
