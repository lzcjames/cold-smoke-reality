# Jandri official IGN MNT metadata coverage — live result

**Scope:** read-only 2026-11-19 official IGN WFS metadata check, not a
terrain download or a guarantee of an operable 3D resort.

- Source: IGN LiDAR HD WFS, `IGNF_LIDAR-HD_METADONNEE:metadata`.
- Original real OSM source: pinned 2026-07-24 Jandri snapshot,
  SHA-256 `40dcc37e95a259fb7d0f036e10e4147ce9c7343fb69b167c23ec92241da5ff26`.
- Geometry: all 37 versioned OSM downhill ways, rectangular EPSG:2154
  tile envelope padded by 250 m.
- Live query outcome: **24 required 1 km tile identifiers;
  24 of 24 have approved official MNT metadata download URLs**.
- GitHub Actions source run: https://github.com/lzcjames/cold-smoke-reality/actions/runs/44635187118
- Original official WFS GeoJSON plus machine-readable report archived as
  `p4-jandri-mnt-metadata-only`, artifact ID `14581704372`
  (30 day retention). The original WFS response was not committed.
- Jobs: `unit` and `live-official-index` passed. Log says
  `Jandri required official MNT tile metadata: 24 / 24` and
  `Metadata gate: COMPLETE (not terrain-certified)`.

**This is a metadata pass only.** Raster payloads, original per-tile hashes,
actual ground elevations, nodata, tile edge seams, vertical CRS, continuous
downhill gradients, collisions, piste signs and Chromium gameplay have
**not** been checked by this workflow. Do not import unverified elevation
into the published game. The footprint does not include missing route geometry
for Jandri 5 or potential Jandri 1 bis, and should not be described as full
operator resort coverage.

Next actionable gate: use these verified URLs to fetch the 24 actual official
MNT rasters into a **temporary CI workspace**, keep them out of static
hosting, validate exact projection/resolution/tile extents/nodata/seams,
preserve original SHA-256 manifests, and only then evaluate altitude profiles
for real OSM ways. Beware CI storage/memory/bandwidth limits: use bounded
downloads and run in batches with explicit completeness accounting.
