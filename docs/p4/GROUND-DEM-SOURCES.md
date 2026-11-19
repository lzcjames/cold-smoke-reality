# P4 — Acquire measured ground elevations for Les Deux Alpes

**Gate: source discovery, not a released ski area.** The Copernicus GLO-30 data used in the earlier probe are a **digital surface model**. A failed downhill direction at OSM node 6057592113 is not reliable proof of on-the-ground unskiability; it is a **release blocker for the present game asset**.

## Candidate licensed sources, in priority order

1. [IGN MNT LiDAR HD](https://www.data.gouv.fr/datasets/mnt-lidar-hd): an actual ground-elevation model sampled at **0.5 m**. The official metadata lists **Licence Ouverte / Open Licence v2.0**. Source tiles are downloadable as GeoTIFF; use the [official tile-selection interface](https://cartes.gouv.fr/telechargement/IGNF_MNT-LIDAR-HD). **Do not assume the specific Les Deux Alpes tiles are already published** without checking individual tile coverage and nodata.
2. [IGN RGE ALTI](https://www.data.gouv.fr/datasets/rge-alti-r): the official **1 m / 5 m** ground elevation model, also Licence Ouverte 2.0. IGN metadata says routine updates to this historical product stopped in 2024 while new LiDAR HD coverage was developed. Record edition and acquisition method per downloaded tile; publication date and measurement date are different.
3. [CRAIG / CD38 / DDT38 Isère 2021–2022 0.5 m terrain model](https://www.data.gouv.fr/datasets/modele-numerique-de-terrain-mnt-grille-au-pas-de-50-cm-isere-2021-2022): 500 m × 500 m GeoTIFF tiles in EPSG:2154, produced from LiDAR ground points and covering the department in aggregate. **The data.gouv.fr metadata displays “License Not Specified”**, so verify distribution rights with the actual source before incorporating or redistributing. Department coverage does not establish that each desired tile is obtainable.

## Exact candidate needing source coverage

The archived [real OSM source and Copernicus probe](https://github.com/lzcjames/cold-smoke-reality/actions/runs/44531317057) refer to the snapshot `2026-07-24T11:04:51Z`. Candidate pistes: **Diable 1** (OSM 219409078), **Petites Crêtes** (643745486), **Vallons du Diable** (643786947), with exact shared OSM nodes 6057592057 and 6057592113.

The **initial screening crop**, not yet a final verified source extent, is WGS84 **west 6.115, south 44.982, east 6.165, north 45.020**. Recalculate from every retained OSM node, then add a 20 m DEM guard margin plus appropriate raster resampling buffer. Do not claim source coverage until all individual tiles and nodata cells have been inspected.

## Gate before importing or publishing

- Keep original source tile URLs, tile IDs, download time, acquisition/edition metadata, copyright/license, original EPSG and vertical datum, and SHA-256 checksums. Never call a 0.5 m source raster the 15 m web game grid: the build downsamples the source for performance.
- Mosaic only the tiles needed for actual surveyed paths, then crop; run `gdalinfo` and inspect bounds and missing cells **before** `tools/reality/p4_import.py`. Do not send raw giant source rasters in the game's HTML or the public resort JSON.
- For both exact shared OSM nodes, independently recalculate 12–25 m direction/slope metrics on this **ground** DEM, and compare with the archived DSM probe. The current network acceptance threshold stays unchanged. If the same three-way candidate still fails, inspect another authentic set of connected ways instead of introducing synthetic joins.
- Run strict import, build, browser regressions and visual inspections on WebGL2 and WebGPU with source attribution. Keep `data/reality/les-deux-alpes.json` absent from published assets until those gates pass.

**Current status:** Official candidate datasets have been identified, but no specific finer-resolution tile, actual file checksum, source coverage or successful three-way ground DEM import has yet been established by this investigation. Do not mark Les Deux Alpes playable.
