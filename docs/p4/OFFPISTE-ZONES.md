# P4 phase 2 — piste vs off-piste terrain (experimental)

Les Deux Alpes has **three sourced OSM downhill centreline segments** and a real IGN LiDAR HD MNT source. They are *not surveyed run polygons* or a real hazard map.

## Implemented
- At resort load, sample the distance to all three original OSM polylines on the **existing 15 m DEM grid**. Cache one byte per cell (about 15.6 KB). Do not fetch another pack or run a route search per rendered pixel.
- The terrain shader's existing groomed-to-natural shading transition now follows **all three** real OSM piste centrelines. Previously it followed the main route's transverse corridor even on branches.
- The **18 m half-width** is still an *estimated gameplay presentation width*, not a measured piste edge. The shading blends from 20 to 62 m from a centreline; no official off-piste access is implied.
- Introduce **sparse, explicitly generated scenery trees** on gentler shoulders below ~2,200 m, away from all three centreline corridors. Their exact locations are **not** derived from a field-verified tree survey. The existing tree collision and visual model handle them; do not place them within 29 m of any centreline.
- Preserve existing route limits: beyond approximately 50 m outside the network's estimated piste edge, the current skiing simulation resets. Do not mistake this game boundary for a legal ski-area perimeter.
- The real measured heights, collision-height sampling, OSM nodes, connectivity and Alpe d'Huez visual code path are unchanged.

## Not yet implemented / do not claim
- Official piste polygons or genuine trail widths (36 m is an estimate).
- Geolocated real-world rocks, tree species, lift/road alignments, crevasses, cliffs or closed areas.
- A real avalanche, survival or off-piste-safety model.
- Physically accurate rock collisions or terrain-edge crash semantics.
- Full lossless 0.5 m LiDAR rendering. Display continues to use a 15 m grid.

Future steps: obtain authoritative vegetation, lithology/rock, piste perimeter and hazard geodata; validate grade thresholds using high-resolution MNT and safe test routes before enabling terrain-gated crashing. The current zone shading is a **visual gameplay approximation**, never route safety advice.

## Performance / regression
`node --test test/reality.test.cjs` asserts exact measured centrelines remain covered by their piste mask, finite off-piste transition and unchanged P1 behavior. PR CI renders both real resorts with Chromium WebGL2 and WebGPU. The cache is constructed once per P4 resort load and the renderer samples it in constant time.
