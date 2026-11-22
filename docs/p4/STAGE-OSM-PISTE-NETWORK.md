# OSM to shared piste network: evidence-only staging

After `normalizeOsmSurvey` and `auditTerrainCorridors`, call
`stageSurveyRoutes` with explicitly selected source way IDs and a reviewed
orientation (`as_osm` or `reverse_osm`). The stage outputs independently
identifiable route centreline geometry in the same
`{osmWay,name,difficulty,nodes,points}` shape used by Cold Smoke's
existing `PisteNetwork`.

It does **not** join same-name ways, assume original OSM order is downhill,
or turn surveyed ground centreline into a safe/groomed route.
Reversed orientation must be compatible with measured endpoint heights.
All candidates are `stagingOnly:true` and
`approvedForGameplay:false`. The enclosing result is
`networkReady:false`; it is intentionally unsuitable for direct game
installation until an independent promotion gate validates boundaries,
hazards, actual skier transitions and browser collisions.

This is the third shared, data-driven step:
1. `osm_survey_adapter.cjs` preserves authentic source geometry.
2. `audit_resort_dem_corridors.cjs` checks measured detailed ground.
3. `stage_osm_piste_network.cjs` prepares *unapproved* shared network data.

It is not the high-altitude Jandri DEM pack and does not enable Jandri 2
top-to-bottom skiing or cabling rides.
