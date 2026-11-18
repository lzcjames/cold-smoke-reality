# Follow-up TODO: real-GPU performance acceptance for La Balme piste network

Status: **OPEN / DEFERRED**, recorded before merging PR #9 on 2026-11-19.
Owner: next performance pass. Original feature: [PR #9](https://github.com/lzcjames/cold-smoke-reality/pull/9).
This is **not** a claim that the new mode has passed a physical GPU FPS benchmark.

## Shipped functionality / user feedback

- Optional `?reality=alpe-dhuez&network=1` mode renders the mapped La Balme, Déversoir, and Campanules network and its directional roadside signs, reusing the original IGN elevation grid.
- User played a PR #9 preview and reported it felt smooth. They initially missed Campanules; the follow-up added a 105 m advance sign and a ~32 m approach sign, and the user considered the revised preview acceptable.
- Original single-piste Reality Mode and procedural mode remain available.
- The latest PR-head CI [run 44416767401](https://github.com/lzcjames/cold-smoke-reality/actions/runs/44416767401) passed `npm run check`, `npm test`, the browser release tests on WebGL2 and WebGPU (including a focused lower-junction draw), GIS validation, and the ABBA profiling workflow step.

## Performance evidence and its limits

- Original **four-frame**, separate-browser, Chromium/SwiftShader comparison reported software-rendered equivalent FPS changes of −20.8% (upper) and −5.1% (lower). That protocol used synchronous `gl.readPixels`; the values are **not real hardware FPS** and have high uncertainty. See [survey and benchmark](README.md).
- Same-browser ABBA on/off sign-draw profiling over **48 enabled and 48 disabled frames per camera** (96 per scene), using `gl.finish()` instead of forced pixel readback, did **not show a stable, repeatable penalty** attributable to the new sign draw. The run at [44416767401](https://github.com/lzcjames/cold-smoke-reality/actions/runs/44416767401) yielded:
  - Upper: sign-on median **1.6 ms**, sign-off **1.7 ms**; p95 both ~350 ms, extreme outliers >14 seconds. The extremely bimodal measurements are not credible user-visible FPS.
  - Lower: sign-on median **347.3 ms**, sign-off **349.8 ms** (sign-on ~0.72% faster in the software test); p95 442.2/470.7 ms.
  - Raw `junction-abba-profiling` artifact is attached to the same run.
- New sign geometry is batched (about +1 draw per tested scene and ~hundreds of triangles) and the IGN DEM is **not duplicated**.
- Previously measured memory growth for the optional network: about **+4.39 MB** in tracked JS heap and graphics allocation counters; a single boot comparison found no load-time increase. These are approximate instrumented counters, not system RSS.
- Separate CPU microbenchmark of the network spatial lookup was negligible per query, but it is not a real GPU frame-time validation.
- **Crucial**: turning the sign draw on and off is *not* the same as comparing the full network mode against single-piste mode. The complete network-mode effect remains unproven.

## Required follow-up before declaring FPS budget achieved

- [ ] Compare `facbe88` (single-piste baseline) against merged network mode on **one physical desktop GPU**, matching browser version, backend, quality, viewport, daylight/weather and fixed camera/input paths through both junctions.
- [ ] Record hardware/browser, median and p95 completed frame times and FPS over **at least 30 steady frames per route / run**, several repeated runs, warm vs cold launch, main-thread CPU update time and render submission, and (where supported) GPU timer queries. Report spread and confidence, not a single sample.
- [ ] Compare full network mode with `network=1` vs original single-piste mode, and separately compare sign-draw enabled vs disabled within one page.
- [ ] Re-check added load time, JS/graphics/RSS memory, draw calls, and visual readability on a representative low/mid-range GPU or integrated graphics machine.
- [ ] Target **FPS decline ≤5%**, additional startup time **≤0.5 s**, additional memory **≤10 MB**, with no image-quality cuts. If a reproducible regression is found, profile and optimize the hotspot, then repeat the same protocol.
- [ ] Update this TODO and the performance table in `docs/reality-network/README.md` with hardware measurements; close only after reproducible evidence exists.

## Release decision

PR #9 may merge as an **opt-in** Reality network feature because the user tested it successfully and CI validates functionality. **The performance target remains an open follow-up**, not a confirmed pass. Keep the original La Balme-only URL as the stable fallback. Repository GitHub Issues are disabled, so this tracked document serves as the project TODO.
