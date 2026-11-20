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

## Independent lift-operator corroboration (2026-11-20 lookup)

The resort piste map's three sectors are independently corroborated by
**operator and resort sources**, not just by the OSM-derived OpenSkiData
snapshot:

- [Les 2 Alpes lift / ski pass official "Le nouveau Jandri"](https://www.skipass-2alpes.com/fr/blog/le-nouveau-jandri)
  explicitly identifies the replacement **Jandri 3S** (opened 2024),
  **section 1: departure 1650 m to intermediate station 2600 m**, and
  **section 2: intermediate 2600 m to upper station 3200 m**.
- [AEON Montagnes Jandri 3S](https://www.aeon-montagnes.com/telepherique-3s-jandri/)
  independently lists **three stations**: departure at 1650 m,
  intermediate at 2600 m and arrival at 3200 m.
- [Les Deux Alpes official section-1 entry](https://www.les2alpes.com/hiver/offres/jandri-troncon-1-acces-2600m-les-deux-alpes-fr-hiver-2959381/)
  confirms the two successive sections and route to 3200 m.

This elevates the **three station *sectors* and two-part transport
alignment** to **officially documented**, rather than "map-only
speculation". It does **not** verify passenger entrance coordinates,
boarding platforms, cabin transfer vs through-service *for the
2026/27 winter season*, stop locations to submeter precision, or ski
access corridors. Early post-opening reporting distinguishes winter
changes at 2600 and summer through-rides, but do not treat an old
season description as a current operational policy without confirming
it with the operator. The game must not model two unrelated/legacy
Jandri Express systems in place of the current Jandri 3S.

## Resolve the earlier OpenSkiData mismatch

The source-only lift-station audit `docs/p4/JANDRI-STATION-TRANSFER-SOURCE-REVIEW.md`
found **two** records labelled `top` and **no** record labelled `bottom`
for Jandri II, with both upper ground measurements near **3154 m**.
These are **missing/ambiguous source tags**, not proof that the real Jandri II
lower/middle boarding station does not exist. The supplied resort map
provides independent **cartographic evidence of a JANDRI 2600 station/sector
between village and JANDRI 3200**. Operator sources now independently confirm the intermediate **station**,
but do **not** establish the current 2026/27 passenger transfer/through-service
arrangement or exact boarding coordinates.

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
