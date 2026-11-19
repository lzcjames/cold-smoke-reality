#!/usr/bin/env python3
"""Validate a complete real Les Deux Alpes 3-way import without publishing it.

Inputs must be the pinned genuine Overpass snapshot and official IGN LiDAR HD
WFS metadata. Retrieve only tiles covering the full crop and use a temporary
VRT mosaic. All source GeoTIFF SHA-256 values are written to a source manifest.
Neither the raw DEMs nor the candidate gameplay JSON enter the release.
"""
import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

from osgeo import gdal, osr

PRIMARY = 219409078
NEIGHBOURS = (643745486, 643786947)
OSM_STAMP = "2026-07-24T11:04:51Z"
WFS_LAYER = "IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93"


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def coordinates(document):
    if document.get("osm3s", {}).get("timestamp_osm_base") != OSM_STAMP:
        raise ValueError("Unexpected OSM edition; select only pinned real survey")
    wanted = {PRIMARY, *NEIGHBOURS}
    selected = [w for w in document.get("elements", [])
                if w.get("type") == "way" and w.get("id") in wanted]
    if len(selected) != 3 or {w["id"] for w in selected} != wanted:
        raise ValueError("Missing exact selected OSM way geometry")
    for w in selected:
        if len(w.get("nodes", [])) != len(w.get("geometry", [])):
            raise ValueError("Original OSM node/geometry mismatch")
        if w.get("tags", {}).get("piste:type") != "downhill":
            raise ValueError("Selected way is not an OSM downhill piste")
    coords = [p for w in selected for p in w["geometry"]]
    west, east = min(p["lon"] for p in coords), max(p["lon"] for p in coords)
    south, north = min(p["lat"] for p in coords), max(p["lat"] for p in coords)
    # The published game samples an EPSG:2154 grid with a strict 20m border.
    # 0.0025 degrees is a conservative 200m+ screening margin.
    crop = [west - .0025, south - .0025, east + .0025, north + .0025]
    piste_bounds = [south - .000001, west - .000001, north + .000001, east + .000001]
    return selected, crop, piste_bounds


def tile_keys(crop):
    geo, lambert = osr.SpatialReference(), osr.SpatialReference()
    geo.ImportFromEPSG(4326)
    lambert.ImportFromEPSG(2154)
    for srs in (geo, lambert):
        srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    transform = osr.CoordinateTransformation(geo, lambert)
    west, south, east, north = crop
    points = [transform.TransformPoint(lon, lat) for lon in (west, east)
              for lat in (south, north)]
    # Include projected bounding rectangle plus an extra interpolation border.
    min_x, max_x = min(p[0] for p in points) - 25, max(p[0] for p in points) + 25
    min_y, max_y = min(p[1] for p in points) - 25, max(p[1] for p in points) + 25
    return [
        f"{x:04d}-{y:04d}"
        for x in range(math.floor(min_x / 1000), math.floor(max_x / 1000) + 1)
        for y in range(math.ceil(min_y / 1000), math.ceil(max_y / 1000) + 1)
    ]


def verify_source_url(url, tile):
    parsed = urlparse(url or "")
    params = {k.upper(): values[0] for k, values in parse_qs(parsed.query).items()}
    fn = params.get("FILENAME", "")
    if (parsed.scheme != "https" or parsed.hostname != "data.geopf.fr"
            or parsed.path != "/wms-r" or parsed.username or parsed.password
            or params.get("SERVICE", "").upper() != "WMS"
            or params.get("REQUEST", "").upper() != "GETMAP"
            or params.get("LAYERS") != WFS_LAYER
            or params.get("FORMAT") != "image/geotiff"
            or params.get("CRS") != "EPSG:2154"
            or params.get("WIDTH") != "2000" or params.get("HEIGHT") != "2000"
            or "_MNT_" not in fn or not fn.lower().endswith(".tif")):
        raise ValueError("Not an official 0.5m MNT-only GeoTIFF URL: " + tile)
    return url


def validate_raster(path, tile):
    ds = gdal.Open(str(path))
    if ds is None or ds.RasterCount != 1:
        raise ValueError("Invalid 1-band official ground GeoTIFF: " + tile)
    expected = osr.SpatialReference()
    expected.ImportFromEPSG(2154)
    actual = ds.GetSpatialRef()
    params = ("standard_parallel_1", "standard_parallel_2", "latitude_of_origin",
              "central_meridian", "false_easting", "false_northing")
    if (actual is None or
            not (actual.IsSame(expected) or
                 (actual.GetName() == "EPSG:2154" and
                  actual.GetAttrValue("PROJECTION") == "Lambert_Conformal_Conic_2SP" and
                  all(abs(actual.GetProjParm(k) - expected.GetProjParm(k)) < 1e-6
                      for k in params)))):
        raise ValueError("GeoTIFF projection does not match Lambert-93: " + tile)
    gt = ds.GetGeoTransform()
    x, y = (int(n) for n in tile.split("-"))
    if (ds.RasterXSize != 2000 or ds.RasterYSize != 2000 or
            abs(gt[0] - (1000 * x - .25)) > .01 or
            abs(gt[3] - (1000 * y + .25)) > .01 or
            abs(gt[1] - .5) > 1e-9 or abs(gt[5] + .5) > 1e-9 or
            abs(gt[2]) > 1e-9 or abs(gt[4]) > 1e-9):
        raise ValueError("GeoTIFF location/size differs from actual tile ID: " + tile)
    return ds


