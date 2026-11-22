#!/usr/bin/env python3
"""Plan authentic IGN kilometre tiles from verified, unreviewed regional OSM ways.

A *source acquisition candidate plan*, never proof of resort membership
or of skiable, groomed piste surfaces. No raw DEM is downloaded.
"""
import argparse
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def baseline_jandri_tiles():
    """Actual 24 IGN MNT 1km source TIFFs from prior successful audited run."""
    return {f"{east:04d}-{north:04d}"
            for east in range(945, 953) for north in range(6438, 6441)}


def build_plan(folder, project, *, sampling_m=25, margin_m=90,
               max_tiles=2500):
    folder = Path(folder)
    status = json.loads((folder / "status.json").read_text())
    if (status.get("schema") != "cold-smoke-regional-shard-survey/v1"
            or status.get("resortId") != "les-deux-alpes"
            or status.get("approvedForGameplay") is not False
            or status.get("wholeResortCoverageApproved") is not False
            or status.get("combinedAtomicSnapshot") is not False
            or len(status.get("shards", [])) != 4):
        raise ValueError("A complete four-part source-status ledger is required")
    if not (0 < sampling_m <= 50 and 0 <= margin_m <= 250
            and 1 <= max_tiles <= 10000):
        raise ValueError("Invalid source-only DEM tile budget")
    route_candidates = {}
    snapshots = []
    missing = []
    conflicts = set()
    for item in status["shards"]:
        if item["status"] != "source_candidates_unreviewed":
            if item["status"] != "blocked_no_usable_source":
                raise ValueError("Unknown regional source status")
            missing.append(item["id"])
            continue
        filename = item["file"]
        if (not filename.startswith("quadrant-") or
                filename != item["id"] + "-overpass-raw.json"):
            raise ValueError("Unsafe original source filename")
        raw = (folder / filename).read_bytes()
        if sha256(raw) != item.get("rawResponseSHA256"):
            raise ValueError("Original regional response hash mismatch")
        original = json.loads(raw)
        index = json.loads((folder /
            (item["id"] + "-source-index.json")).read_text())
        if (index.get("originalResponseSHA256") != item["rawResponseSHA256"]
                or original.get("osm3s", {}).get("timestamp_osm_base") !=
                item.get("timestampUTC") or
                index.get("snapshotTimestampUTC") != item.get("timestampUTC")):
            raise ValueError("Original OSM snapshot and index identity mismatch")
        by_id = {w["id"]: w for w in original.get("elements", [])
                 if w.get("type") == "way"}
        for w in index.get("features", []):
            orig = by_id.get(w.get("id"))
            if (not orig or orig.get("tags", {}).get("piste:type") != "downhill"
                    or orig.get("nodes") != w.get("nodes") or
                    len(orig.get("geometry", [])) != len(w.get("coordinates", []))):
                raise ValueError("Original OSM geometry or node identity changed")
            pairs = [[p["lon"], p["lat"]] for p in orig["geometry"]]
            if w["coordinates"] != pairs:
                raise ValueError("Original OSM projected-source coordinates changed")
            if (len(pairs) < 2 or any(not all(math.isfinite(v) for v in p)
                    or not (-180 <= p[0] <= 180 and -90 <= p[1] <= 90)
                    for p in pairs)):
                raise ValueError("Invalid source original route line")
            way_id = w["id"]
            if way_id in route_candidates and route_candidates[way_id] != pairs:
                conflicts.add(way_id)
            else:
                route_candidates[way_id] = pairs
        snapshots.append({"id": item["id"],
                          "originalResponseSHA256": item["rawResponseSHA256"],
                          "timestampUTC": item["timestampUTC"]})
    tiles = defaultdict(set)
    for way_id, points in route_candidates.items():
        if way_id in conflicts:
            continue   # never silently choose between changed OSM snapshots
        projected = [project(*p) for p in points]
        if any(len(p) < 2 or not all(math.isfinite(v) for v in p[:2])
               for p in projected):
            raise ValueError("Unverifiable Lambert-93 source projection")
        for a, b in zip(projected, projected[1:]):
            distance = math.hypot(b[0] - a[0], b[1] - a[1])
            if not 0 < distance < 30000:
                raise ValueError("Invalid source route segment length")
            steps = math.ceil(distance / sampling_m)
            for j in range(steps + 1):
                ratio = j / steps
                e = a[0] + (b[0] - a[0]) * ratio
                n = a[1] + (b[1] - a[1]) * ratio
                for ex in range(math.floor((e - margin_m) / 1000),
                                math.floor((e + margin_m) / 1000) + 1):
                    for ny in range(math.floor((n - margin_m) / 1000),
                                    math.floor((n + margin_m) / 1000) + 1):
                        name = f"{ex:04d}-{ny:04d}"
                        tiles[name].add(way_id)
                        if len(tiles) > max_tiles:
                            raise ValueError("Official DEM tile candidate budget exceeded")
    old = baseline_jandri_tiles()
    rows = [{"tile": tile, "sourceWayIds": sorted(ways),
             "sourceWayCount": len(ways),
             "alreadyIn24TileJandriMntAudit": tile in old,
             "resortMembershipVerified": False,
             "detailedDEMVerifiedForRegionalWays": False}
            for tile, ways in sorted(tiles.items())]
    return {
        "schema": "cold-smoke-regional-ign-dem-candidate-plan/v1",
        "resortId": "les-deux-alpes",
        "sourceCRS": "EPSG:4326", "targetCRS": "EPSG:2154",
        "tileSizeM": 1000, "marginM": margin_m, "samplingIntervalM": sampling_m,
        "candidateOriginalWayCount": len(route_candidates),
        "includedUnconflictedWays": len(route_candidates) - len(conflicts),
        "conflictingOriginalWayIds": sorted(conflicts),
        "independentSourceSnapshots": snapshots,
        "missingRegionalShards": missing,
        "reference24TileAuditRunId": 45052165038,
        "reference24Tiles": sorted(old),
        "candidateSourceTileCount": len(rows),
        "candidateTilesOutsideOriginal24": sum(
            not row["alreadyIn24TileJandriMntAudit"] for row in rows),
        "allOsmWaysConfirmedInsideLesDeuxAlpes": False,
        "newRegionalDEMDownloaded": False,
        "approvedForGameplay": False,
        "tiles": rows,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source-dir", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    from osgeo import osr
    src, dest = osr.SpatialReference(), osr.SpatialReference()
    src.ImportFromEPSG(4326)
    dest.ImportFromEPSG(2154)
    for s in (src, dest):
        s.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    transformer = osr.CoordinateTransformation(src, dest)
    report = build_plan(args.source_dir,
                        lambda lon, lat: transformer.TransformPoint(lon, lat)[:2])
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print("Source-only regional DEM candidate tiles:",
          report["candidateSourceTileCount"], "outside prior 24:",
          report["candidateTilesOutsideOriginal24"],
          "missing original OSM shards:", len(report["missingRegionalShards"]))


if __name__ == "__main__":
    main()
