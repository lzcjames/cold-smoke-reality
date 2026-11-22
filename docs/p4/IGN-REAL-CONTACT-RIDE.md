# Real IGN terrain contact ride — isolated developer experiment

This phase adds the **first interactive contact experiment** on the
actual, SHA-verified Jandri 2 measured IGN MNT under
`/ign-lab/`, without changing the main skiing game.

Once the source has been independently verified, click **开始实测接触实验**.
Use **W** to launch/accelerate, **A / D** to steer, **S** to brake, and
**重置** to return to the verified starting location. The camera follows
an orange diagnostic skier/ski marker. The UI labels it as an experimental
contact proxy, not an approved, marked ski piste.

## What is actually measured

- The existing six authentic 15m source DEM chunks are validated by
  full source identity, grid reconstruction and SHA-256 before the lab
  is published or any new WebGL buffers are created.
- The existing `TerrainHeightSnapshot` copies all verified altitude
  cells into a deterministic local height snapshot with edge seam
  consistency checks.
- The optional contact proxy places two ski strips directly against
  that measured height. It keeps a 60Hz fixed timestep, constant
  positions on standing still, and movement driven by the actual local
  measured grade; browser rendering and network fetches do **not** occur
  inside its contact height query.
- If even one measured ski tip would leave valid data, the source-only
  contact controller stops. It will never extrapolate an imaginary
  ground slope beyond genuine DEM coverage.
- All controls and WebGL marker resources are only loaded on the
  developer lab page; main ski physics, official piste choice and
  default HTML are unchanged.

## Release gates and limitations

This is a **separate simplified numerical contact experiment**, **not**
the full existing `Skier` animation or game physics. Its speed model,
camera and two ski marker quads are intentionally minimal. It does not
certify ski trail boundaries, hazard/rock/forest polygons, direction,
grooming, signage, summit coverage, lift arrivals or continuous pistes
from the summit.

A dedicated Node regression covers static stability, constant-slope
movement, refusal of invalid/missing ground and fixed 60Hz stepping.
A headless Chromium test uses the actual published six IGN source chunks
to render the orange marker, hold 480 standing frames, and launch for
120 frames, requiring measured descent and no standing height drift.

The remaining necessary work for a complete playable Jandri descent
is to acquire the missing verified DEM sector coverage and real piste
envelopes, align the game's local coordinate frame and player motion,
then pass actual skier board, graphics, camera and performance tests.
Never silently treat this developer proxy as a public open piste.
