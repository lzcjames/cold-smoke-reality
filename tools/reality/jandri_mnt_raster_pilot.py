#!/usr/bin/env python3
"""Download exactly two adjacent genuine IGN Jandri MNT rasters for a CI pilot.

Only source hashes and diagnostic values are emitted; rasters stay in /tmp.
No geometry extrapolation, fallback elevations, or publishing.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

from jandri_mnt_coverage import evaluate, plan
from p4_full_ground_gate import download, sha256, validate_raster, verify_source_url


def choose_adjacent(required):
    """Deterministic cardinal-neighbour tile pair from genuine coverage."""
    keys = set(required)
    for left in sorted(keys):
        x, y = map(int, left.split("-"))
        for right in (f"{x+1:04d}-{y:04d}", f"{x:04d}-{y+1:04d}"):
            if right in keys:
                return left, right
    raise ValueError("No adjacent MNT tiles in required footprint")


def evaluate_archive(report, raw):
    """Do not trust a derived report unless it matches archived WFS bytes."""
    if hashlib.sha256(raw).hexdigest() != report.get("wfsSourceSHA256"):
        raise ValueError("WFS archive SHA256 mismatch")
    source = json.loads(raw)
    if report.get("sourceSHA256") != report.get("sourceSHA256"):
        raise ValueError("Invalid report")
    checked = evaluate(report, source)
    if not checked["coverageMetadataComplete"] or checked["requiredTileCount"] != 24:
        raise ValueError("Jandri MNT coverage incomplete or changed")
    return checked


def raster_diagnostics(ds):
    import numpy as np
    band = ds.GetRasterBand(1)
    arr = band.ReadAsArray()
    nodata = band.GetNoDataValue()
    valid = np.isfinite(arr)
    if nodata is not None:
        valid &= arr != nodata
    valid &= (arr > -100) & (arr < 6000)
    count = int(valid.sum())
    if not count:
        raise ValueError("No valid ground heights in MNT raster")
    good = arr[valid]
    return {"validFraction": round(count / arr.size, 6),
            "minimumM": float(good.min()), "maximumM": float(good.max()),
            "nodataValue": nodata}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", type=Path, default=Path("docs/p4/JANDRI-OSM-INDEX.json"))
    parser.add_argument("--wfs", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    from osgeo import osr
    geo, lambert = osr.SpatialReference(), osr.SpatialReference()
    geo.ImportFromEPSG(4326)
    lambert.ImportFromEPSG(2154)
    for s in (geo, lambert):
        s.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    transform = osr.CoordinateTransformation(geo, lambert)
    index = json.loads(args.index.read_text())
    expected = plan(index, lambda lon, lat: transform.TransformPoint(lon, lat)[:2])
    archived = json.loads(args.metadata.read_text())
    raw = args.wfs.read_bytes()
    if archived.get("sourceSHA256") != expected["sourceSHA256"] or (
            archived.get("requiredTileIds") != expected["requiredTileIds"]):
        raise ValueError("Archived MNT coverage report mismatches original OSM geometry")
    checked = evaluate_archive(archived, raw)
    selected = choose_adjacent(checked["requiredTileIds"])
    approved = {r["tile"]: r for r in checked["officialMntCandidates"]}
    manifest = {"stage": "two_real_rasters_diagnostic_only_not_published",
                "osmSourceSHA256": index["originalResponseSHA256"],
                "wfsSourceSHA256": hashlib.sha256(raw).hexdigest(),
                "requiredMetadataTiles": len(checked["requiredTileIds"]),
                "rasterCount": 0, "selectedTiles": list(selected), "rasters": [],
                "readyFor3D": False}
    args.work.mkdir(parents=True, exist_ok=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    try:
        for tile in selected:
            source = approved[tile]
            url = verify_source_url(source["downloadURL"], tile)
            target = args.work / (tile + ".tif")
            size = download(url, target)
            ds = validate_raster(target, tile)
            info = raster_diagnostics(ds)
            ds = None
            manifest["rasters"].append({
                "tile": tile, "sha256": sha256(target), "sizeBytes": size,
                "edition": source["edition"], "mission": source["mission"],
                **info})
            manifest["rasterCount"] += 1
            print("Verified genuine IGN MNT:", tile, info, flush=True)
        manifest["status"] = "sample_rasters_verified_no_terrain_publication"
    except Exception as exc:
        manifest["status"] = "blocked_no_publication"
        manifest["error"] = str(exc)
        raise
    finally:
        args.out.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
