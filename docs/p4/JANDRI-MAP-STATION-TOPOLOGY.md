# Les Deux Alpes resort piste-map evidence: Jandri station topology

**Source:** user-supplied one-page `plan_hiver_les2alpes_aeon.pdf`,
displaying Les 2 Alpes branding. Original exact PDF SHA-256:
`7be8b77bea5806654918c2007cdd363a3477fb21f2d23b46ad03a0f352e96252`.

- PDF creation metadata: **2026-11-09 07:58:27 +01:00**
  (document production timestamp, **not independently verified ski-season validity**).
- Original map was supplied in the development conversation and **is not
  copied into this repository** (copyright and attribution remain with its owner).
- Page 1, main illustrated piste plan: a named **JANDRI** lift alignment visually
  connects **LES DEUX ALPES 1650 M** to **JANDRI 2600**, then continues toward
  **JANDRI 3200**; the same labelled high-altitude sector includes
  lift/funicular access and mapped downhill routes.
- The map explicitly depicts multiple ski-route difficulty colours,
  downhill-direction arrows, marked junctions, tunnel and danger symbols,
  piste boundaries and off-piste warnings. These should be used for
  *human-reviewed* alignment and hazard assessment only; the diagram is
  perspective/schematic and **not georeferenced survey geometry**.

## Resolve the earlier OpenSkiData mismatch

The source-only lift-station audit `docs/p4/JANDRI-STATION-TRANSFER-SOURCE-REVIEW.md`
found **two** records labelled `top` and **no** record labelled `bottom`
for Jandri II, with both upper ground measurements near **3154 m**.
These are **missing/ambiguous source tags**, not proof that the real Jandri II
lower/middle boarding station does not exist. The supplied resort map
provides independent **cartographic evidence of a JANDRI 2600 station/sector
between village and JANDRI 3200**. It suggests, but **does not certify**, a
passenger transfer/through-service arrangement at that station.

Do **not** infer from the diagram whether the current lift system has
two independent boarding services, whether cabins run through the middle
without disembarking, exact station-floor elevation, access direction, or
accessible walking/ski transfer corridors. The machine-readable audit
`docs/p4/JANDRI-MAP-STATION-TOPOLOGY.json` therefore explicitly keeps
these as unapproved candidates.

## Next gates for enabling ride and `直达终点站`

1. Verify lift/operator published service pattern (through-ride vs transfer),
   lower/intermediate/top actual passenger boarding and alighting locations,
   and which station is the true terminal for each leg.
2. Match operator-station entrance/exit information to the six original
   OpenSkiData source records and the previously measured IGN LiDAR ground.
3. Only once accessibility and no-go boundaries have been verified, feed
   the approved station/route graph to `tools/reality/lift_ride_flow.cjs`.
   For a two-leg route, **直达终点站** must mean the actual selected
   authorized *final* destination, not an invented station or a landing
   in the middle of unsafe terrain.

No playable station, sign, collision mask, ski-route grades, or lift service
is approved merely because it appears on this map. No imagery is embedded
in the published game.
