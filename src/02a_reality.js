// A measured DEM and a downhill OSM piste in a shared projected metre grid.
const Reality = (() => {
  // The catalog is embedded in the small HTML shell at build time; no resort DEM is
  // fetched or parsed when opening the default procedural mountain.
  const id = 'alpe-dhuez', filename = 'reality/alpe-dhuez.json';
  let catalogCache;
  function catalog() {
    if (catalogCache) return catalogCache;
    const raw = typeof document === 'undefined' ? null :
      document.getElementById('app')?.dataset.realityCatalog;
    if (!raw || raw === 'missing') return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw Error('Invalid resort catalog.');
    catalogCache = parsed;
    return parsed;
  }
  const get = resortId => catalog().find(resort => resort.id === resortId) || null;
  const has = resortId => !!get(resortId);
  const defaultId = () => catalog()[0]?.id || id;
  const clampTo = (n, max) => Math.max(0, Math.min(max, n));
  const mix = (a, b, t) => a + (b - a) * t;
  function create(data, suppliedTilePreview = null) {
    const { grid, piste, elevationSource } = data || {};
    const valid = (grid && piste && data.version === 1 &&
      typeof data.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.id) &&
      Number.isInteger(grid.cols) && grid.cols >= 2 && grid.cols <= 1200 &&
      Number.isInteger(grid.rows) && grid.rows >= 2 && grid.rows <= 1200 &&
      Number.isFinite(grid.step) && grid.step > 0 &&
      [grid.east, grid.north].every(Number.isFinite) &&
      Array.isArray(grid.heights) && grid.heights.length === grid.cols * grid.rows &&
      grid.heights.every(y => Number.isFinite(y) && y >= 0 && y < 5000) &&
      Number.isSafeInteger(piste.osmWay) && piste.osmWay > 0 &&
      typeof piste.name === 'string' && piste.name.trim() &&
      typeof elevationSource === 'string' && elevationSource.trim() &&
      Array.isArray(piste.points) && piste.points.length >= 2 &&
      piste.points.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)));
    if (!valid) throw new Error('Invalid Alpe d’Huez terrain data.');

    const { cols, rows, step, east, north } = grid;
    const heights = Float32Array.from(grid.heights);
    const [[e0, n0]] = piste.points;
    const [e1, n1] = piste.points.at(-1);
    const length = Math.hypot(e1 - e0, n1 - n0);
    if (length < 50) throw new Error('Alpe d’Huez piste is too short.');
    const de = (e1 - e0) / length, dn = (n1 - n0) / length;
    const route = piste.points.map(([e, n]) => [
      (e - e0) * -dn + (n - n0) * de,
      (e - e0) * de + (n - n0) * dn,
    ]);
    const border = 20;
    function inside(e, n) {
      return e >= east + border && e <= east + (cols - 1) * step - border &&
        n <= north - border && n >= north - (rows - 1) * step + border;
    }
    if (route.some((p, i) => (i > 0 && p[1] <= route[i - 1][1]) || !inside(...piste.points[i]))) {
      throw new Error('Alpe d’Huez piste must run downhill through the DEM coverage.');
    }
    // Developer-only A/B audit on the EXISTING real source. Preload all
    // tile samples before any camera or skier query; never async-swap ground.
    // Render and collision use the same elevation() path, so the experiment
    // measures seam continuity without altering skier contact code.
    const tilePreview = suppliedTilePreview || (data.id === 'les-deux-alpes' &&
      typeof location !== 'undefined' &&
      /(?:^|[?&])tileCollision=1(?:&|$)/.test(location.search || '') &&
      typeof RealityTilePreview !== 'undefined'
      ? RealityTilePreview.fromGrid(grid) : null);
    function elevation(x, z) {
      const e=e0-x*dn-z*de, n=n0+x*de-z*dn;
      if (tilePreview && tilePreview.covers(e,n))
        return tilePreview.height(e,n);
      // Preserve existing clamped outer-edge rendering beyond DEM coverage.
      const u = clampTo((e - east) / step, cols - 1);
      const v = clampTo((north - n) / step, rows - 1);
      const i = Math.min(Math.floor(u), cols - 2), j = Math.min(Math.floor(v), rows - 2);
      const k = j * cols + i;
      return mix(mix(heights[k], heights[k + 1], u - i),
        mix(heights[k + cols], heights[k + cols + 1], u - i), v - j);
    }
    if (elevation(0, 0) - elevation(0, -length) < 25) throw new Error('Alpe d’Huez piste has insufficient descent.');
    const start = 14, halfWidth = 18; // OSM maps a centreline here. The piste width is an estimate.
    function centre(s) {
      let lo = 0, hi = route.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (s >= route[mid][1]) lo = mid;
        else hi = mid;
      }
      const [a, sa] = route[lo], [b, sb] = route[hi];
      return mix(a, b, clampTo((s - sa) / (sb - sa), 1));
    }
    const datum = elevation(0, 0);
    const height = (x, z) => elevation(x, z) - datum;
    if (height(centre(start + 8), -start - 8) >= height(centre(start), -start)) {
      throw new Error('Alpe d’Huez piste spawn has no downhill gradient.');
    }
    const withinDEM = (x, z) => inside(e0 - x * dn - z * de, n0 + x * de - z * dn);
    return {
      id: data.id, piste: piste.name, osmWay: piste.osmWay, elevationSource, length, start, halfWidth,
      tilePreviewEnabled: !!tilePreview, tilePreviewCount: tilePreview?.tiles || 0,
      difficulty: typeof piste.difficulty === 'string' ? piste.difficulty : null,
      height, centre,
      // Absolute IGN DEM elevation for altitude-aware *procedural* off-piste
      // vegetation. This does not assert a surveyed tree inventory.
      altitude: elevation,
      project(e, n) {
        return [(n - n0) * de - (e - e0) * dn, -(e - e0) * de - (n - n0) * dn];
      },
      toProjected(x, z) {
        return [e0 - x * dn - z * de, n0 + x * de - z * dn];
      },
      velocityToProjected(vx, vz) {
        return [-vx * dn - vz * de, vx * de - vz * dn];
      },
      withinDEM,
      contains(x, z) {
        return -z < length && withinDEM(x, z);
      },
    };
  }

  async function load(resortId = defaultId(), network = false) {
    const resort = get(resortId);
    if (!resort || (network && !resort.network)) {
      throw new Error('Unknown resort or piste network: ' + resortId);
    }
    try {
      // URL hash invalidates changed packs. CacheStorage makes navigation back
      // to an already downloaded resort deterministic even if HTTP cache policies
      // differ by browser. Keep at most three packs, with LRU eviction.
      const url = 'reality/' + resort.id + '.json?v=' + resort.revision;
      let store = null, data = null, cachedTerrain = null, responseForStore = null, reusedResponse = null;
      try {
        if (typeof caches !== 'undefined') {
          store = await caches.open('cold-smoke-resorts-v1');
          const hit = await store.match(url);
          if (hit?.ok) {
            // Clone before consuming JSON, so a successfully used entry can
            // be moved to the back of the cache's insertion-ordered keys.
            const clone = hit.clone();
            const candidate = await hit.json();
            if (candidate?.id === resort.id) {
              // Do not trust a cached JSON merely because its id matches.
              // Validate its terrain and (when requested) its piste network
              // before accepting it; a damaged cache must be recoverable.
              try {
                const terrain = create(candidate);
                if (network) terrain.network = PisteNetwork.create(terrain, ResortRoutes.current(candidate, terrain));
                data = candidate;
                cachedTerrain = terrain;
                reusedResponse = clone;
              } catch (_) {
                await store.delete(url);
              }
            } else await store.delete(url);
          }
        }
      } catch (_) { data = null; store = null; } // cache access may be disabled
      if (!data) {
        let response = await fetch(url, { cache: 'force-cache' });
        // A cached 404 must not poison the pack when an outage recovers.
        if (!response.ok) response = await fetch(url, { cache: 'reload' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        responseForStore = store ? response.clone() : null;
        data = await response.json();
      }
      if (data.id !== resort.id) throw new Error('Resort asset identity mismatch.');
      // External tiles are verified and fully loaded before the first physics
      // or camera height query. Normal player boot remains unchanged.
      const externalTiles = resort.id === 'les-deux-alpes' &&
        typeof location !== 'undefined' &&
        /(?:^|[?&])tileStream=1(?:&|$)/.test(location.search || '');
      const externalPreview = externalTiles
        ? await RealityTileExternal.load(data,'reality/les-deux-alpes-tiles/manifest.json')
        : null;
      const terrain = externalPreview ? create(data,externalPreview) :
        cachedTerrain || create(data);
      terrain.resortName = resort.name;
      // Shadow-audit true network streaming while skiing, with the original
      // already measured grid remaining the sole physics/render authority.
      // No extra requests or per-frame allocations in default gameplay.
      const auditTiles = resort.id === 'les-deux-alpes' &&
        typeof location !== 'undefined' &&
        /(?:^|[?&])tileAudit=1(?:&|$)/.test(location.search || '');
      if (auditTiles) {
        const manifestUrl='reality/les-deux-alpes-tiles/manifest.json';
        const response=await fetch(manifestUrl,{cache:'force-cache'});
        if(!response.ok)throw Error('Measured shadow DEM manifest unavailable');
        const manifest=await response.json();
        const digest=await TerrainTileStream.sha256(
          new TextEncoder().encode(JSON.stringify(data.grid.heights)));
        if(digest!==manifest.sourceHeightSHA256)
          throw Error('Shadow DEM source checksum mismatch');
        const directory=manifestUrl.slice(0,manifestUrl.lastIndexOf('/')+1);
        terrain.tileShadow=TerrainTileShadow.create({asset:data,manifest,
          fetchTile:url=>fetch(directory+url,{cache:'force-cache'})});
      }
      // A cached single-grid Reality object cannot supply the network of a
      // newly created tiled terrain: its slope/coordinates belong to the old
      // object. Always construct the selected network on the returned terrain.
      if (network && (externalPreview || !cachedTerrain))
        terrain.network = PisteNetwork.create(terrain, ResortRoutes.current(data, terrain));
      if (store && (responseForStore || reusedResponse)) {
        try {
          if (reusedResponse) await store.delete(url);
          await store.put(url, responseForStore || reusedResponse);
          const current = new URL(url, location.href), keys = await store.keys();
          for (const key of keys) {
            const candidate = new URL(key.url);
            if (candidate.pathname === current.pathname && candidate.search !== current.search) {
              await store.delete(key); // old revision of this resort
            }
          }
          const remaining = await store.keys();
          while (remaining.length > 3) await store.delete(remaining.shift());
        } catch (_) { /* Quota/private mode: HTTP cache still works as fallback. */ }
      }
      return terrain;
    } catch (error) {
      throw new Error(resort.name + ' terrain unavailable: ' + error.message);
    }
  }
  return { id, filename, catalog, get, has, defaultId, create, load };
})();
