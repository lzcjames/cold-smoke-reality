// Shared integration point for future measured resort route packs.
// Reuses the existing PisteNetwork physics and renderer. A provider is an
// independently audited, resort-specific source-data importer; its geometry
// is never fabricated from a map illustration or from route-name matching.
const ResortRoutes = (() => {
  function prepare(asset, terrain, providers = []) {
    if (!asset || !terrain || terrain.id !== asset.id ||
        !Array.isArray(providers)) throw Error('Invalid resort route import');
    let current = asset;
    for (const provider of providers) {
      if (!provider || typeof provider.extend !== 'function')
        throw Error('Invalid measured route provider');
      const next = provider.extend(current, terrain);
      if (!next || next.id !== asset.id || next.version !== asset.version)
        throw Error('Route provider changed resort identity');
      // A provider may append measured lines but must never replace existing
      // registered geometry or build a different primary descent.
      const before = current.pistes || [], after = next.pistes || [];
      if (after.length < before.length ||
          before.some((p,i) => after[i] !== p) ||
          next.piste !== asset.piste || next.grid !== asset.grid)
        throw Error('Route provider rewrote the verified base resort');
      const seen = new Set();
      for (const p of after) {
        if (!Number.isSafeInteger(p.osmWay) || p.osmWay <= 0 ||
            seen.has(p.osmWay) || !Array.isArray(p.nodes) ||
            p.nodes.length < 2 || !Array.isArray(p.points) ||
            p.nodes.length !== p.points.length)
          throw Error('Invalid or duplicate imported piste');
        seen.add(p.osmWay);
      }
      current = next;
    }
    return current;
  }
  // The legacy, strictly provenance-pinned Jandri clip is the first adapter.
  // Future ski resorts can register additional audited providers here without
  // creating separate rendering, physics, or snow-contact implementations.
  function current(asset, terrain) {
    return prepare(asset, terrain, [JandriLower]);
  }
  return Object.freeze({prepare,current});
})();
