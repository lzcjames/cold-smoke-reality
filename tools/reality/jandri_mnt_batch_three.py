#!/usr/bin/env python3
"""Third bounded, non-publishing Jandri IGN ground MNT raster audit.

Downloads six distinct new rasters from the archived official WFS index;
does not claim full 24-tile terrain coverage, safe route joins or gameplay.
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

VERIFIED_BEFORE = frozenset({
    "0945-6438", "0946-6438",
    "0945-6439", "0945-6440", "0946-6439", "0946-6440",
})
BATCH_SIZE = 6


def select_next(keys, verified=VERIFIED_BEFORE, count=BATCH_SIZE):
    items = sorted(keys)
    if len(items) != len(set(items)) or not verified.issubset(set(items)):
        raise ValueError("Duplicate or missing previously verified tile IDs")
    pending = [item for item in items if item not in verified]
    if count < 1 or count > len(pending) or count > BATCH_SIZE:
        raise ValueError("Invalid bounded third batch size")
    chosen = pending[:count]
    if set(chosen) & verified:
        raise ValueError("Accidental repeat of already verified ground tile")
    return chosen


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--index", type=Path, default=Path("docs/p4/JANDRI-OSM-INDEX.json"))
    p.add_argument("--wfs", type=Path, required=True)
    p.add_argument("--metadata", type=Path, required=True)
    p.add_argument("--work", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()

    from osgeo import osr
    geo, lambert = osr.SpatialReference(), osr.SpatialReference()
    geo.ImportFromEPSG(4326)
    lambert.ImportFromEPSG(2154)
    for srs in (geo, lambert):
        srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    transform = osr.CoordinateTransformation(geo, lambert)

    index = json.loads(args.index.read_text())
    expected = plan(index, lambda lon, lat: transform.TransformPoint(lon, lat)[:2])
    archived = json.loads(args.metadata.read_text())
    raw = args.wfs.read_bytes()
    original_sha = hashlib.sha256(raw).hexdigest()
    if (archived.get("wfsSourceSHA256") != original_sha or
            archived.get("sourceSHA256") != expected["sourceSHA256"] or
            archived.get("requiredTileIds") != expected["requiredTileIds"]):
        raise ValueError("Source WFS or pinned OSM geometry mismatch")

    checked = evaluate(expected, json.loads(raw))
    if not checked["coverageMetadataComplete"] or checked["requiredTileCount"] != 24:
        raise ValueError("Incomplete authentic IGN MNT metadata coverage")
    selected = select_next(checked["requiredTileIds"])
    official = {row["tile"]: row for row in checked["officialMntCandidates"]}

    report = {
        "status": "started", "stage": "real_MNT_batch_three_diagnostic_only",
        "osmSourceSHA256": expected["sourceSHA256"], "wfsSourceSHA256": original_sha,
        "requiredTileCount": 24, "previouslyVerifiedTileIds": sorted(VERIFIED_BEFORE),
        "selectedTileIds": selected, "rasters": [], "edgeDiagnostics": [],
        "readyFor3D": False,
    }
    args.work.mkdir(parents=True, exist_ok=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    arrays = {}
    try:
        for key in selected:
            source = official[key]
            url = verify_source_url(source["downloadURL"], key)
            raster_path = args.work / (key + ".tif")
            byte_count = download(url, raster_path)
            ds = validate_raster(raster_path, key)
            stats, arr, mask = raster_stats(ds)
            arrays[key] = (arr, mask)
            report["rasters"].append({
                "tile": key, "sha256": sha256(raster_path),
                "sizeBytes": byte_count, "edition": source["edition"],
                "mission": source["mission"], **stats,
            })
            ds = None
            print("Verified official Jandri MNT", key, stats, flush=True)
        report["edgeDiagnostics"] = edge_checks(arrays)
        if any(entry.get("status") == "blocked_no_valid_shared_edge"
               for entry in report["edgeDiagnostics"]):
            raise ValueError("Adjacent terrain has no valid shared edge")
        report["status"] = "six_new_tiles_verified_not_terrain_certified"
        print("Jandri MNT batch three: six distinct tiles verified", flush=True)
        print("Edge diagnostics:", report["edgeDiagnostics"], flush=True)
    except Exception as exc:
        report["status"] = "blocked_no_publication"
        report["error"] = str(exc)
        raise
    finally:
        args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
