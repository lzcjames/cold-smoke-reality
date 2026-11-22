# General OSM → measured DEM corridor gate

This is the **second reusable input stage** after
`osm_survey_adapter.cjs`: it examines every imported real OSM way
against a verified, independently sourced near-ground raster and an
optional broader backdrop via `multires_terrain.cjs`.

`auditTerrainCorridors(survey, sampler, projection)` requires an explicit
source-verified EPSG:4326 → EPSG:2154 converter and exposes the count of
full-length source ways whose **centrelines** have continuous detailed
ground coverage. It samples each line interior and computes first/last
elevation, total ascent and total descent in *OSM node order* using ONLY
the detailed elevation model. The scenic backdrop never becomes a safe
skiable surface and never replaces a missing high-resolution height.

Use this pipeline on future resorts:

```js
const survey=normalizeOsmSurvey(pinnedOsmIndex,{resortId:'new-resort'});
const sampler=createMultiResSampler({detail:verifiedMnt,backdrop:verifiedBackdrop});
const report=auditTerrainCorridors(survey,sampler,{
  sourceCRS:'EPSG:4326',targetCRS:'EPSG:2154',sourceVerified:true,
  forward:verifiedLambert93Conversion
});
```

All input datasets, source checksums and CRS transformations require
independent provenance checks; a callback's `sourceVerified` flag is an
application contract, not independent cryptographic proof.

**Not yet playable:** verified centreline ground is not a surveyed
groomed piste width, operator direction, hazard boundary, avalanche
assessment, junction clearance or a lift disembarkation zone. Every
way remains `approvedForGameplay:false`, regardless of coverage.
The tool does not write the production `Reality` JSON format or
modify ski physics. Jandri 2 still needs its original high mountain
MNT pack generated, independently audited and browser-tested before
the full route can be enabled.
