# Jandri 3S visual preview / future geometry staging

This phase provides an SVG **station-topology illustration** in the
existing title-screen winter planner. It is **not a georeferenced lift route**.
The moving cabin symbol follows an illustrative 2D line; it is not a
measured cabin speed, timetable, ride duration or station location.

The SVG is built from the approved *sector sequence* and OSM identifiers
in `src/02f_jandri_lift_network.js`. The existing read-only planner keeps
both boarding and express-to-terminal buttons disabled. The SVG creates no
GPU pipelines or textures, does not run in `Game.step`, and does not change
terrain, player movement, camera, or ski contact.

`src/02h_jandri_lift_geometry.js` is an isolated **input contract**
for a later, source-audited 3D station/tower layer. It only accepts three
station anchor coordinates and each leg's independently measured tower
positions with explicit source and ground-clearance status. Its output
is a frozen line of supplied points, not a simulated catenary or real
cabin path. There is **no** shipped georeferenced pack matching the
contract, so this phase does not render any ski-world lift geometry.

### Evidence required before 3D display or boarding

- Surveyed coordinates for the **actual** lower, intermediate, and upper
  platforms in the game's consistent world reference system.
- Independently measured tower locations, line geometry and cable-ground
  clearance, with provenance and alignment audited at build time.
- A verified ski-safe disembark corridor and station approach envelope.
- 2026/27 operator passenger policy for intermediate transfer at 2600.
- A separate enable gate for normal and express travel, using exactly the
  same approved exit location for both modes.
- Chromium WebGL2 and WebGPU performance tests on the complete geometry;
  ski physics/camera remain on their existing stable baseline.

The `status` and SHA fields of the optional geometry contract are
**not** proof of provenance by themselves. A future signed or pinned
source importer must validate source material before delivering any pack.
Synthetic coordinates are used only in unit tests. We do not copy the
user-supplied Hemu simulator's code or mountain data into this project.
