// Shared, source-agnostic projected DEM tile sampler for future resort-wide Reality Mode.
// Tiles must contain real licensed DEM samples; this module never synthesizes terrain.
// EPSG:2154 East/North metres. x grows east; y grows south in the height matrix.
const TiledDEM = (() => {
  const finite = Number.isFinite;
  function create(spec) {
    const {east, north, step, cells, seamToleranceM = 0.001} = spec || {};
    if (![east, north, step, seamToleranceM].every(finite) || step <= 0 ||
        seamToleranceM < 0 || seamToleranceM > 0.01 ||
        !Number.isInteger(cells) || cells < 2 || cells > 2049)
      throw Error('Invalid projected DEM tile scheme');
    const span = (cells - 1) * step, tiles = new Map();
    const id = (x, y) => x + ':' + y;
    const nearly = (a, b) => Math.abs(a - b) <= seamToleranceM;
    function checkSeam(a, b, vertical) {
      for (let i = 0; i < cells; i++) {
        const p = vertical ? a.heights[i * cells + cells - 1] :
          a.heights[(cells - 1) * cells + i];
        const q = vertical ? b.heights[i * cells] : b.heights[i];
        if (!nearly(p, q)) throw Error('DEM seam mismatch between ' +
          id(a.x, a.y) + ' and ' + id(b.x, b.y) + ' at ' + i);
      }
    }
    function add(tile) {
      const x = tile?.x, y = tile?.y, h = tile?.heights;
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) ||
          (!Array.isArray(h) && !(h instanceof Float32Array) && !(h instanceof Float64Array)) ||
          h.length !== cells * cells || !Array.from(h).every(n => finite(n) && n >= 0 && n < 5000))
        throw Error('Invalid measured DEM tile');
      if (tiles.has(id(x, y))) throw Error('Duplicate DEM tile');
      const t = {x, y, heights: Float64Array.from(h)};
      // Check *before* mutation: a failed add leaves the previous world valid.
      const west = tiles.get(id(x - 1, y)), eastTile = tiles.get(id(x + 1, y));
      const northTile = tiles.get(id(x, y - 1)), south = tiles.get(id(x, y + 1));
      if (west) checkSeam(west, t, true);
      if (eastTile) checkSeam(t, eastTile, true);
      if (northTile) checkSeam(northTile, t, false);
      if (south) checkSeam(t, south, false);
      tiles.set(id(x, y), t);
      return t;
    }
    function remove(x, y) { return tiles.delete(id(x, y)); }
    function tileAt(e, n) {
      if (!finite(e) || !finite(n)) return null;
      const u = (e - east) / span, v = (north - n) / span;
      const tx = Math.floor(u), ty = Math.floor(v);
      // A sample exactly on an outer tile boundary may be valid even
      // if its neighbour is intentionally absent (yet to be streamed).
      for (const dx of [0, -1]) for (const dy of [0, -1]) {
        const x = tx + dx, y = ty + dy, tile = tiles.get(id(x, y));
        if (!tile) continue;
        const col = (e - (east + x * span)) / step;
        const row = ((north - y * span) - n) / step;
        if (col >= -1e-8 && row >= -1e-8 &&
            col <= cells - 1 + 1e-8 && row <= cells - 1 + 1e-8)
          return {tile, col: Math.max(0, Math.min(cells - 1, col)),
            row: Math.max(0, Math.min(cells - 1, row))};
      }
      return null;
    }
    function sample(e, n) {
      const hit = tileAt(e, n);
      if (!hit) return null; // never use a fabricated height at missing coverage
      const {tile, col, row} = hit;
      const i = Math.min(cells - 2, Math.floor(col));
      const j = Math.min(cells - 2, Math.floor(row));
      const tx = col - i, ty = row - j, k = j * cells + i, h = tile.heights;
      return (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - ty) +
        (h[k + cells] * (1 - tx) + h[k + cells + 1] * tx) * ty;
    }
    function has(e, n) { return tileAt(e, n) !== null; }
    function loaded() { return tiles.size; }
    return Object.freeze({add, remove, sample, has, loaded,
      spec: Object.freeze({east, north, step, cells, span, seamToleranceM})});
  }
  return Object.freeze({create});
})();
if (typeof module !== 'undefined' && module.exports) module.exports = TiledDEM;
