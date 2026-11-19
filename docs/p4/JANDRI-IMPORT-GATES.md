# Jandri real OSM route atlas — scope and publishing gates

Status: **reviewable 2D centreline map, not playable 3D Jandri terrain**.

## Verified underlying source

Original Overpass archive from [GitHub Actions run 44531317057](https://github.com/lzcjames/cold-smoke-reality/actions/runs/44531317057) / artifact `p4-les-deux-alpes-osm-survey`. Its unmodified source bytes have SHA-256 `40dcc37e95a259fb7d0f036e10e4147ce9c7343fb69b167c23ec92241da5ff26`; OSM timestamp `2026-07-24T11:04:51Z`. The content is **real OSM data** (© OpenStreetMap contributors, ODbL 1.0), not traced from a stylized operator piste diagram.

The [versioned index](JANDRI-OSM-INDEX.json) retains every actual node ID, node coordinate, OSM way ID and piste tag. The [versioned map](JANDRI-OSM-MAP.svg) draws each OSM polyline individually, without guessing route joins. It adds less than 30 KB to *on-demand* static assets; it is not included in the game HTML or the high-resolution DEM pack.

| OSM name | Actual way segments | Sum of mapped lengths (approx.) |
| --- | ---: | ---: |
| Jandri 1 | 3 | 2.40 km |
| Jandri 2 | 11 | 3.03 km |
| Jandri 3 | 9 | 1.53 km |
| Jandri 4 | 10 | 2.94 km |
| Balade du Jandri | 2 | 1.37 km |
| Woops du Jandri | 2 | 1.30 km |
| **Total** | **37** | **12.57 km** |

The figures are sums of every accepted OSM segment, not a claim of continuous unique trail length or an official number. All 37 segments happen to carry OSM `piste:difficulty=easy` (blue). This is a **tag from the archived source**, not operator-certified classification. The Jandri cableway is excluded.

**Missing from this historic snapshot:** Jandri 5 (present in newer external listings), and possibly newer/renamed segments such as Jandri 1 bis. Do not create these from imagination or describe the 37 known ways as all of the operator's 2026/27 Jandri routes.

## Required 3D gates before playable expansion

1. Fetch newer complete OSM data specifically for Jandri 5 and any variant, preserving the current original way IDs and full geometry. A live Overpass query timed out on 2026-11-19; rely on the pinned real archive until a supported current source succeeds. Never substitute a ski-lift alignment.
2. Acquire official IGN LiDAR HD **MNT** ground elevation for the high Jandri/Glacier domain **and** the lower resort return, with tile identifiers, source SHA-256 manifests, coordinate-system/datum checks, nodata handling and adequate safety-margin coverage. The published Diable-only DEM cannot be extrapolated to this new region.
3. Measure downhill grades and directed forks against actual source heights and OSM shared-node topology. Reject false connections and unexpected uphill segments without weakening existing P4 acceptance tests.
4. Render pistes and off-piste with explicitly estimated widths and simulated grooming only where justified. Continue to treat cliff, rock and vegetation obstacles as unverified until a credible dataset is available.
5. Test Chromium WebGL2/WebGPU playability, surface collision, destination signs, loading/caching and Alpe d'Huez regression. Keep the 3D pack optional and lazy-loaded.

The official map remains an **independent visual reference**, not metric GIS geometry. No scanned or traced operator map art is redistributed.
