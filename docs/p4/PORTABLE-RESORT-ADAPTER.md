# Portable ski-resort adapter — architecture borrowed from Hemu 1.4.0

## Inspected reference (2026-11-22)
The user-provided Hemu 1.4.0 ZIP contains `world.js`, an application bundle,
and two compressed height-grid scripts. Its world descriptor contains a local
metre coordinate system, elevation origin, separate `detail` and `backdrop`
height grids, `pistes[]`, `lifts[]` and `stations[]`. In the supplied
archive there are 87 piste records, 10 lift records and 13 station records.
Its compact lift implementation derives track positions and carrier phase
from line length and clock time; boarding and unloading are state changes,
not a rope-force solver.

These are **architectural observations**, not a copy of Hemu source code,
French geometry, licensed elevation assets, or physics.

## Implemented

`tools/reality/portable_resort_adapter.cjs` provides:
- `normalize(world,{resortId})`: convert Hemu-*shaped* metadata to an
  independent, portable, explicitly **non-playable** description of pistes,
  lifts, stations and two terrain grid tiers. It copies route points, keeps
  source identities, validates lift/station references and refuses duplicate
  coordinate samples.
- `toVerifiedPisteNetwork(manifest, approvals)`: strictly gated converter
  to the existing Cold Smoke `PisteNetwork` interface. The caller must supply
  a genuine coordinate conversion to Lambert-93, independent DEM corridor
  coverage and matching original OSM way/node IDs. It checks at 5-m spacing.
  Junctions are NOT inferred from intersections or shared names.

For example, import a *licensed* resort-specific JSON world descriptor:
```js
const {normalize}=require('./tools/reality/portable_resort_adapter.cjs');
const manifest=normalize(worldJson,{resortId:'new-resort'});
// This manifest describes routes and lifts, but does not authorize skiing.
```

No supplied Hemu coordinates should be attached to Les Deux Alpes: those
coordinates represent a different mountain. A normalizer is not a terrain
raster decoder, DEM producer, piste-boundary survey, lift-terminal survey or
boarding permission. Source DEM arrays still require independently licensed,
verified data preparation and the existing Reality asset format for shipping.

## Proposed live integration (separate audited PR)

1. Prepare the new resort's genuine local DEM grids and explicit CRS
   transform. Keep near/far grids as separate lazy-loaded resources.
2. Convert routes through this importer with real source IDs and measured
   coverage; verify downhill direction, widths and crossings independently.
3. Pass the approved route descriptors to the existing shared piste renderer,
   not to a bespoke per-route rendering class.
4. Reuse the geometry descriptions for a lightweight lift renderer and add
   game boarding only after both station locations and safe exits are proved.
5. Run browser WebGL2/WebGPU and ski-contact regression on the existing
   mountains before enabling the new resort.

The existing skiing, scenery, homepage, and resort data are intentionally
unchanged in this PR. No speedup or complete Jandri 2 is claimed.
