# La Balme ski-to-snow contact audit

Baseline `bd3ce651381e427511e283a4fea49006e0aa4ac5`. La Balme, OpenStreetMap way 23257919. DEM asset SHA-256 `362aaefeb1fff8adb58af841ec1d7e0303e3ef493cd69e5364a2991ddde20a8d`.

## Result

The reported landing reproduced. It is frame **2292** in the logs below (zero-based index **2291**, or 38.183 s by the original indexing). The fixed-step elapsed time after this tick is 38.200 s. The game's run clock reads 38.007 s after slow motion. These are three different time labels for the same event.

At the contact switch, speed along the incoming snow normal was **8.492 m/s**, and the solver retained **28.153 cm** of sink with a recovery velocity of **−1.931 m/s** along its local correction axis. Pelvis lift was near zero. At 2293, the following frame, the left shovel had the deepest measured sole point at **−23.281 cm**. Each tip's sampled mesh envelope was already entirely below the DEM at touchdown. The right shovel also reached **−15.95 cm** on the preceding frame while physics still reported airborne.

| Frame (1-based) | Contact | L tip | L binding | L tail | R tip | R binding | R tail |
|---|---|---:|---:|---:|---:|---:|---:|
| 2290 | No | +9.68 | +3.43 | −1.09 | +1.41 | +7.28 | +6.56 |
| 2291 | No | −11.58 | −5.49 | −3.10 | −15.95 | −10.66 | +2.50 |
| 2292 | **Landed** | **−23.27** | −17.89 | −1.65 | −22.66 | −18.99 | −1.90 |
| 2293 | Yes | **−23.28** | −19.00 | +0.71 | −20.30 | −18.09 | −7.44 |
| 2294 | Yes | −17.33 | −14.48 | −0.54 | −13.29 | −12.35 | −7.94 |
| 2295 | Yes | −10.68 | −8.91 | −0.30 | −5.66 | −6.79 | −7.55 |

Values are signed vertical distances in cm. The physics foot approximation at touchdown was −8.88 cm and the lowest reference-line sample was −17.36 cm. The body root reached −29.74 cm on frame 2296, when the physical foot approximation was already +0.26 cm. The body value measures suspension as well as contact.

Across 3,600 frames per mode, La Balme had 14 touchdown transitions and six frames with a sole sample below −10 cm (1808 and 2291–2295). The reference line reached that threshold on two frames. The original seeded mountain had one touchdown and zero sole samples below −10 cm. Its deepest sample across the run was −1.94 cm. The same controller finds different terrain and jump conditions in the two modes.

## Visual verdict

**Brief, visible geometry clipping around the landing.** The side images from 2292–2294 show the snow masking the forward ski sections while the rear sections remain visible. The default chase view makes the short event much less apparent because the skier is small and impact spray covers the skis. The negative mesh distances and the one-frame lead over physical contact rule out a reference-line-only measurement error. The measured sink and decay are consistent with the solver's landing buffer contributing to the event. The two runs provide no evidence of a persistent physics/render time offset, and this test does not isolate the buffer as the sole cause.

## Measurement

- `Course.height(x,z,0.5)` gives world elevation in game metres. On La Balme it reads the bilinear IGN grid relative to the route's vertical datum. The physics root `S.p` is the spring's state, and `S.p.y - S.leg` is a scalar physics foot approximation at that root. The rendered figure has its own `Game.root`.
- The probe uses the positions and rigid foot assignments in the actual `Skier.mesh.V/W/I` draw mesh. It locates the ski material on both foot bones and uses the base faces from the same `skiMesh` generator. It transforms each vertex using the Float32 matrix uploaded to the shader and adds `Render.origin` to restore world coordinates. It samples each of the 88 base triangles per ski on a quarter-step barycentric lattice, including the edges and vertices. Signed distance is `vertexWorldY - Course.height(vertexWorldX, vertexWorldZ, 0.5)`. It is vertical height difference, not a slope-normal distance. The tip zone has bind-local Z ≤ −0.50 m, the tail Z ≥ 0.40 m, and the binding zone covers the intervening sole. The reported minimum is a sampled value.
- The logs store mesh envelope maxima by zone as `tops`. `refs` samples the render-space motion-blur bars after origin restoration. Per frame, `sink/sinkVelocity` are solver `gs[9]/gs[10]`, `pelvisRise` is `gs[16]`, and `correction` is the left and right ski lift/pitch plus pelvis lift. `landV` persists after touchdown.
- Screen images include the terrain shader's clipmap interpolation and snow displacement. The signed distances use the requested CPU DEM, so the distances alone do not specify exactly where each rendered pixel is masked.

## Reproduce

From this report branch, with Node 24 and Chromium available:

```sh
npm run check
npm test
npm run test:browser -- --release
node reports/la-balme-contact/run.mjs
node reports/la-balme-contact/run.mjs --capture 2291 2293
node reports/la-balme-contact/run.mjs --capture --chase-only 2292
python reports/la-balme-contact/annotate.py
```

Chromium 156 / SwiftShader. URL flags `?manual&w=320&h=180&quality=2&backend=webgl2&reality=alpe-dhuez`; the procedural run omits `reality`. Both use `__ski.pilot(0.45,5.2)` at a fixed 1/60 s step for 3,600 frames. The probe is injected into the served HTML in memory. No production source or solver code was changed.

## Evidence

- [Key frames](key-frames.png) and [annotated quarter-speed replay](landing-annotated.mp4).
- [Raw frame archive](landing-frames.zip). Includes chase and diagnostic side views for all 63 consecutive frames 2261–2323, plus seven chase-only control frames around touchdown. The paired capture alternates viewpoints, which can affect motion blur. The chase-only control never renders the side camera.
- [Landing-window CSV](landing.csv), [La Balme 3,600-frame JSONL](La-Balme.jsonl.gz), and [procedural 3,600-frame JSONL](procedural.jsonl.gz).
- `npm run check`, `npm test` (3 tests) and `npm run test:browser -- --release` passed. The browser suite covered WebGL2, WebGPU, missing data, the procedural mountain and real La Balme. The solver was not changed, so the motion suite was outside the requested checks.
- The screenshot replays match the scan's body positions and contact flags on every captured frame. Maximum sole-distance difference was 0.088 mm in the paired capture and zero in the chase-only control.
