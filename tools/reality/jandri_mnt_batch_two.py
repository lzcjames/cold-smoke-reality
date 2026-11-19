#!/usr/bin/env python3
"""Second small Jandri MNT audit batch (real raster data; never publish).

Uses the pinned 24-tile WFS archive and validates four *new* official MNT
GeoTIFFs. Edge differences are diagnostic only; natural cliffs may create
large legitimate height jumps, so no artificial smoothing or stitching.
"""
import argparse
import hashlib
import json
from pathlib import Path

from jandri_mnt_coverage import evaluate, plan
from p4_full_ground_gate import download, sha256, validate_raster, verify_source_url


# Exact IDs already confirmed in two-tile pilot 44636013026.
PILOT_TILES = frozenset({"0945-6438", "0946-6438"})


def batch_keys(all_keys, count=4, excluded=PILOT_TILES):
    ordered = sorted(set(all_keys))
    if len(ordered) != len(all_keys) or not excluded.issubset(set(ordered)) or count < 1:
        raise ValueError("Invalid bounded MNT batch")
    pending = [tile for tile in ordered if tile not in excluded]
    if count > len(pending):
        raise ValueError("Requested batch exceeds unverified MNT inventory")
    return pending[:count]


def raster_stats(ds):
    import numpy as np
    band = ds.GetRasterBand(1)
    arr = band.ReadAsArray()
    nodata = band.GetNoDataValue()
    valid = np.isfinite(arr)
    if nodata is not None:
        valid &= arr != nodata
    valid &= (arr > -100) & (arr < 6000)
    if not valid.any():
        raise ValueError("Raster contains no valid ground elevation")
    return {
        "validFraction": round(float(valid.mean()), 6),
        "minM": round(float(arr[valid].min()), 3),
        "maxM": round(float(arr[valid].max()), 3),
        "nodata": nodata
    }, arr, valid


def edge_checks(rasters):
    import numpy as np
    results = []
    for key, (arr, valid) in sorted(rasters.items()):
        x, y = (int(n) for n in key.split("-"))
        for neighbour, axis in ((f"{x+1:04d}-{y:04d}", "east"),
                                (f"{x:04d}-{y+1:04d}", "north")):
            if neighbour not in rasters:
                continue
            other, mask = rasters[neighbour]
            if axis == "east":
                a, b = arr[:, -1], other[:, 0]
                paired = valid[:, -1] & mask[:, 0]
            else:
                # Dataset rows increase from geographic north to south.
                a, b = arr[0, :], other[-1, :]
                paired = valid[0, :] & mask[-1, :]
            if not paired.any():
                results.append({"tileA": key, "tileB": neighbour,
                                "edge": axis, "status": "blocked_no_valid_shared_edge"})
                continue
            delta = np.abs(a[paired].astype(float) - b[paired].astype(float))
            results.append({"tileA": key, "tileB": neighbour, "edge": axis,
                            "validPairs": int(paired.sum()),
                            "maxAbsDifferenceM": round(float(delta.max()), 3),
                            "p95AbsDifferenceM": round(float(np.percentile(delta, 95)), 3)})
    return results


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
    project = osr.CoordinateTransformation(geo, lambert)
    index = json.loads(args.index.read_text())
    expected = plan(index, lambda lon, lat: project.TransformPoint(lon, lat)[:2])
    metadata = json.loads(args.metadata.read_text())
    raw = args.wfs.read_bytes()
    if metadata.get("wfsSourceSHA256") != hashlib.sha256(raw).hexdigest() or (
        metadata.get("requiredTileIds") != expected["requiredTileIds"]
    ) or metadata.get("sourceSHA256") != expected["sourceSHA256"]:
        raise ValueError("Archived WFS or geometry checksum/coverage mismatch")
    checked = evaluate(expected, json.loads(raw))
    if not checked["coverageMetadataComplete"] or checked["requiredTileCount"] != 24:
        raise ValueError("Incomplete pinned real 24-tile MNT metadata coverage")
    ids = batch_keys(checked["requiredTileIds"])
    approved = {row["tile"]: row for row in checked["officialMntCandidates"]}
    args.work.mkdir(parents=True, exist_ok=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    report = {"status": "started", "stage": "real_MNT_raster_audit_only",
              "allRequiredTiles": 24, "previouslyVerifiedTileIds": sorted(PILOT_TILES), "sampleTileIds": ids,
              "rasters": [], "edgeDiagnostics": [], "readyFor3D": False}
    data = {}
    try:
        for key in ids:
            url = verify_source_url(approved[key]["downloadURL"], key)
            path = args.work / (key + ".tif")
            size = download(url, path)
            ds = validate_raster(path, key)
            stats, arr, valid = raster_stats(ds)
            data[key] = (arr, valid)
            report["rasters"].append({"tile": key, "sizeBytes": size,
                                      "originalSHA256": sha256(path),
                                      "edition": approved[key]["edition"],
                                      "mission": approved[key]["mission"], **stats})
            ds = None
            print("Validated authentic IGN MNT", key, stats, flush=True)
        report["edgeDiagnostics"] = edge_checks(data)
        report["status"] = "batch_verified_not_terrain_certified"
        print("Neighbour edge checks:", report["edgeDiagnostics"], flush=True)
    except Exception as exc:
        report["status"] = "blocked_no_publication"
        report["error"] = str(exc)
        raise
    finally:
        args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
