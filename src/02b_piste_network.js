// Surveyed junctions and a local lookup over the shared Reality terrain.
const PisteNetwork = (() => {
  const cellSize = 96, searchRadius = 70;
  const key = (x, z) => x + ':' + z;
  const cell = x => Math.floor(x / cellSize);
  const unit = (x, z) => {
    const d = Math.hypot(x, z);
    return [x / d, z / d];
  };

  function create(terrain, data) {
    const lines = new Map(), cells = new Map();
    if (!Array.isArray(data.pistes) || !Array.isArray(data.junctions)) throw Error('Missing piste network.');
    for (const piste of data.pistes) {
      const { osmWay, name, nodes, points } = piste;
      if (lines.has(osmWay) || !Number.isSafeInteger(osmWay) || typeof name !== 'string' || !name ||
          !Array.isArray(points) || !Array.isArray(nodes) || points.length < 2 || points.length !== nodes.length ||
          new Set(nodes).size !== nodes.length) throw Error('Invalid piste network way.');
      const world = points.map(point => {
        if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) throw Error('Invalid piste point.');
        const p = terrain.project(...point);
        if (!terrain.withinDEM(...p)) throw Error('Piste outside the DEM.');
        return p;
      });
      const lengths = [0];
      for (let i = 1; i < world.length; i++) {
        const [a, b] = [world[i - 1], world[i]];
        const dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz);
        if (!(d > 0)) throw Error('Duplicate piste point.');
        const segment = { a, dx, dz, d2: d * d, yaw: Math.atan2(dx, -dz), piste };
        lengths.push(lengths[i - 1] + d);
        for (let x = cell(Math.min(a[0], b[0]) - searchRadius); x <= cell(Math.max(a[0], b[0]) + searchRadius); x++) {
          for (let z = cell(Math.min(a[1], b[1]) - searchRadius); z <= cell(Math.max(a[1], b[1]) + searchRadius); z++) {
            const id = key(x, z);
            if (!cells.has(id)) cells.set(id, []);
            cells.get(id).push(segment);
          }
        }
      }
      lines.set(osmWay, { ...piste, world, lengths });
    }
    const main = lines.get(terrain.osmWay);
    if (!main || main.points.length !== data.piste.points.length ||
        main.points.some((p, i) => p[0] !== data.piste.points[i][0] || p[1] !== data.piste.points[i][1])) {
      throw Error('Piste network does not match the primary route.');
    }

    function at(line, distance) {
      const { lengths, world } = line;
      const s = Math.max(0, Math.min(distance, lengths.at(-1)));
      let i = 1;
      while (i < lengths.length - 1 && lengths[i] < s) i++;
      const a = world[i - 1], b = world[i], t = (s - lengths[i - 1]) / (lengths[i] - lengths[i - 1]);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }

    const seen = new Set(), signs = [];
    let spawn;
    for (const junction of data.junctions) {
      const { osmNode, point, incoming, outgoing } = junction;
      if (seen.has(osmNode) || !Array.isArray(point) || point.length !== 2 ||
          !point.every(Number.isFinite) || !Array.isArray(incoming) || !incoming.length ||
          !Array.isArray(outgoing) || !outgoing.length || new Set(incoming).size !== incoming.length ||
          new Set(outgoing).size !== outgoing.length) throw Error('Invalid piste junction.');
      seen.add(osmNode);
      function branch(id, direction) {
        const line = lines.get(id), i = line?.nodes.indexOf(osmNode);
        if (!(i >= 0) || line.points[i][0] !== point[0] || line.points[i][1] !== point[1] ||
            !line.points[i + direction]) throw Error('Junction does not share a surveyed node.');
        return { line, s: line.lengths[i] };
      }
      const pos = terrain.project(...point);
      const exits = outgoing.map(id => branch(id, 1));
      for (const id of incoming) {
        if (outgoing.length === 1 && outgoing[0] === id) continue; // the same piste continues with no choice
        const approach = branch(id, -1);
        const before = at(approach.line, approach.s - 22);
        const f = unit(pos[0] - before[0], pos[1] - before[1]);
        if (!spawn && outgoing.includes(main.osmWay)) spawn = at(approach.line, approach.s - 65);
        const right = [-f[1], f[0]];
        const options = exits.map(exit => {
          const [x, z] = at(exit.line, exit.s + 24);
          const tx = x - pos[0], tz = z - pos[1];
          return { exit, angle: Math.atan2(tx * right[0] + tz * right[1], tx * f[0] + tz * f[1]) };
        }).sort((a, b) => a.angle - b.angle);
        const isMainExit = id === main.osmWay && outgoing.length === 1 &&
          outgoing[0] !== main.osmWay;
        // When the selected primary route ends at a join, one board can be
        // missed at speed. Provide both an early warning and approach sign.
        // This also applies to verified joins at future measured resorts.
        // Les Deux Alpes has near-right-angle forks. At a typical skiing
        // speed, a sole panel 22 m before the turn is too late to choose
        // safely. Add an upstream preview, but preserve all established P1
        // Alpe d'Huez sign locations and avoid clamping previews to s=0.
        // This is navigation guidance based on true directed OSM geometry,
        // not a claim that physical resort signs stand at these locations.
        const sharpFork = terrain.id === 'les-deux-alpes' && outgoing.length > 1 &&
          options.some(choice => Math.abs(choice.angle) > Math.PI / 3) && approach.s >= 82;
        const distances = isMainExit ? [105, 32] : sharpFork ? [68, 24] : [22];
        for (const distance of distances) {
          const before = at(approach.line, approach.s - distance);
          const prev = at(approach.line, approach.s - distance - 8);
          const next = at(approach.line, approach.s - distance + 8);
          const local = unit(next[0] - prev[0], next[1] - prev[1]);
          const boardRight = [-local[1], local[0]];
          for (const [i, { exit, angle }] of options.entries()) {
            const side = options.length > 1 ? (i === 0 ? -1 : 1) : 1;
            // Keep signs visible near the piste edge, without blocking the centre.
            const offset = terrain.halfWidth * 0.76 * side;
            const x = before[0] + boardRight[0] * offset;
            const z = before[1] + boardRight[1] * offset;
            if (!terrain.withinDEM(x, z)) throw Error('Junction sign outside the DEM.');
            signs.push({ x, y: terrain.height(x, z), z, right: boardRight,
              name: exit.line.name, difficulty: exit.line.difficulty,
              arrow: angle < -0.26 ? '←' : angle > 0.26 ? '→' : '↑',
              osmNode, from: id, to: exit.line.osmWay,
              advance: (isMainExit || sharpFork) && distance > 50 });
          }
        }
      }
    }
    // Some connected real networks begin on the primary way and only branch
    // farther downhill; they have no incoming secondary route at the start.
    // Spawn safely along its surveyed line rather than inventing an inbound edge.
    if (!spawn) spawn = at(main, Math.min(65, main.lengths.at(-1) * 0.2));

    const stakes = [];
    for (const line of lines.values()) {
      if (line === main) continue;
      const length = line.lengths.at(-1);
      for (let s = 25; s < length - 10; s += 52) {
        const [x, z] = at(line, s);
        if (signs.some(sign => Math.hypot(sign.x - x, sign.z - z) < 23)) continue;
        // An OSM centreline is a polyline, not a surveyed piste boundary.
        // Sample a longer symmetric chord when orienting visual edge stakes:
        // the old 6 m chord snapped noticeably at sharp OSM vertices.
        // Keep the ±12 m *estimated* lateral offset and the measured OSM
        // centreline/DEM untouched. No new raster or per-frame allocations.
        const a = at(line, Math.max(0, s - 12));
        const b = at(line, Math.min(length, s + 12));
        const right = unit(a[1] - b[1], b[0] - a[0]);
        for (const side of [-1, 1]) {
          const px = x + side * right[0] * 12, pz = z + side * right[1] * 12;
          if (terrain.withinDEM(px, pz)) stakes.push({ x: px, y: terrain.height(px, pz), z: pz, right, difficulty: line.difficulty });
        }
      }
    }

    function lookup(x, z, output) {
      let best = searchRadius * searchRadius, found;
      const segments = cells.get(key(cell(x), cell(z)));
      if (segments) for (const segment of segments) {
        const { a, dx, dz, d2 } = segment;
        const px = x - a[0], pz = z - a[1];
        const t = Math.min(1, Math.max(0, (px * dx + pz * dz) / d2));
        const distance2 = (px - t * dx) ** 2 + (pz - t * dz) ** 2;
        if (distance2 < best) { best = distance2; found = segment; }
      }
      if (!found) return false;
      output.distance = Math.sqrt(best);
      output.yaw = found.yaw;
      output.piste = found.piste;
      return true;
    }
    // P4 only: a tiny 15 m distance field from the *actual* three OSM
    // centrelines. This is a visual/guidance mask, NOT surveyed piste edge
    // polygons and not a legally authoritative off-piste safety boundary.
    // Precompute once at resort load, so clipmap shading and vegetation
    // queries do not walk OSM line segments every frame. The existing exact
    // lookup remains the authority for route navigation and ski restart.
    let distanceAt = null;
    if (terrain.id === 'les-deux-alpes' && data.grid) {
      const { cols, rows, step, east, north } = data.grid;
      const origin = terrain.project(east, north);
      const e = terrain.project(east + step, north);
      const n = terrain.project(east, north - step);
      const ux = e[0] - origin[0], uz = e[1] - origin[1];
      const vx = n[0] - origin[0], vz = n[1] - origin[1];
      const det = ux * vz - uz * vx;
      if (Math.abs(det) < 1e-7) throw Error('Degenerate real piste distance grid');
      const cells = new Uint8Array(cols * rows);
      const nearest = {};
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x = origin[0] + i * ux + j * vx;
        const z = origin[1] + i * uz + j * vz;
        cells[j * cols + i] = lookup(x, z, nearest) ?
          Math.min(70, Math.round(nearest.distance)) : 70;
      }
      distanceAt = (x, z) => {
        const dx = x - origin[0], dz = z - origin[1];
        const u = (dx * vz - dz * vx) / det;
        const v = (dz * ux - dx * uz) / det;
        if (u < 0 || v < 0 || u > cols - 1 || v > rows - 1) return 70;
        const i = Math.min(cols - 2, Math.floor(u)), j = Math.min(rows - 2, Math.floor(v));
        const tx = u - i, tz = v - j, k = j * cols + i;
        return (cells[k] * (1 - tx) + cells[k + 1] * tx) * (1 - tz) +
          (cells[k + cols] * (1 - tx) + cells[k + cols + 1] * tx) * tz;
      };
    }
    return { signs, stakes, spawn, lookup, junctions: data.junctions, distanceAt };
  }
  return { create };
})();
