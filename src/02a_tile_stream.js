// Source-pinned on-demand DEM loading. Opt-in foundation: not wired to live
// Reality/physics until measured resort-wide packs pass coverage gates.
const TerrainTileStream = (() => {
  const HEX = /^[a-f0-9]{64}$/;
  const KEY = /^-?\d+:-?\d+$/;
  const URL_OK = /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.json$/;
  const key = (x, y) => x + ':' + y;
  async function sha256(bytes) {
    if (!globalThis.crypto?.subtle) throw Error('SHA-256 unavailable: refusing unverified DEM');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
  }
  function create({dem, manifest, fetchTile, hashBytes = sha256, capacity = 16, concurrency = 3}) {
    if (!dem || typeof dem.add !== 'function' || typeof dem.remove !== 'function' ||
        typeof dem.has !== 'function' || !Number.isInteger(capacity) || capacity < 1 ||
        !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8 ||
        !Array.isArray(manifest?.tiles) || !manifest.tiles.length ||
        manifest.schema !== 'cold-smoke-dem-tiles/v1' ||
        typeof fetchTile !== 'function' || typeof hashBytes !== 'function')
      throw Error('Invalid pinned DEM tile streaming configuration');
    const catalog = new Map(), loaded = new Map(), pending = new Map();
    for (const entry of manifest.tiles) {
      if (!entry || !Number.isSafeInteger(entry.x) || !Number.isSafeInteger(entry.y) ||
          !KEY.test(entry.id || '') || entry.id !== key(entry.x, entry.y) ||
          !URL_OK.test(entry.url || '') || entry.url.includes('..') ||
          !HEX.test(entry.sha256 || '') || catalog.has(entry.id))
        throw Error('Invalid or duplicate source-pinned DEM tile descriptor');
      catalog.set(entry.id, entry);
    }
    let active = 0;
    const queue = [];
    let protectedIds = new Set();
    function evict() {
      // Keep pinned geometry intact even if it temporarily exceeds budget.
      for (const [id, tile] of loaded) {
        if (loaded.size <= capacity) break;
        if (protectedIds.has(id)) continue;
        loaded.delete(id);
        dem.remove(tile.x, tile.y);
      }
    }
    function schedule() {
      while (active < concurrency && queue.length) {
        const job = queue.shift();
        active++;
        (async () => {
          const entry = catalog.get(job.id);
          const response = await fetchTile(entry.url);
          if (!response?.ok) throw Error('DEM tile HTTP failure ' + entry.id);
          const bytes = await response.arrayBuffer();
          const digest = await hashBytes(bytes);
          if (digest !== entry.sha256)
            throw Error('DEM checksum mismatch ' + entry.id);
          const payload = JSON.parse(new TextDecoder().decode(bytes));
          if (payload.x !== entry.x || payload.y !== entry.y ||
              !Array.isArray(payload.heights))
            throw Error('DEM tile identity or height data mismatch ' + entry.id);
          const tile = dem.add(payload); // seam validation is atomic
          loaded.set(job.id, tile);
          evict();
          // A speculative load cannot promise terrain if every cache slot
          // belongs to the skier's protected footprint. Never report a tile
          // that was immediately evicted and is absent from collision DEM.
          if (!loaded.has(job.id))
            throw Error('DEM tile cannot be retained within protected cache budget ' + job.id);
          return tile;
        })().then(value => {
          pending.delete(job.id);
          active--;
          schedule();
          job.resolve(value);
        }, error => {
          pending.delete(job.id);
          active--;
          schedule();
          job.reject(error);
        });
      }
    }
    function load(id) {
      if (!catalog.has(id)) return Promise.reject(Error('Unknown verified DEM tile ' + id));
      if (loaded.has(id)) {
        const tile = loaded.get(id);
        loaded.delete(id); loaded.set(id, tile); // LRU
        return Promise.resolve(tile);
      }
      if (pending.has(id)) return pending.get(id);
      const p = new Promise((resolve, reject) => {
        queue.push({id, resolve, reject}); schedule();
      });
      pending.set(id, p);
      return p;
    }
    // Serialize retention transactions. Otherwise a slower old camera request
    // can finish after a newer one and incorrectly evict the skier's ground.
    let retentionTail = Promise.resolve();
    function retain(ids) {
      if (!Array.isArray(ids) || new Set(ids).size !== ids.length ||
          ids.some(id => !catalog.has(id)) || ids.length > capacity)
        return Promise.reject(Error('Invalid DEM retention set'));
      const requested = ids.slice();
      const transaction = async () => {
        const previous = protectedIds;
        protectedIds = new Set([...previous, ...requested]);
        try {
          await Promise.all(requested.map(load));
          protectedIds = new Set(requested);
          evict();
        } catch (error) {
          protectedIds = previous;
          evict();
          throw error;
        }
      };
      const current = retentionTail.then(transaction);
      retentionTail = current.catch(() => {});
      return current;
    }
    function status() {
      return Object.freeze({loaded:[...loaded.keys()],pending:[...pending.keys()],
        queued:queue.length,active,protected:[...protectedIds],capacity});
    }
    return Object.freeze({load, retain, status, catalogIds:() => [...catalog.keys()]});
  }
  return Object.freeze({create, sha256});
})();
if (typeof module !== 'undefined' && module.exports) module.exports = TerrainTileStream;
