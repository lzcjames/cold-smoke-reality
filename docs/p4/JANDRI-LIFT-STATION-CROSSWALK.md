# Jandri I / II: authentic lift-to-station and piste proximity evidence

This P4 audit links the already acquired **original OpenSkiData daily
snapshot** to the pinned Jandri OpenStreetMap 37-way source. It does
not redownload worldwide data, authorize a boarding zone, or publish
a transport pack.

The audited upstream OSM lift keys are:

- **Jandri I** — `way/1229057878`
- **Jandri II** — `way/1361005452`

The source-pinned gate reads the existing OpenSkiData discovery artifact
from [GitHub Actions run 44731959163](https://github.com/lzcjames/cold-smoke-reality/actions/runs/44731959163),
which previously returned 45 nearby lift-line candidates and 74
nearby lift-station spots. It matches station `liftId` only against
the *same build's* daily feature ID, retains the stable upstream OSM
source IDs, checks station coordinates, and computes the shortest
**horizontal** distance from each point to the authentic pinned OSM
downhill centreline segments.

**A nearby centreline does not imply a safe ski or foot connection.**
The route may cross an inaccessible edge, a steep slope, an unverified
piste corridor, or a lift station with different boarding/exit
arrangements. An OSM-derived `top` or `bottom` tag also does not
independently certify a usable passenger terminal. OpenSkiData
`operating` denotes a source-record lifecycle tag, not today's
service availability.

Machine-readable evidence is retained as the artifact
`p4-jandri-source-linked-lift-station-crosswalk`. The CI uses
synthetic coordinates **only** in its unit tests, never in the source
audit or the live game.

## Conditions for enabling ride or direct-to-top

The previously implemented `tools/reality/lift_ride_flow.cjs`
requires both terminal positions, ground heights, boarding
authorization, physical disembark zone and safe exit route to be
independently verified. This audit cannot grant those checks. Both
the normal ride and the requested **直达终点站** option therefore
remain disabled in the published game.

Next: derive source-backed terminal locations from this audit;
verify terminal ground heights against authentic IGN LiDAR HD and
check real operator boarding and disembark arrangements plus
piste-corridor / access connectivity before unlocking either option.
