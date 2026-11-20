#!/usr/bin/env python3
"""Strict two-batch audit of the final 12 Jandri IGN 0.5 m MNT tiles.

For each run, download at most six *new* official rasters and preserve only
source hashes and numerical diagnostics. Not a game asset or terrain mosaic.
"""
import argparse
import hashlib
import json
from pathlib import Path

try:
    from .jandri_mnt_coverage import evaluate, plan
    from .jandri_mnt_batch_two import raster_stats, edge_checks
    from .p4_full_ground_gate import download, sha256, validate_raster, verify_source_url
except ImportError:
    from jandri_mnt_coverage import evaluate, plan
    from jandri_mnt_batch_two import raster_stats, edge_checks
    from p4_full_ground_gate import download, sha256, validate_raster, verify_source_url


PREVIOUSLY_VERIFIED = frozenset({
    "0945-6438", "0946-6438",
    "0945-6439", "0945-6440", "0946-6439", "0946-6440",
    "0947-6438", "0947-6439", "0947-6440",
    "0948-6438", "0948-6439", "0948-6440",
})
EXPECTED_COUNT = 24
BATCH_SIZE = 6


def partition_final_twelve(required, previously=PREVIOUSLY_VERIFIED):
    """Fail closed on changed source inventory and produce disjoint six-packs."""
    items = sorted(required)
    if len(items) != EXPECTED_COUNT or len(set(items)) != EXPECTED_COUNT:
        raise ValueError("Expected exactly 24 distinct official tile IDs")
    if len(previously) != 12 or not previously.issubset(set(items)):
        raise ValueError("Previously verified 12-tile provenance mismatch")
    missing = [key for key in items if key not in previously]
    if len(missing) != 12:
        raise ValueError("Expected exactly 12 unverified official tiles")
    first, last = missing[:BATCH_SIZE], missing[BATCH_SIZE:]
    if len(first) != BATCH_SIZE or len(last) != BATCH_SIZE or set(first) & set(last):
        raise ValueError("Overlapping or incomplete six-tile batches")
    return first, last


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--index", type=Path, default=Path("docs/p4/JANDRI-OSM-INDEX.json"))
    p.add_argument("--wfs", type=Path, required=True)
    p.add_argument("--metadata", type=Path, required=True)
    p.add_argument("--batch", choices=["0", "1"], required=True)
    p.add_argument("--work", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()
    batch = int(args.batch)

    from osgeo import osr
    geo, lambert = osr.SpatialReference(), osr.SpatialReference()
    geo.ImportFromEPSG(4326)
    lambert.ImportFromEPSG(2154)
    for srs in (geo, lambert):
        srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    projector = osr.CoordinateTransformation(geo, lambert)

    index = json.loads(args.index.read_text())
    plan_data = plan(index, lambda lon, lat: projector.TransformPoint(lon, lat)[:2])
    archived = json.loads(args.metadata.read_text())
    original = args.wfs.read_bytes()
    original_hash = hashlib.sha256(original).hexdigest()
    if (original_hash != archived.get("wfsSourceSHA256") or
            archived.get("sourceSHA256") != plan_data["sourceSHA256"] or
            archived.get("requiredTileIds") != plan_data["requiredTileIds"]):
        raise ValueError("Original WFS or pinned OSM identity/coverage changed")
    screened = evaluate(plan_data, json.loads(original))
    if not screened["coverageMetadataComplete"] or screened["requiredTileCount"] != EXPECTED_COUNT:
        raise ValueError("Incomplete official source MNT tile inventory")

    groups = partition_final_twelve(screened["requiredTileIds"])
    selected = groups[batch]
    approved = {row["tile"]: row for row in screened["officialMntCandidates"]}
    report = {
        "stage": "real_IGN_MNT_audit_only_never_publish",
        "status": "started",
        "batch": batch,
        "osmSourceSHA256": plan_data["sourceSHA256"],
        "wfsSourceSHA256": original_hash,
        "requiredTileIds": screened["requiredTileIds"],
        "previouslyVerifiedTileIds": sorted(PREVIOUSLY_VERIFIED),
        "selectedTileIds": selected,
        "companionBatchTileIds": groups[1 - batch],
        "rasters": [],
        "edgeDiagnostics": [],
        "readyFor3D": False,
    }
    args.work.mkdir(parents=True, exist_ok=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    rasters = {}
    try:
        for tile in selected:
            info = approved[tile]
            url = verify_source_url(info["downloadURL"], tile)
            raster_path = args.work / (tile + ".tif")
            byte_count = download(url, raster_path)
            ds = validate_raster(raster_path, tile)
            stats, arr, mask = raster_stats(ds)
            if stats["validFraction"] != 1.0:
                raise ValueError("Ground raster has nodata/invalid elevation: " + tile)
            rasters[tile] = (arr, mask)
            report["rasters"].append({
                "tile": tile, "sha256": sha256(raster_path),
                "bytes": byte_count, "edition": info["edition"],
                "mission": info["mission"], **stats,
            })
            ds = None
            print("Genuine IGN MNT verified", tile, stats, flush=True)

        report["edgeDiagnostics"] = edge_checks(rasters)
        if any(row.get("status") == "blocked_no_valid_shared_edge"
               for row in report["edgeDiagnostics"]):
            raise ValueError("A common tile edge has no valid measured values")
        if {r["tile"] for r in report["rasters"]} != set(selected):
            raise ValueError("Downloaded raster inventory is incomplete")
        report["status"] = "six_authentic_ground_tiles_verified_not_full_terrain_certified"
        print("Verified final Jandri MNT batch", batch, len(selected), "tiles", flush=True)
        print("Neighbouring edge diagnostics:", report["edgeDiagnostics"], flush=True)
    except Exception as exc:
        report["status"] = "blocked_no_publication"
        report["error"] = str(exc)
        raise
    finally:
        args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
