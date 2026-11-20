# Winter-only Jandri 3S journey and express-to-terminal contract

**Target season:** Les 2 Alpes winter ski operation only. The product
does not support summer lift modes.

## Documented infrastructure versus still unverified winter passenger policy

The user-supplied November 2026 Les 2 Alpes piste map, plus linked
operator/AEON sources recorded in
`docs/p4/JANDRI-MAP-STATION-TOPOLOGY.json`, substantiate:

- **1650** Les Deux Alpes lower station sector.
- **2600** Jandri 3S intermediate station sector.
- **3200** Jandri 3S upper station sector.
- Two physical sections **1650→2600→3200**, replacing former Jandri
  Express. These heights are printed *sector labels*, not boarding
  platform elevations or corrected IGN terrain heights.

The winter design decision is **two successive legs with a simulated
2600m transfer step**. This is a gameplay flow, **NOT** a verified
claim about whether the 2026/27 operator requires passengers to change
cabins. Exact platforms, transfer corridor and winter passenger
policy remain unverified and therefore **the entire ride is
release-gated and disabled in the live game**.

## Future ride choices

At an **independently approved** 1650 lower boarding position the
player will choose a destination:

1. **Jandri 2600** — ride only the first leg.
2. **Jandri 3200** — use both legs and the 2600 interchange.

After boarding, the game can offer:

- **正常乘坐** — show each segment's transport animation and the
  intervening 2600 transfer action.
- **直达终点站** — skip rendering/playing the travel sequence and
  arrive at the **exact same independently verified end platform** as
  normal riding. For a 3200 destination this can skip the intermediate
  animation but may **not bypass certification** of the actual 2600
  passenger transfer and second leg.

`tools/reality/jandri_winter_3s_flow.cjs` implements this
two-section trip state machine using the strict, previously tested
`tools/reality/lift_ride_flow.cjs` individual-leg controls. It
refuses boarding without actual approved bottom terminal,
winter-policy evidence, intermediate transit access, both true
source-backed end-station heights/coordinates and safe exits.
The module does not allocate 3D meshes, fetch large data or modify
initial HTML; no runtime game UI is currently wired to it.

`test/jandri-winter-3s-flow.test.cjs` uses **explicitly invented
coordinates in synthetic tests ONLY**, to verify that normal
and express rides end at the same terminal, and cannot jump off-piste,
skip the 2600 access gate, board at the wrong place, replay a ride
after arrival, or select a fictitious destination.

Next data tasks are **operator winter 2026/27 station passenger
policy confirmation**, independent station platform GNSS and ingress/
egress points, permitted physical passage at 2600, real piste corridor
widths and hazards, and Chromium gameplay/collision/performance
testing. Do not flip the internal verification flags based only on
OSM tags, a rendered map, or ground height at a source feature.