def download(url, dest):
    # The same source tiles succeeded in archived run 44546686678, but the
    # public IGN WMS may intermittently return HTTP 400 or 503 under load.
    # Bound attempts; NEVER substitute missing data or ignore invalid images.
    for attempt in range(4):
        size = 0
        try:
            request = Request(url, headers={
                "User-Agent": "ColdSmokeReality/1.0 (real MNT audit)",
                "Accept": "image/geotiff",
            })
            with urlopen(request, timeout=180) as response, dest.open("wb") as out:
                mime = response.headers.get("Content-Type", "").lower()
                if "image" not in mime and "octet-stream" not in mime:
                    raise ValueError("Unexpected response media type: " + mime)
                while True:
                    part = response.read(1024 * 1024)
                    if not part:
                        break
                    size += len(part)
                    if size > 80 * 1024 * 1024:
                        raise ValueError("Unexpectedly large raw DEM")
                    out.write(part)
            if size < 4096:
                raise ValueError("Tiny or empty DEM response")
            return size
        except HTTPError as exc:
            body = exc.read(2048).decode("utf-8", errors="replace")
            print("IGN tile download HTTP", exc.code, "attempt", attempt + 1,
                  "response", repr(body[:500]), flush=True)
            if exc.code not in (400, 408, 429, 500, 502, 503, 504) or attempt == 3:
                raise
        except (URLError, TimeoutError) as exc:
            print("IGN tile download network error", type(exc).__name__,
                  "attempt", attempt + 1, flush=True)
            if attempt == 3:
                raise
        dest.unlink(missing_ok=True)
        time.sleep(6 * (attempt + 1))
    raise RuntimeError("Real MNT source exhausted retry budget")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--osm", required=True, type=Path)
    p.add_argument("--wfs", required=True, type=Path)
    p.add_argument("--work", required=True, type=Path)
    p.add_argument("--report", required=True, type=Path)
    args = p.parse_args()
    args.work.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    report = {"status": "started", "stage": "validation_only_never_publish",
              "osmSha256": sha256(args.osm), "wfsSha256": sha256(args.wfs)}
    try:
        selected, crop, piste_bounds = coordinates(json.loads(args.osm.read_text()))
        wanted = tile_keys(crop)
        report.update({"selectedOSMWays": [PRIMARY, *NEIGHBOURS],
                       "cropWGS84": crop, "pisteBoundsWGS84": piste_bounds,
                       "requiredTiles": wanted})
        index = json.loads(args.wfs.read_text())
        if index.get("type") != "FeatureCollection":
            raise ValueError("Official tile index is not GeoJSON")
        features = {f["properties"].get("coordonnees_nw"): f["properties"]
                    for f in index.get("features", []) if isinstance(f.get("properties"), dict)}
        missing = sorted(set(wanted) - set(features))
        if missing:
            raise ValueError("Official WFS has no metadata for required tiles: " + ",".join(missing))
        wrappers, sources = [], []
        report["sourceTiles"] = sources
        for tile in wanted:
            meta = features[tile]
            url = verify_source_url(meta.get("url_mnt"), tile)
            raster = args.work / (tile + ".tif")
            size = download(url, raster)
            ds = validate_raster(raster, tile)
            # Official WMS TIFF has a named Lambert-93 CRS but may omit its
            # authority/datum ID. The VRT wrapper supplies normalized CRS
            # ONLY after validating the actual projection/grid above.
            wrapper = args.work / (tile + ".vrt")
            gdal.Translate(str(wrapper), ds, format="VRT", outputSRS="EPSG:2154")
            ds = None
            wrappers.append(str(wrapper))
            sources.append({"tile": tile, "sha256": sha256(raster), "bytes": size,
                            "edition": meta.get("date_edition"),
                            "mission": meta.get("code_mission"), "url": url})
            print("Verified actual LiDAR MNT tile", tile, size, flush=True)
        report["sourceTiles"] = sources
        mosaic = args.work / "les-deux-alpes-validated-mnt.vrt"
        if not gdal.BuildVRT(str(mosaic), wrappers):
            raise ValueError("Cannot build measured source-only mosaic")
        out = args.work / "unpublished-validation-only.json"
        cmd = ["/usr/bin/python3", "tools/reality/p4_import.py",
               "--dem", str(mosaic), "--osm", str(args.osm),
               "--source", "ign", "--resort-id", "les-deux-alpes",
               "--primary-way", str(PRIMARY),
               "--neighbour-way", str(NEIGHBOURS[0]),
               "--neighbour-way", str(NEIGHBOURS[1]),
               "--crop-bounds", *map(str, crop),
               "--piste-bounds", *map(str, piste_bounds),
               "--dem-edition", "IGN LiDAR HD 0.5m MNT, original tile hashes in audit manifest",
               "--dem-reference", "https://cartes.gouv.fr/telechargement/IGNF_MNT-LIDAR-HD",
               "--out", str(out)]
        process = subprocess.run(cmd, capture_output=True, text=True)
        report["importExitCode"] = process.returncode
        report["importStdout"] = process.stdout[-3000:]
        report["importStderr"] = process.stderr[-5000:]
        if process.returncode:
            raise ValueError("Strict three-way measured import rejected the candidate")
        asset = json.loads(out.read_text())
        report.update({"status": "complete_validated_candidate_not_published",
                       "pisteCount": len(asset.get("pistes", [])),
                       "junctionCount": len(asset.get("junctions", [])),
                       "grid": {"rows": asset["grid"]["rows"], "cols": asset["grid"]["cols"]},
                       "sourceManifestSha256": hashlib.sha256(
                           json.dumps(sources, sort_keys=True).encode()).hexdigest()})
    except Exception as exc:
        report.update({"status": "blocked_no_publication", "error": str(exc)})
        raise
    finally:
        args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
        print("P4 full ground-DEM gate:", report["status"], flush=True)


if __name__ == "__main__":
    main()
