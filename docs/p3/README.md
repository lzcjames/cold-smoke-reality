# P3 · Test-only scaling to 10 / 50 / 100 pistes

**Status:** independent PR #11; no synthetic piste is published. This phase tests
whether the existing Reality Mode can host more real *measured* pistes in
future. It does **not** add any new real connection or new resort. The three
real Alpe d'Huez pistes, surveyed OSM topology and IGN DEM remain unchanged.

## Main architectural bottleneck

Previously `JunctionSigns.init()` placed `N` junction panels into one
`(N × 256) × 80` **RGBA8** atlas. At roughly 16–64 signs (depending on a
particular GPU's texture dimension limit), the atlas could exceed
`maxTextureDimension2D`, even though drawing a single sign is cheap.

The P3 renderer uses:

- A **2D, bounded packing** of identical **256 × 80 pixel** label tiles, with
  width/height each limited by `min(4096, gfx.caps.maxTex)`. The GPU rejects
  configurations larger than its limit rather than silently rendering broken
  signs. Tile UVs cover the correct row and column.
- An **R8 glyph mask** instead of duplicating four-channel plate background
  colours for every pixel. The original red/black/piste tint is reconstructed
  with per-vertex colour and the same glyph/border coverage at the **same
  resolution**. Front-facing arrows and solid-colour backs are preserved.
- **One texture, one vertex buffer, one pipeline**, with the existing
  longitudinal-band visible-range batching and the original DEM sampler.

Both WebGL2 and WebGPU already support `r8`; the shader and geometry changes
are shared. Cross-backend browser checks and visual captures must pass before
this optimization is accepted.

## Reproducible tests

```sh
npm run check
npm test
/usr/bin/python3 -B test/reality-import.py
npm run test:browser -- --release --p3 --screenshots
node docs/p3/benchmark.cjs p3-scale-metrics.json
```

The P3 synthetic generator `test/p3-synthetic-network.cjs` derives branches
from main-route surveyed nodes but marks all new ways and signs as
**SYNTHETIC / NOT OSM**. Their sole purpose is algorithmic pressure: they are
not validated real snow trails, and no altered asset is copied into
`data/reality` or `dist/reality`.

`test/p3-scale.test.cjs` tests the original network plus synthetic 10, 50,
100-way sets, the real Campanules signs, DEM bounds, local spatial lookup,
atlas image coordinates, a 2048-pixel GPU cap, R8 allocation and at most one
junction sign batch per camera window.

`docs/p3/benchmark.cjs` produces raw JSON with 10 measured runs after 2 warmups
for network creation time, lookup time over 2,000 points, sign atlas creation
time, sample counts and **tracked** GPU-like allocation estimates
(`texture pixel bytes + vertex buffer bytes`). It does *not* include driver
allocations, OS RSS, browser memory overhead or startup shader compilation.

On PR #11 only, `test/browser.mjs --p3` runs the real built application in
headless Chromium/SwiftShader with the 3/10/50/100 test networks injected
into a local test HTTP server. It records cold boot, 6 warmup + 16 GPU-completed
WebGL2 frame measurements, draw calls, JS heap metrics and screenshots to
`p3-browser-metrics.json`. Data is archived by the CI job as
`p3-piste-scale-profiling`.

**Do not interpret a SwiftShader `gl.finish()` median as real desktop GPU
FPS.** Such results can be heavily affected by driver synchronization,
software rasterization, first-time pipeline compilation, garbage collection
and CI CPU contention. In addition, the synthetic test ways have only a few
nodes each, not the number of vertices typical of arbitrary future OSM data.

## Acceptance gate and work still open

The 100-way scenario must initialize without a texture-size error, keep
single-batch signage and preserve the original surveyed network. We measure
whether the sign atlas and vertex buffers fit **within 10 MiB above the
3-piste setup**, but the full game's memory increase must still be measured on
real hardware. Long-term targets remain ≤5% FPS regression, ≤0.5 s load
increase, ≤10 MB total additional RAM and no lower image quality.

**Hardware FPS and P95 frame time, browser RSS and graphics-driver allocations
remain unverified** until same-device A/B data is collected. The existing
[physical-GPU follow-up](../reality-network/PERFORMANCE-TODO.md) remains open.
When adopting a new real resort, measure full data parsing, real OSM
connectivity, and cold/warm launch separately. If limits fail, optimize the
measured hotspot; do not represent simulated sign-batch metrics as a user
FPS guarantee.
