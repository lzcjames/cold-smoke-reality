# Jandri 3S winter itinerary preview on the homepage

The title screen contains a **read-only, collapsible winter Jandri 3S journey planner**. It now stays visible **even when no optional measured 3D resort pack is installed**; its validated source-backed route facts must not be hidden behind the playable terrain gate. Users may switch between two destination **station sectors**:

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
unverified station. Switching the destination or schedule date only updates the displayed two-section itinerary and published operating times.

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

## 2026/27 source-backed winter timetable

Les 2 Alpes tourist office / Alpes Isère [Jandri first section](https://www.alpes-isere.com/sit/jandri-troncon-1-acces-2600m-5671467/) was updated **2026-10-01**, and expressly lists **distinct first- and second-section hours** for five ranges from **2026-11-28 to 2027-05-02**. The tiny offline `src/02c_jandri_winter_schedule.js` holds those dated public hours and their source URL, allowing user-selected dates without any live API request or resort geometry downloads. `test/jandri-winter-schedule.test.cjs` checks every source boundary and negative date case. The rendered UI discloses that these are **published planned times, not real-time operation**, so weather closures, wind shutdowns and queue/access rules may differ. On dates outside the published range, it says there is no verified published schedule, **not** that the lift is closed.

The [2025 technical survey in Quota Neve](https://www.quotaneve.it/en/3s-jandri-in-les-2-alpes/) reports winter separate section operation with alighting/requeueing at 2600, and [April 2025 SATA staff visit notes](https://passion2alpes.com/medias/les-coulisses-du-jandri-3s) independently describe winter separate and summer through-running. This substantiates the winter game design, but is **not official dated confirmation of every 2026/27 passenger platform or passage**. Do not unlock boarding until current floor/exit geometry, protected transfer and piste corridor are independently verified.
