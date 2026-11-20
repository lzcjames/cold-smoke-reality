# P4: full genuine Jandri IGN LiDAR HD MNT mosaic and OSM elevation profiles

**2026-11-20 — Source-data validation completed, NOT a published ski resort.**

GitHub Actions [real source-only audit run 44724943428](https://github.com/lzcjames/cold-smoke-reality/actions/runs/44724943428) succeeded. The job independently downloaded the **24 official IGN LiDAR HD MNT** 0.5 m GeoTIFF tiles indicated by the pinned original WFS response ([metadata audit](JANDRI-MNT-LIVE-COVERAGE.md)) into a temporary CI directory, after confirming the pinned 37-way authentic OSM snapshot. Original rasters were individually checked for their source URL, exact Lambert-93 location/resolution, finite ground heights and no-data values.

The workflow then built a **temporary VRT source mosaic**, checked **37 complete cardinal boundaries** between neighbouring tiles, and measured **37 OSM way elevation profiles** by sampling genuine 3D heights along each original centreline at segment subdivision distances no greater than 30 m. Every line's summary includes measured length, start/end elevation in **OSM vertex order**, net height change, total measured ascent and descent, peak absolute sampled grade and sample count.

Verified job log: `Real ground mosaic verified: 24 tiles, 37 complete borders, 37 measured OSM profiles`.

The full machine-readable report is archived as `p4-jandri-full-measured-mnt-gate`, artifact ID `14623293285` (limited retention). The report records source per-tile SHA-256 provenance, measured edge differences, and all per-way numbers. **Neither the original 24 GeoTIFFs nor the mosaic nor an unreviewed playable asset entered the game repository or GitHub Pages.**

## Still blocked before skiable 3D release

- Check each OSM route's real measured elevation profile, confirmed *downhill direction*, and piste classification; OSM vertex order is not a downhill guarantee.
- Check all candidate junction nodes against the measured terrain and safe intended travel direction; an exact shared OSM node alone does not guarantee a skiable intersection.
- Determine genuine groomed piste widths and boundaries, hazards, trees, cliffs, rocks, no-go terrain, and safe collision constraints; a DEM provides elevations **not** safe skiable area.
- Acquire independently verified Jandri 5 and any missing official routes; they are absent from the pinned 37-way snapshot.
- Create a small, separate, licensed runtime pack only after route- and terrain-safety gates, and test browser performance and actual gameplay.

This workflow establishes genuine terrain source and measured route elevations only. It does **not** approve a resort-wide synthetic surface, ski physics, route signage, or a playable ski area.
