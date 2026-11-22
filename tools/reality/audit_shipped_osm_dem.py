#!/usr/bin/env python3
"""Audit original pinned Jandri OSM lines against the DEM shipped in the game.

Source-only inspection. No raster downloads or changes to the playable resort.
Requires python3-gdal only when running the CLI (tests inject a projection).
"""
import argparse
import json
import math
from pathlib import Path


def bilinear(grid, east, north, margin_m=0):
    cols, rows, step = grid["cols"], grid["rows"], grid["step"]
    x = (east - grid["east"]) / step
    y = (grid["north"] - north) / step
    border = margin_m / step
    if (not math.isfinite(x) or not math.isfinite(y) or
        x < border or y < border or x > cols - 1 - border or
        y > rows - 1 - border):
        return None
    i, j = min(cols - 2, math.floor(x)), min(rows - 2, math.floor(y))
    tx, ty = x - i, y - j
    k = j * cols + i
    h = grid["heights"]
    q = (h[k], h[k + 1], h[k + cols], h[k + cols + 1])
    if not all(isinstance(v, (int, float)) and math.isfinite(v)
               and 0 <= v < 6000 for v in q):
        return None
    return ((q[0] * (1 - tx) + q[1] * tx) * (1 - ty) +
            (q[2] * (1 - tx) + q[3] * tx) * ty)


def inspect(index, asset, project, names=("Jandri 2",), step_m=5,
            margin_m=20):
    if (index.get("source") != "OpenStreetMap / Overpass" or
        not isinstance(index.get("originalResponseSHA256"), str) or
        len(index["originalResponseSHA256"]) != 64 or
        asset.get("id") != "les-deux-alpes" or
        not isinstance(asset.get("grid", {}).get("heights"), list)):
        raise ValueError("Pinned real OSM index and shipped measured resort required")
    grid = asset["grid"]
    if (len(grid["heights"]) != grid["rows"] * grid["cols"] or
        not 0 < step_m <= 30 or margin_m < 0):
        raise ValueError("Invalid source grid or audit spacing")
    routes = []
    for way in index["features"]:
        if (way.get("type") != "way" or not way.get("drawable") or
            not any(n in names for n in way.get("names", []))):
            continue
        pts = way.get("coordinates", [])
        nodes = way.get("nodes", [])
        if (len(pts) < 2 or len(nodes) != len(pts) or
            len(set(nodes)) != len(nodes)):
            raise ValueError("Invalid original node and coordinate alignment")
        projected = [project(*p) for p in pts]
        if any(len(p) != 2 or not all(math.isfinite(v) for v in p)
               for p in projected):
            raise ValueError("Invalid authenticated coordinate transform")
        covered_vertex_count = sum(
            bilinear(grid, *p, margin_m) is not None for p in projected)
        missing_edges = []
        covered_segments = 0
        length = 0.0
        for i, (a, b) in enumerate(zip(projected, projected[1:]), 1):
            distance = math.dist(a, b)
            if not distance > 0 or not math.isfinite(distance):
                raise ValueError("Zero-length source route edge")
            length += distance
            parts = math.ceil(distance / step_m)
            if parts > 100000:
                raise ValueError("Unbounded route edge")
            complete = True
            for k in range(parts + 1):
                t = k / parts
                e, n = a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])
                if bilinear(grid, e, n, margin_m) is None:
                    complete = False
                    break
            if complete:
                covered_segments += 1
            else:
                missing_edges.append(i)
        routes.append({
            "osmWay": way["id"], "name": way["names"],
            "nodeCount": len(nodes), "totalSegments": len(pts) - 1,
            "sourceLengthM": round(length, 2),
            "coveredVertices": covered_vertex_count,
            "coveredSegments": covered_segments,
            "uncoveredSegmentIndices": missing_edges,
            "fullCentrelineDetailAndMargin": not missing_edges,
            "approvedForGameplay": False,
        })
    if not routes:
        raise ValueError("No source ways matched the requested route names")
    return {
        "schema": "cold-smoke-shipped-dem-coverage/v1",
        "resortId": asset["id"],
        "osmIndexSHA256": index["originalResponseSHA256"],
        "assetDemSHA256": asset.get("provenance", {}).get("demSha256"),
        "marginM": margin_m, "samplingStepM": step_m,
        "sourceWayCount": len(routes),
        "fullyDetailedWayCount": sum(r["fullCentrelineDetailAndMargin"]
                                      for r in routes),
        "noGameplayAuthorization": True,
        "ways": routes,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--index", default="docs/p4/JANDRI-OSM-INDEX.json")
    ap.add_argument("--asset", default="data/reality/les-deux-alpes.json")
    ap.add_argument("--name", action="append", default=None)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    from osgeo import osr
    src, dst = osr.SpatialReference(), osr.SpatialReference()
    src.ImportFromEPSG(4326)
    dst.ImportFromEPSG(2154)
    for spatial in (src, dst):
        spatial.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    transform = osr.CoordinateTransformation(src, dst)
    report = inspect(json.loads(Path(args.index).read_text()),
                     json.loads(Path(args.asset).read_text()),
                     lambda lon, lat: transform.TransformPoint(lon, lat)[:2],
                     names=tuple(args.name or ["Jandri 2"]))
    target = Path(args.out)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print("REAL shipped DEM covered ways:",
          report["fullyDetailedWayCount"], "/", report["sourceWayCount"],
          "(NOT proof of groomed piste access)")


if __name__ == "__main__":
    main()
