# Jandri I / II: boarding tags and measured transfer-screen evidence

This **source-only P4 report** combines two previously successful and
independently archived GitHub Actions audits:

1. [OpenSkiData + pinned OSM Jandri I / II station crosswalk, run 44741585451](https://github.com/lzcjames/cold-smoke-reality/actions/runs/44741585451)
   — six linked station records and horizontal distance to their nearest
   *original OSM ski piste centreline*.
2. [Authentic IGN LiDAR HD ground height measurement, run 44745406528](https://github.com/lzcjames/cold-smoke-reality/actions/runs/44745406528)
   — all six source locations measured on three authentic 0.5 m MNT GeoTIFFs.

The new `tools/reality/jandri-station-transfer-review.cjs` joins
the **same six source station IDs**, confirms lift OSM source IDs,
OpenSkiData snapshot identity, geographic coordinates, original
`bottom / mid / top` station labels, source
`entry / exit` tags, and measured IGN bare-earth elevations.

It audits **all eight combinations** between four Jandri I station
records and two Jandri II station records as *potential interchange
pairs*. Each includes a geodesic horizontal distance and absolute
difference of measured IGN ground heights. Even a short distance
is **not** verification of a marked walkway, ski link, accessible
station platform, collision-free route, or a permitted transfer.

Critically, source tags remain source claims. A `top` source label
does not certify the terminal's disembark point. Source geometries
may use Mapterhorn 3D height; IGN samples **ground**, not the station
building floor or cable clearance. The game therefore approves
**zero boarding zones, zero cross-lift transfers and zero
直达终点站 destinations**.

Use the dedicated workflow
`.github/workflows/p4-jandri-station-transfer-review.yml`
to produce the compact archival evidence
`p4-jandri-real-station-boarding-transfer-evidence`.
Neither raw LiDAR files nor gameplay lift assets are committed.

## Measured findings (2026-11-20)

The real archived-source [audit run 44746683510](https://github.com/lzcjames/cold-smoke-reality/actions/runs/44746683510) yielded the following **OpenSkiData source labels**, not confirmed physical boarding platforms:

| Lift | `bottom` records | `mid` | `top` records |
| --- | ---: | ---: | ---: |
| Jandri I | 2 | 0 | 2 |
| Jandri II | **0** | 0 | 2 |

Measured source records:

- Jandri I lower-labelled records: **1658.32 m** and **1658.20 m** IGN ground, **76.9 m** and **76.6 m** horizontally from the nearest pinned Jandri 1 piste centreline.
- Jandri I upper-labelled records: **2576.92 m** and **2576.83 m** IGN ground, **65.9 m** and **70.5 m** from the nearest pinned Jandri 3 centreline.
- Jandri II has **two upper-labelled source records**, both at **3154.23 m** IGN ground and **40.8 m** from the nearest pinned Jandri 4 centreline. **No linked station was labelled `bottom`.**

The source `entry` and `exit` values for these six records are unknown in this archive. At least some records are close in space; two source records must never be automatically interpreted as two independent boarding platforms. The shortest *cross-lift* station-record distance in the report is approximately **2562.6 m**, but this coarse record pairing does **not** describe an operator-sanctioned real interchange. In particular, the Jandri II lower terminal may be missing or represented differently in this dataset. Obtain dated operator station schematics / entrance locations before specifying its ride start or exit.

## Next decision gates

To turn source candidates into real playable lift service, collect
dated, independently attributable lift operator maps / station
entrance and exit location evidence, measure accessible walking
paths and real groomed piste **polygon** connections, verify station
floor elevation and tower/cable clearance, and keep the lift running
status distinct from a current-day operational report.

The already implemented
`tools/reality/lift_ride_flow.cjs` permits both
**正常乘坐** and **直达终点站** only after actual verified
lower-station boarding and upper-station safe disembark. This PR
does not enable either in the published game.
