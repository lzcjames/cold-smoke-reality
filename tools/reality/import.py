#!/usr/bin/env python3
"""Build a named resort runtime asset from a DEM and an Overpass export."""

import argparse
import json
import math
import re
from pathlib import Path

import numpy as np
from osgeo import gdal, osr

# Alpe d'Huez core and the slopes above it (WGS84 south, west, north, east).
PISTE_BOUNDS = (45.072, 6.050, 45.128, 6.125)
CROP_BOUNDS = (6.025, 45.050, 6.150, 45.145)
STEP = 15
SOURCES = {
    "ign": "IGN RGE ALTI® · Licence Ouverte 2.0",
    "copernicus": "Copernicus DEM GLO-30 · European Union / Airbus",
}


def spatial_reference(epsg):
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(epsg)
    srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return srs


def centreline(document, elevation, way_id, piste_bounds=PISTE_BOUNDS):
    transform = osr.CoordinateTransformation(spatial_reference(4326), spatial_reference(2154))
    options = []
    for way in document["elements"]:
        tags = way.get("tags", {})
        name = tags.get("piste:name") or tags.get("name")
        if (way["type"] != "way" or tags.get("piste:type") != "downhill"
                or not name or tags.get("area") == "yes"
                or (way_id is not None and way["id"] != way_id)):
            continue
        points = []
        for item in way.get("geometry", []):
            lat, lon = item["lat"], item["lon"]
            south, west, north, east = piste_bounds
            if not (south <= lat <= north and west <= lon <= east):
                break
            e, n, _ = transform.TransformPoint(lon, lat)
            point = [round(e, 2), round(n, 2)]
            if not points or points[-1] != point:
                points.append(point)
        else:
            if len(points) < 2:
                continue
            h0, h1 = elevation(*points[0]), elevation(*points[-1])
            if h0 < h1:
                points.reverse()
                h0, h1 = h1, h0
            e0, n0 = points[0]
            de, dn = points[-1][0] - e0, points[-1][1] - n0
            length = math.hypot(de, dn)
            if length < 50 or h0 - h1 < 25:
                continue
            offsets = [((e - e0) * de + (n - n0) * dn) / length for e, n in points]
            if any(b <= a for a, b in zip(offsets, offsets[1:])):
                continue

            def sample_run(s):
                for i, end in enumerate(offsets[1:]):
                    if s <= end:
                        mix = (s - offsets[i]) / (end - offsets[i])
                        return elevation(*(a + mix * (b - a) for a, b in zip(points[i], points[i + 1])))
                return h1

            if sample_run(14) <= sample_run(22):
                continue
            piste = {"osmWay": way["id"], "name": name, "points": points}
            if tags.get("piste:difficulty"):
                piste["difficulty"] = tags["piste:difficulty"]
            options.append((h0 - h1, way["id"], piste))
    if not options:
        raise ValueError("No named downhill OSM way fits the DEM and the single-piste MVP.")
    return max(options, key=lambda option: option[:2])[2]


def build(dem, osm, source, way_id, resort_id='alpe-dhuez',
          crop_bounds=CROP_BOUNDS, piste_bounds=PISTE_BOUNDS):
    gdal.UseExceptions()
    raster = gdal.Warp(
        "", str(dem), format="MEM", dstSRS="EPSG:2154", outputBounds=crop_bounds,
        outputBoundsSRS="EPSG:4326", xRes=STEP, yRes=STEP, resampleAlg="bilinear",
        outputType=gdal.GDT_Float32, dstNodata=-9999,
    )
    heights = raster.GetRasterBand(1).ReadAsArray().round(2)
    rows, cols = heights.shape
    if not np.isfinite(heights).all() or (heights < 0).any() or (heights >= 5000).any():
        raise ValueError("The DEM must cover the entire crop with valid metre elevations.")
    x0, _, _, y0, _, _ = raster.GetGeoTransform()
    east, north = x0 + STEP / 2, y0 - STEP / 2

    def elevation(e, n):
        u, v = (e - east) / STEP, (north - n) / STEP
        i, j = math.floor(u), math.floor(v)
        if not (0 <= i < cols - 1 and 0 <= j < rows - 1):
            raise ValueError("Piste is outside the DEM crop.")
        t, w = u - i, v - j
        return float((1 - w) * ((1 - t) * heights[j, i] + t * heights[j, i + 1])
                     + w * ((1 - t) * heights[j + 1, i] + t * heights[j + 1, i + 1]))

    piste = centreline(json.loads(osm.read_text()), elevation, way_id, piste_bounds)
    return {
        "version": 1, "id": resort_id, "elevationSource": SOURCES[source], "piste": piste,
        "grid": {"cols": cols, "rows": rows, "step": STEP, "east": east, "north": north,
                 "heights": np.round(heights.astype(float), 2).ravel().tolist()},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dem", type=Path, required=True, help="Local georeferenced DEM raster")
    parser.add_argument("--osm", type=Path, required=True, help="Overpass JSON with way geometry")
    parser.add_argument("--source", choices=SOURCES, required=True)
    parser.add_argument("--way", type=int, help="Select a specific named OSM downhill way")
    parser.add_argument("--resort-id", default="alpe-dhuez", help="Catalog slug for the resort")
    parser.add_argument("--crop-bounds", nargs=4, type=float, metavar=("W", "S", "E", "N"),
                        default=CROP_BOUNDS, help="WGS84 raster crop bounds")
    parser.add_argument("--piste-bounds", nargs=4, type=float, metavar=("S", "W", "N", "E"),
                        default=PISTE_BOUNDS, help="WGS84 valid piste region")
    parser.add_argument("--out", type=Path, help="Output JSON; defaults to data/reality/<resort-id>.json")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", args.resort_id):
        parser.error("--resort-id must be a safe lowercase slug")
    w, south, e, north = args.crop_bounds
    if not (-180 <= w < e <= 180 and -90 <= south < north <= 90):
        parser.error("Invalid --crop-bounds")
    south, w, north, e = args.piste_bounds
    if not (-90 <= south < north <= 90 and -180 <= w < e <= 180):
        parser.error("Invalid --piste-bounds")
    asset = build(args.dem, args.osm, args.source, args.way,
                  args.resort_id, args.crop_bounds, args.piste_bounds)
    out = args.out or Path("data/reality") / (args.resort_id + ".json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(asset, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f'{out} · {asset["piste"]["name"]} · OSM way {asset["piste"]["osmWay"]}')


if __name__ == "__main__":
    main()
