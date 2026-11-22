# Jandri 2 genuine IGN ground: original ski-contact numeric regression

Before allowing a streamed terrain tile to control real player positions,
the existing, unchanged `src/08j_solver.js` contact solver must be
exercised against actual authenticated IGN MNT source elevations.

The independent source-only Action reconstructs the verified 140×68
Jandri 2 elevation crop from its six SHA-checked 64-cell tiles. It
creates a read-only, **synchronous**, immutable height snapshot with
`TerrainHeightSnapshot`, then temporarily supplies a numerical
`Course.height` function **inside an isolated Node.js VM**. No live
game state, renderer or physics module is modified.

Four 360-frame stationary contact cases sample different positions,
including both sides of the real original-source 64-cell tile seam.
The final 120 contact frames must show under 2mm of settling
variation for every left/right ski contact field.

A fifth 360-frame case moves horizontally by 0.05m/frame across an
actual source tile edge, rejecting unexpected sudden per-frame
height/pitch jumps. The audit uses only genuine measured source
heights; requests outside the detailed DEM fail and are never replaced
by guessed mountain heights.

The output evidence is attached to the official 24-tile MNT workflow
as `jandri2-real-ski-contact-evidence.json`. All checks explicitly
remain `approvedForGameplay:false` and `readyForCollision:false`.

This tests the **numeric contact solver**, not GPU vertex animation,
actual piste direction, player camera movement, frame pacing, ski
posture, collision boundaries, or the full Jandri descent. A real
browser play test must still pass before enabling the real MNT as a
gameplay collision terrain.
