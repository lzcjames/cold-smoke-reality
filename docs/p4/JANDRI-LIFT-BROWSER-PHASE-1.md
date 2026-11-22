# Jandri 3S browser lift network — phase 1

## Design reference inspected

The user provided **禾木滑雪模拟器 1.4.0.zip**. Its `world.js`
contains separate `lifts` and `stations` arrays with stable lift
identifiers, source-linked lower/upper terminal associations and route
guides that can include both a lift and a downhill piste. Its bundled
`app.js` is compiled/minified. We use the **structural idea**, not the
third party's JavaScript, mountain coordinates, terrain or assets. Source
license/reuse rights have not been established.

## What was implemented

`src/02f_jandri_lift_network.js` is a small, deterministic,
read-only **Jandri 3S winter route catalogue**, bound to:

- `docs/p4/JANDRI-MAP-STATION-TOPOLOGY.json` for the operator-confirmed
  **station sectors** 1650, 2600 and 3200 and the two legs.
- `docs/p4/JANDRI-LIFT-STATION-CROSSWALK.md` for independently audited
  lift OSM way IDs: `way/1229057878` and `way/1361005452`.
- The existing `JandriWinterSchedule` informational module for the
  published 2026/27 dates; schedules do **not** authorize boarding.

`plan('jandri-2600')` returns the lower section and
`plan('jandri-3200')` returns both sections, including an explicit
**unverified** intermediate passenger-transfer policy. The pre-existing
winter planner on the title page now displays the selected source-linked
leg names and station sectors.

No new terrain pack, cabin model, animation, texture, mesh, dynamic
terrain work or skier-physics change is introduced.

## Release gates that remain closed

The reference Hemu simulator's stations are not located in Les Deux
Alpes, and schematic station labels are not GNSS/platform positions.
The source audits do **not** confirm exact Jandri embark/disembark
positions, terrain-ground and collision clearance, operator-accepted
passenger transfer at 2600 or safe exit to a measured ski corridor.
For those reasons the browser catalogue returns no world coordinates,
no speeds or travel durations, and explicitly disables both normal
boarding and the requested express-to-terminal journey.

The existing future backend state machine
`tools/reality/jandri_winter_3s_flow.cjs` retains separate physical
authorization gates; this catalogue cannot override them.

## Next phases

1. Obtain and validate official platform locations / station approach
   and exit geometry, winter passenger transfer rules, and IGN
   LiDAR coverage at the actual safe exit points.
2. Only after independent station and piste-access approval, build a
   separately loaded lift visual layer and a player-controlled boarding
   interface. Keep this separate from `Game.step` and the restored
   ski-contact physics.
3. Test both ride modes at the **identical certified exit** in Chromium
   and compare frame-time / memory results before enabling for players.
