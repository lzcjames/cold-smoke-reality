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
  function create(data) {
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
    function elevation(x, z) {
      const u = clampTo((e0 - x * dn - z * de - east) / step, cols - 1);
      const v = clampTo((north - n0 - x * de + z * dn) / step, rows - 1);
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
      difficulty: typeof piste.difficulty === 'string' ? piste.difficulty : null,
      height, centre,
      project(e, n) {
        return [(n - n0) * de - (e - e0) * dn, -(e - e0) * de - (n - n0) * dn];
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
      // Revisioned URL + browser HTTP cache retain downloaded resort packs across
      // visits without pinning the large raw JSON in JS memory indefinitely.
      const url = 'reality/' + resort.id + '.json?v=' + resort.revision;
      let response = await fetch(url, { cache: 'force-cache' });
      // A temporary 404 can be cached. Revalidate on failure so a later
      // retry can recover when the pack becomes available again.
      if (!response.ok) response = await fetch(url, { cache: 'reload' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (data.id !== resort.id) throw new Error('Resort asset identity mismatch.');
      const terrain = create(data);
      terrain.resortName = resort.name;
      if (network) terrain.network = PisteNetwork.create(terrain, data);
      return terrain;
    } catch (error) {
      throw new Error(resort.name + ' terrain unavailable: ' + error.message);
    }
  }
  return { id, filename, catalog, get, has, defaultId, create, load };
})();
