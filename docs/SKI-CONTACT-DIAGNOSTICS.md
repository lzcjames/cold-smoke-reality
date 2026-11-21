# Opt-in ski contact jitter trace (PR diagnostic)

The default game is unchanged. To record the **existing** contact solver's
ski heights, tip angles, and frame-step duration, add `skiDiag=1` to the
current game's URL (keep the current resort/piste parameters):

```text
https://lzcjames.github.io/cold-smoke-reality/?reality=les-deux-alpes&network=1&skiDiag=1
```

Enter a measured piste as usual, ski through a section with the visible
vibration for several seconds, and open the browser developer console.
Run:

```js
console.log(window.__skiSkiDiag?.summary());
console.table(window.__skiSkiDiag?.snapshot().slice(-30));
```

The summary reports the maximum adjacent-frame differences in **left/right
ski boot-height corrections (metres), left/right ski pitch (radians), rendered
skier-root height (metres)**, and animation-frame `dt` (seconds). The raw
snapshot also includes snow sink and both skis' contact-bar endpoints. Use
those measurements to separate a moving root (character/camera movement)
from the ski-only contact solver.

This is **not** a measured FPS benchmark; actual GPU frame time and render
subsystem stalls require separate profiling. The contact heights are
**solver corrections**, not absolute world elevations or a guarantee of ski
clearance. The buffer retains at most 240 frames and only exists when the
opt-in URL flag is present. Reproduce with and without the flag if checking
for overhead. Remove the flag to turn it off. Do not enable globally, log
automatically, send data to servers or infer skier safety from the trace.

Do not change the contact solver, terrain normals, camera smoothing, frame
scheduler or collision behavior based solely on one maximum value. Look for
repeated alternating corrections during steady motion, across multiple
pistes and frame rates; then create a separate small controlled fix.
