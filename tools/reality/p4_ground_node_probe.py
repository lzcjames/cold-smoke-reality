#!/usr/bin/env python3
"""Non-publishing ground-DEM probe at two genuine Les Deux Alpes OSM shared nodes.

Read only downloaded original IGN 0.5m *MNT* GeoTIFF tiles and archived real
OSM geometry. Report both adjacent 25m slope deltas in source way order.
No guessed ski direction, no synthetic elevations, and no game pack output.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

from osgeo import gdal, osr

NODES = (6057592057, 6057592113)
WAYS = (219409078, 643745486, 643786947)


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for part in iter(lambda: f.read(1024 * 1024), b""):
            h.update(part)
    return h.hexdigest()


def converter():
    source, target = osr.SpatialReference(), osr.SpatialReference()
    source.ImportFromEPSG(4326)
    target.ImportFromEPSG(2154)
    source.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    target.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    t = osr.CoordinateTransformation(source, target)
    return lambda p: t.TransformPoint(p["lon"], p["lat"])[:2]


def terrain_sampler(paths):
    datasets = []
    for path in paths:
        ds = gdal.Open(str(path), gdal.GA_ReadOnly)
        if ds is None:
            raise ValueError("Not a readable GeoTIFF: " + str(path))
        ref = ds.GetSpatialRef()
        if ref is None or ref.GetAuthorityCode(None) != "2154":
            raise ValueError("IGN tile must be EPSG:2154: " + str(path))
        if ds.RasterCount < 1:
            raise ValueError("IGN tile lacks ground-elevation band")
        gt = ds.GetGeoTransform()
        if abs(gt[2]) > 1e-9 or abs(gt[4]) > 1e-9:
            raise ValueError("Rotated source grid not supported")
        if abs(abs(gt[1]) - 0.5) > 0.01 or abs(abs(gt[5]) - 0.5) > 0.01:
            raise ValueError("Expected actual 0.5m IGN MNT source pixels")
        datasets.append((str(path), ds, gdal.InvGeoTransform(gt)))

    def sample(x, y):
        for path, ds, inverse in datasets:
            u, v = gdal.ApplyGeoTransform(inverse, x, y)
            i, j = math.floor(u), math.floor(v)
            if not (0 <= i < ds.RasterXSize - 1 and 0 <= j < ds.RasterYSize - 1):
                continue
            band = ds.GetRasterBand(1)
            nodata = band.GetNoDataValue()
            cells = band.ReadAsArray(i, j, 2, 2)
            values = [float(cells[r, c]) for r in range(2) for c in range(2)]
            if any(not math.isfinite(a) or a < 0 or a >= 5000 or
                   (nodata is not None and a == nodata) for a in values):
                raise ValueError("Invalid or nodata MNT pixels at %.2f %.2f" % (x, y))
            a, b = u-i, v-j
            return ((1-b)*((1-a)*values[0]+a*values[1]) +
                    b*((1-a)*values[2]+a*values[3]))
        raise ValueError("Missing original 0.5m MNT coverage at %.2f %.2f" % (x, y))
    return sample


def along(coords, index, direction, distance=25.0):
    """Interpolated 25m point along an actual OSM polyline from a shared node."""
    current, walked, j = coords[index], 0.0, index
    while 0 <= j + direction < len(coords):
        neighbour = coords[j + direction]
        length = math.dist(current, neighbour)
        if length > 0:
            if walked + length >= distance:
                t = (distance - walked) / length
                return [current[0] + (neighbour[0] - current[0]) * t,
                        current[1] + (neighbour[1] - current[1]) * t], distance
            walked += length
        j += direction
        current = neighbour
    return current, walked


def probe(osm, paths):
    document = json.loads(osm.read_text())
    stamp = document.get("osm3s", {}).get("timestamp_osm_base")
    if stamp != "2026-07-24T11:04:51Z":
        raise ValueError("Unexpected source snapshot; do not conflate OSM editions")
    paths = list(paths)
    sample = terrain_sampler(paths)
    project = converter()
    ways = {w["id"]: w for w in document.get("elements", [])
            if w.get("type") == "way" and w.get("id") in WAYS}
    if len(ways) != 3:
        raise ValueError("Missing original 3 OSM candidate ways")
    rows = []
    for node in NODES:
        connected = []
        for way_id, way in sorted(ways.items()):
            if node not in way["nodes"]:
                continue
            index = way["nodes"].index(node)
            coords = [project(p) for p in way["geometry"]]
            hnode = sample(*coords[index])
            previous, prev_length = along(coords, index, -1)
            following, next_length = along(coords, index, +1)
            before = sample(*previous) if prev_length >= 12 else None
            after = sample(*following) if next_length >= 12 else None
            connected.append({
                "wayId": way_id,
                "name": way.get("tags", {}).get("piste:name") or way.get("tags", {}).get("name"),
                "nodeHeightM": round(hnode, 3),
                "previousMinusNodeM": round(before - hnode, 3) if before is not None else None,
                "nodeMinusNextM": round(hnode - after, 3) if after is not None else None,
                "previousLengthM": round(prev_length, 2),
                "nextLengthM": round(next_length, 2),
            })
        if len(connected) < 2:
            raise ValueError("Expected exact OSM shared node %s is absent" % node)
        rows.append({"osmNode": node, "ways": connected})
    return {
        "status": "measured_ground_elevation_only_no_gameplay_publication",
        "osmTimestampUTC": stamp,
        "sourceOSMSha256": sha256(osm),
        "sourceDEM": "IGN LiDAR HD 0.5m MNT EPSG:2154; verify licence per tile",
        "sourceTiles": [{"file": p.name, "sha256": sha256(p)} for p in paths],
        "interpretation": "Original OSM way order, NOT normalized downhill directions. Positive previousMinusNode means downhill arriving; positive nodeMinusNext means downhill departing. The game still validates full primary piste and forks separately.",
        "nodeChecks": rows,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--osm", type=Path, required=True)
    p.add_argument("--dem", type=Path, action="append", required=True)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()
    if len(args.dem) != 2:
        p.error("Provide exactly the two surveyed real node-covering IGN tiles")
    result = probe(args.osm, args.dem)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(result["nodeChecks"], indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
