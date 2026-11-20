# Jandri 3S winter itinerary preview on the homepage

The title screen now contains a **read-only, collapsible winter Jandri
3S journey planner** alongside the resort selector and Jandri source
map. Users may switch between two destination **station sectors**:

- **JANDRI 2600**: 1650 → 2600, first section.
- **JANDRI 3200**: 1650 → 2600 (winter **gameplay** interchange step)
  → 3200, both sections.

These 1650/2600/3200 sectors are backed by the user-supplied piste map
and subsequent original operator/AEON documentation, pinned at
`docs/p4/JANDRI-MAP-STATION-TOPOLOGY.json`.

**Scope:** the preview is a real, accessible **UI interaction**, but
does not call the skiing engine, fetch the original GeoTIFFs, create
fake lift cabins or enable any teleport. Both future buttons
`正常乘坐` and `直达终点站` are HTML-disabled pending real
platform, winter passenger-policy, 2600 transfer corridor and
ski-access verification. No event handler sends players to an
unverified station. Switching the selector only updates the displayed
two-section itinerary.

OpenSkiData line/station positions and real IGN bare-earth heights
are archived separately; no official **platform** coordinates or
boarding permission are yet confirmed. This UI does not imply actual
2026/27 winter cabin-changing requirements.

The code lives in `template.html`, `src/99_main.js` and
`src/19_ui.js`. Regression test
`test/jandri-winter-planner-preview.test.cjs` checks that both
destination choices exist, boarding controls stay disabled, and
pointer/keyboard controls cannot inadvertently trigger the
tap-anywhere-to-ski shortcut. The entire planner is text and native
form controls, adding no new terrain/lift data files to the initial
asset payload.

Once real passenger boarding/alighting coordinates and the 2600
transfer path are verified, the next PR may connect the preview's
state to `tools/reality/jandri_winter_3s_flow.cjs` through a
browser-compatible adapter and an independently approved optional
lift transport pack.
