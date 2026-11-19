# Jandri OSM shared-node topology gate (P4)

**Status: verified 2D centreline audit; NOT a playable Jandri 3D ski area.**

Run:

```sh
node tools/reality/audit-jandri-topology.cjs > /tmp/jandri-topology.json
node --test test/jandri-topology.test.cjs
```

The tool reads only the versioned [OSM survey index](JANDRI-OSM-INDEX.json) and never reconstructs, smooths, or invents a piste segment. Pinned OSM snapshot: **2026-07-24 11:04:51 UTC**, original archive SHA-256 `40dcc37e95a259fb7d0f036e10e4147ce9c7343fb69b167c23ec92241da5ff26`. © OpenStreetMap contributors, ODbL 1.0.

## Measured source topology

| Route name in snapshot | Real OSM ways | Approx. sum of centreline segments | Components joined by **identical OSM node IDs** |
| --- | ---: | ---: | ---: |
| Balade du Jandri | 2 | 1.37 km | 2 |
| Jandri 1 | 3 | 2.40 km | 3 |
| Jandri 2 | 11 | 3.03 km | 11 |
| Jandri 3 | 9 | 1.53 km | 9 |
| Jandri 4 | 10 | 2.94 km | 2 (9 ways + 1 way) |
| Woops du Jandri | 2 | 1.30 km | 2 |
| **Total** | **37** | **12.57 km** | **29 components per name** |

There are **429 unique OSM node IDs** and **8 shared node IDs involving more than one named route** in this snapshot. Cross-name shared nodes are:

| OSM node | Names using the same node | Notes |
| --- | --- | --- |
| 13089238416 | Balade du Jandri / Jandri 4 | Shared geometry only |
| 6060332507 | Balade du Jandri / Woops du Jandri | Shared geometry only |
| 6060893705 | Jandri 1 / Jandri 2 | Shared geometry only |
| 6060512284 | Jandri 2 / Jandri 3 | Shared geometry only |
| 253703327 | Jandri 3 / Jandri 4 | Shared geometry only |
| 253705379 | Jandri 3 / Jandri 4 | Shared geometry only |
| 253703303 | Jandri 4 / Woops du Jandri | Shared geometry only |
| 13089238415 | Jandri 4 / Woops du Jandri | Shared geometry only |

**Do not treat these eight nodes as confirmed physical junctions, downhill exits, or sign locations.** Sharing an OSM node shows the mapped centrelines have a common point, not whether it is possible to ski from one way to another. Nor does the lack of a shared node prove a ski connection is absent: some OSM ways may terminate near one another without sharing a node, or the archived dataset may be incomplete. Geometry intersections without shared node identity are **not** promoted to junctions.

## Mandatory gates before turning this into 3D

1. Obtain ground DEM coverage for **both** upper Jandri / glacier and lower resort return; preserve provenance, source hash, datum, nodata and vertical accuracy. The existing Diable DEM does not cover this expansion.
2. Reconcile way segments and inspect continuity and the resulting **directional** altitude gradients. Do not connect detached same-name segments or bridge gaps without a documented source.
3. Verify any route change, skiable crossing and arrow direction against measured downhill travel; do not auto-place signs solely from the above shared nodes.
4. Keep widths/crossfall explicitly simulated unless surveyed, and preserve rock/trees/cliffs as unverified hazards until reliable data exists.
5. Validate three-dimensional physics, render/collision consistency, progressive loading, and the existing Alpe d'Huez regression before publishing.

Jandri 5 and possible Jandri 1 bis are **not present** in this July 2026 snapshot; no geometry has been fabricated for either. The official ski map can inform route naming and expected coverage but is not a GIS centreline or elevation source.


## Verified upstream DEM acquisition channel (2026-11-19)

IGN publishes **LiDAR HD MNT**, a ground elevation model, through
https://cartes.gouv.fr/telechargement/IGNF_MNT-LIDAR-HD .
The authoritative dataset description is
https://www.data.gouv.fr/datasets/mnt-lidar-hd and the IGN delivery
specification is https://data.geopf.fr/annexes/ressources/documentation/DL_LiDAR_HD_1-0.pdf .
The availability of the full Jandri/glacier + return corridor **has not yet
been confirmed**; linking the catalogue is not evidence that the required
tiles exist or were downloaded.

Acquisition checklist for each selected *real* 1 km tile:
- Log original URL, tile identifier, product edition, date, declared CRS,
  vertical datum, resolution, raw file SHA-256 and licence.
- Validate raster CRS/vertical unit and compare each original tile's
  georeferenced footprint with the proposed simulation crop.
- Reject any nodata or seam gap along the candidate run, return path or
  collision safety margin. Check overlapping tile elevations for anomalies.
- Confirm the complete OSM centreline footprint is contained *with margin*;
  the present index bounding box is **only**
  [6.1263679, 44.9905905, 6.2048399, 45.0107322] (WGS84) and cannot
  establish the coverage of missing Jandri 5 / 1 bis or resort return.
- Reproject and resample only after preserving originals and validating
  the horizontal/vertical references. Store the derived grid separately
  from the game HTML, load it only on demand, and run actual ski tests.

**No Jandri MNT tile has been acquired or certified by this PR.** Do not
publish a playable Jandri area until the above checks are satisfied.
