#!/usr/bin/env python3
"""Make a small, *unpublished* measured DEM for any pinned OSM piste selection.

Must receive already-verified official high-resolution source files and a
source-only audit report. Never interpolates across nodata or invents terrain.
The output is an import candidate, NOT a skiable resort pack.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

def hash_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def validate_sources(report, tiles_directory, *, expected_tiles=24):
    if (report.get("status") != "complete_real_mosaic_and_profiles_not_published"
            or len(report.get("sourceTiles", [])) != expected_tiles
            or len(report.get("osmWayProfiles", [])) < 1
            or not report.get("crossTileEdges")):
        raise ValueError("No complete audited official source mosaic")
    found = set()
    for tile in report["sourceTiles"]:
        key = tile.get("tile")
        if (not isinstance(key, str) or not key.replace("-", "").isdigit()
                or key in found or not isinstance(tile.get("sha256"), str)
                or len(tile["sha256"]) != 64):
            raise ValueError("Invalid original DEM tile manifest")
        found.add(key)
        path = Path(tiles_directory) / (key + ".tif")
        if not path.is_file() or hash_file(path) != tile["sha256"]:
            raise ValueError("Actual original DEM source checksum mismatch: " + key)
    return sorted(found)

def source_ways(index, name):
    if (index.get("source") != "OpenStreetMap / Overpass"
            or not isinstance(index.get("features"), list)
            or not isinstance(index.get("originalResponseSHA256"), str)
            or len(index["originalResponseSHA256"]) != 64):
        raise ValueError("Not a pinned authentic OSM index")
    ways = [w for w in index["features"]
            if w.get("type") == "way" and w.get("drawable") is True
            and name in w.get("names", [])]
    if not ways:
        raise ValueError("OSM selection has no true downhill piste ways")
    ids = set()
    for way in ways:
        nodes, coords = way.get("nodes"), way.get("coordinates")
        if (not isinstance(nodes, list) or not isinstance(coords, list)
                or len(nodes) != len(coords) or len(nodes) < 2
                or len(set(nodes)) != len(nodes) or way["id"] in ids
                or way.get("tags", {}).get("piste:type") != "downhill"):
            raise ValueError("Invalid pinned OSM way topology")
        ids.add(way["id"])
    return ways

def measured_grid(ways, project, sample_height, *, step_m=15,
                  margin_m=45, max_cells=1200 * 1200):
    if (not 2 <= step_m <= 60 or not 20 <= margin_m <= 500
            or not isinstance(max_cells, int) or max_cells < 4):
        raise ValueError("Invalid measured terrain pack size")
    projected = []
    for way in ways:
        points = []
        for lon, lat in way["coordinates"]:
            point = project(lon, lat)
            if (not isinstance(point, (list, tuple)) or len(point) < 2
                    or not all(math.isfinite(x) for x in point[:2])):
                raise ValueError("Coordinate transform does not yield real metres")
            points.append((float(point[0]), float(point[1])))
        projected.append(points)
    xs = [x for route in projected for x, _ in route]
    ys = [y for route in projected for _, y in route]
    left = math.floor((min(xs) - margin_m) / step_m) * step_m
    right = math.ceil((max(xs) + margin_m) / step_m) * step_m
    bottom = math.floor((min(ys) - margin_m) / step_m) * step_m
    top = math.ceil((max(ys) + margin_m) / step_m) * step_m
    cols = round((right - left) / step_m) + 1
    rows = round((top - bottom) / step_m) + 1
    if cols < 2 or rows < 2 or cols > 1200 or rows > 1200 or cols * rows > max_cells:
        raise ValueError("Fine ground extent is too large for a single browser pack; tile it")
    heights = []
    for j in range(rows):
        y = top - j * step_m
        for i in range(cols):
            x = left + i * step_m
            h = sample_height(x, y)
            if not isinstance(h, (float, int)) or not math.isfinite(h) or not -100 < h < 6000:
                raise ValueError("Unmeasured source terrain in full grid at cell %d,%d" % (i, j))
            heights.append(round(float(h), 2))
    # The grid itself is NOT enough: verify every original line at <=5m,
    # and ensure its source centreline remains well away from output borders.
    line_samples = 0
    for points in projected:
        for x, y in points:
            if not (left + margin_m / 2 <= x <= right - margin_m / 2
                    and bottom + margin_m / 2 <= y <= top - margin_m / 2):
                raise ValueError("Source line lacks output grid margin")
        for a, b in zip(points, points[1:]):
            d = math.dist(a, b)
            if d <= 0:
                raise ValueError("Repeated projected OSM way node")
            steps = math.ceil(d / min(step_m / 2, 5))
            if steps > 100000:
                raise ValueError("Unbounded source segment")
            for j in range(steps + 1):
                t = j / steps
                h = sample_height(a[0] * (1 - t) + b[0] * t,
                                  a[1] * (1 - t) + b[1] * t)
                if not isinstance(h, (float, int)) or not math.isfinite(h) or not -100 < h < 6000:
                    raise ValueError("Unmeasured original line interior")
                line_samples += 1
    return {"grid": {"cols": cols, "rows": rows, "step": step_m,
                     "east": left, "north": top, "heights": heights},
            "verifiedSourceLineSamples": line_samples,
            "originalSourceWays": [w["id"] for w in ways],
            "approxUncompressedHeightBytes": cols * rows * 4}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--mosaic", type=Path, required=True)
    parser.add_argument("--tiles-dir", type=Path, required=True)
    parser.add_argument("--name", default="Jandri 2")
    parser.add_argument("--step", type=int, default=15)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    index = json.loads(args.index.read_text())
    report = json.loads(args.report.read_text())
    validated_tiles = validate_sources(report, args.tiles_dir)
    ways = source_ways(index, args.name)
    profiles = {p["osmWay"] for p in report["osmWayProfiles"]}
    if any(w["id"] not in profiles for w in ways):
        raise ValueError("Missing independent measured OSM source profiles")
    from osgeo import gdal, osr
    try:
        from .jandri_full_mnt_mosaic import sampled_height
    except ImportError:
        from jandri_full_mnt_mosaic import sampled_height
    src, dst = osr.SpatialReference(), osr.SpatialReference()
    src.ImportFromEPSG(4326)
    dst.ImportFromEPSG(2154)
    for s in (src, dst):
        s.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    project = osr.CoordinateTransformation(src, dst)
    gdal.UseExceptions()
    ds = gdal.Open(str(args.mosaic))
    if ds is None or ds.RasterCount != 1 or not ds.GetSpatialRef().IsSame(dst):
        raise ValueError("Only genuine verified Lambert-93 source MNT mosaic accepted")
    candidate = measured_grid(ways,
        lambda lon, lat: project.TransformPoint(lon, lat)[:2],
        lambda x, y: sampled_height(ds, x, y),
        step_m=args.step)
    asset = {"schema": "cold-smoke-measured-dem-staging/v1",
             "resortId": "les-deux-alpes",
             "routeName": args.name, "sourceOSMSHA256": index["originalResponseSHA256"],
             "originalTiles": validated_tiles,
             "sourceReportStatus": report["status"],
             "sourcePixelVerifiedByAudit": True,
             "approvedForGameplay": False, "mergedIntoResort": False,
             **candidate}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    packed = json.dumps(asset, separators=(",", ":")) + "\n"
    # This is an intentionally lightweight standalone browser resource.
    # Never let a large grid silently bloat the HTML entry point or cache.
    if len(packed.encode("utf-8")) > 2 * 1024 * 1024:
        raise ValueError("Measured DEM staging JSON exceeds 2 MiB; split into geographic tiles")
    args.out.write_text(packed)
    print("Source-only browser DEM candidate:", len(ways), "ways;",
          candidate["grid"]["cols"], "x", candidate["grid"]["rows"],
          "at", args.step, "m; NOT published")

if __name__ == "__main__":
    main()
