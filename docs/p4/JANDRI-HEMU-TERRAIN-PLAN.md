# Jandri full-piste terrain: Hemu reference and safe staging plan

## Why current Jandri appears halfway down the mountain

The shipped Les Deux Alpes game pack is the small existing **IGN LiDAR
HD** crop containing the three previously released runs. The only
additional Jandri playable portions are two explicitly **clipped lower
subsequences** of archived original OSM ways `219275197` (Jandri 1)
and `644393970` (Jandri 2), projected to the measured crop. Their
coverage is limited by the current crop's DEM, whose maximum sampled
altitude is **below 2600 m**. Starting on those snippets can look as
though a whole piste begins midway up a mountain. It does not.

All 37 pinned OSM Jandri way fragments currently carry original
`piste:difficulty=easy` tags (blue in the local colour model). That
is **OSM source classification**, not an official certification of
groomed grade or an instruction to flatten the true mountain.
This change labels only the two existing lower subsequences blue.
Their original measured centreline, raw LiDAR heights and gameplay
physics remain unchanged.

## What the user-provided Hemu 1.4.0 sources actually do

Direct inspection of the supplied ZIP's `world.js` and bundled
`app.js` shows a common world coordinate origin, an
`elevationOrigin`, full piste `points`, and separate DEM layers:
`detail` is a 720 × 720 GLO-30-derived grid across a 7.2 km square;
`backdrop` is a 640 × 640 grid across a 40 km square. Its minified
engine initializes both height grids and constructs tracks from each
piste's supplied polyline, measuring track length and net elevation
using its height sampler. These are the useful **design patterns**;
we do not copy code, heights, piste geometry, or its invented
smoothing assumptions. There are no data in the Hemu ZIP for
French Jandri locations.

The new standalone `tools/reality/multires_terrain.cjs` borrows only
that architecture: one verified local detail raster plus a verified
broader overview raster, both in the same CRS and vertical datum.
It bilinearly samples each raster, blends the fine raster near its
boundary to avoid a height seam, returns null outside coverage, and
refuses to infer playable terrain from distant overview data.
It is **not called from `Game.step` or the shipping terrain renderer**.

## Work required for real full-length Jandri

1. Reuse the previously inspected **24 genuine IGN LiDAR HD MNT
   source tiles** (see `JANDRI-FULL-MNT-MOSAIC-AUDIT.md`); preserve their
   official source checksums, Lambert-93 position, original 0.5 m
   resolution, nodata masks, vertical reference and tile seams.
   Existing CI evidence proves a complete *source-only* mosaic,
   not a releasable ski terrain pack.
2. Generate a bounded-resolution **new Jandri detail DEM pack**
   from authorized ground rasters and a separate low-resolution
   **distant backdrop** with fixed coordinate transforms and
   reproducible downsampling. These are terrain resources, not
   preapproved groomed polygons. Load lazily only upon Jandri
   resort selection to protect default web performance.
3. Project full 37-way OSM geometry into the same game coordinates.
   Validate every route segment, not just endpoints, against detailed
   source coverage. Audit directed descents using genuine heights.
   Reject unmeasured or impossible uphill transitions and unverified
   crossings. Additional operator routes (e.g. Jandri 5) require
   separate fresh, source-pinned acquisition.
4. Verify actual groomed piste **widths, turn direction, hazards,
   cliffs, trees, rocks, and safe station exits**. Blue routes may
   still contain steeper natural ground; never flatten a large slope
   solely from the colour tag. Keep off-piste physically distinct.
5. Test full Jandri network in Chromium WebGL2/WebGPU; include
   fresh-start collision/ski stability, frame timing, DEM pack size,
   absence of invented connections and regression of the already
   stable two-resort ski physics.

## Explicit shipping boundary

This branch **does not** add an unverified upper Jandri start,
guess a 3200 m descent, stretch the existing low DEM, publish a
reconstructed mountain, or enable the unapproved lift drop-off.
It corrects the sourced blue metadata now and provides a
well-tested future multi-resolution terrain preparation primitive.
