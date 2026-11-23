// Compatibility layer between surveyed EPSG:2154 terrain tiles and Reality Mode.
// No changes to the live collision solver: an incomplete tile world is NOT playable.
const TiledReality = (() => {
  const finitePair = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  function create(options) {
    const {id, name, elevationSource, reference, grid, tiles = []} = options || {};
    if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ||
        typeof name !== 'string' || !name.trim() ||
        typeof elevationSource !== 'string' || !elevationSource.trim() ||
        !reference || !finitePair(reference.originLambert93) ||
        !finitePair(reference.downhillLambert93) || !Number.isFinite(reference.datumM) ||
        !grid || !Array.isArray(tiles))
      throw Error('Verified tiled resort reference and DEM scheme required');
    const de = reference.downhillLambert93[0], dn = reference.downhillLambert93[1];
    if (Math.abs(Math.hypot(de, dn) - 1) > 1e-6)
      throw Error('Downhill reference must be a unit projected direction');
    const [e0, n0] = reference.originLambert93;
    const sampler = typeof TiledDEM !== 'undefined' ? TiledDEM : require('./02a_tiled_dem.js');
    const dem = sampler.create(grid);
    for (const tile of tiles) dem.add(tile);
    function toWorld(e, n) {
      if (!Number.isFinite(e) || !Number.isFinite(n)) return null;
      return [(n - n0) * de - (e - e0) * dn,
        -(e - e0) * de - (n - n0) * dn];
    }
    function toProjected(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
      return [e0 - x * dn - z * de, n0 + x * de - z * dn];
    }
    function altitude(x, z) {
      const p = toProjected(x, z);
      return p ? dem.sample(...p) : null;
    }
    function height(x, z) {
      const h = altitude(x, z);
      return h === null ? null : h - reference.datumM;
    }
    function withinDEM(x, z) {
      const p = toProjected(x, z);
      return !!p && dem.has(...p);
    }
    // A strict gate: the existing skier/clipmap render loop requires a
    // *finite*, synchronously available height. Never return a bogus zero
    // or clamp to a tile's outer edge when a tile is missing.
    function requireHeight(x, z) {
      const h = height(x, z);
      if (h === null) throw Error('DEM tile missing: gameplay must await verified coverage');
      return h;
    }
    // Non-playable contact preflight for the two existing 1.5 m skis.
    // Sample identical world-height datum at nine stations along each ski.
    // Every station must lie on loaded, measured DEM; a missing station
    // invalidates the whole footprint rather than blending invented ground.
    function sampleSkiFootprint(x, z, headingRad, stanceM = 0.31,
                               skiLengthM = 1.5) {
      if (![x, z, headingRad, stanceM, skiLengthM].every(Number.isFinite) ||
          stanceM <= 0 || stanceM > 2 || skiLengthM <= 0 || skiLengthM > 3)
        throw Error('Invalid measured ski footprint');
      const forwardX = Math.sin(headingRad), forwardZ = Math.cos(headingRad);
      const sideX = forwardZ, sideZ = -forwardX;
      const skis = [];
      for (const side of [-0.5, 0.5]) {
        const heights = [];
        for (let i = 0; i < 9; i++) {
          const along = (i / 8 - 0.5) * skiLengthM;
          const px = x + sideX * side * stanceM + forwardX * along;
          const pz = z + sideZ * side * stanceM + forwardZ * along;
          const measured = height(px, pz);
          if (measured === null || !Number.isFinite(measured)) return null;
          heights.push(measured);
        }
        skis.push(Object.freeze(heights));
      }
      return Object.freeze(skis);
    }
    function validateCorridor(centreline, halfWidthM, sampleStepM = 5) {
      if (!Array.isArray(centreline) || centreline.length < 2 ||
          centreline.some(p => !finitePair(p)) ||
          !Number.isFinite(halfWidthM) || halfWidthM < 0 ||
          !Number.isFinite(sampleStepM) || sampleStepM <= 0 || sampleStepM > 50)
        throw Error('Invalid surveyed corridor');
      const world = centreline.map(p => toWorld(...p));
      const covered = (x, z) => {
        if (!withinDEM(x, z)) return false;
        const h = altitude(x, z);
        return h !== null && Number.isFinite(h);
      };
      for (let i = 1; i < world.length; i++) {
        const [a, b] = [world[i - 1], world[i]];
        const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
        if (!(length > 0) || length > 100000) throw Error('Invalid corridor segment');
        const count = Math.ceil(length / sampleStepM);
        const nx = -dz / length, nz = dx / length;
        for (let j = i === 1 ? 0 : 1; j <= count; j++) {
          const t = j / count, x = a[0] + t * dx, z = a[1] + t * dz;
          // Cover the whole width, not just centre and outer edges.
          // Otherwise a missing interior tile can falsely pass validation.
          // Sampling is limited to 5m intervals and bounded to avoid huge
          // preflight workloads for accidentally oversized corridors.
          const transverseCount = Math.max(1, Math.ceil(2 * halfWidthM / 5));
          if (transverseCount > 4096)
            throw Error('Surveyed corridor exceeds coverage sample budget');
          for (let k = 0; k <= transverseCount; k++) {
            const offset = halfWidthM === 0 ? 0 :
              -halfWidthM + 2 * halfWidthM * k / transverseCount;
            if (!covered(x + nx * offset, z + nz * offset))
              return false;
          }
        }
      }
      return true;
    }
    return Object.freeze({id, resortName:name, elevationSource, project:toWorld,
      toProjected, altitude, height, requireHeight, withinDEM,
      validateCorridor, sampleSkiFootprint, dem, // no live Course activation
      approvedForGameplay:false});
  }
  return Object.freeze({create});
})();
if (typeof module !== 'undefined' && module.exports) module.exports = TiledReality;
