#!/usr/bin/env python3
"""Strict non-publishing full 24-tile Jandri ground-MNT mosaic/grade audit.

Downloads original official IGN LiDAR HD MNT files into temporary CI storage.
Authenticates every original tile; verifies cross-tile edges and derives
measured profiles of pinned OSM centrelines. No guessed surface or game asset.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

try:
    from .jandri_mnt_coverage import plan, evaluate
    from .p4_full_ground_gate import download, sha256, validate_raster, verify_source_url
except ImportError:
    from jandri_mnt_coverage import plan, evaluate
    from p4_full_ground_gate import download, sha256, validate_raster, verify_source_url

try:
    from .jandri_local_node_probe import measure_shared_nodes
except ImportError:
    from jandri_local_node_probe import measure_shared_nodes

EXPECTED_TILES = 24
EXPECTED_WAYS = 37
SAMPLE_STEP_M = 30.0


def score_profile(samples):
    """Measured (distance_m, elevation_m) data; do not infer piste difficulty."""
    if len(samples) < 2 or abs(samples[0][0]) > 1e-7:
        raise ValueError("Insufficient/invalid profile")
    grades, ascent, descent = [], 0., 0.
    for (s0, h0), (s1, h1) in zip(samples, samples[1:]):
        distance = s1 - s0
        if not (math.isfinite(distance) and distance > 0
                and math.isfinite(h0) and math.isfinite(h1)):
            raise ValueError("Non-finite/repeated profile sample")
        delta = h1 - h0
        grades.append(abs(delta) / distance)
        ascent += max(delta, 0.)
        descent += max(-delta, 0.)
    return {"lengthM": round(samples[-1][0], 2),
            "firstElevationM": round(samples[0][1], 2),
            "lastElevationM": round(samples[-1][1], 2),
            "netElevationChangeM": round(samples[-1][1]-samples[0][1], 2),
            "cumulativeAscentM": round(ascent, 2),
            "cumulativeDescentM": round(descent, 2),
            "maxAbsoluteSampleGradePct": round(100*max(grades), 2),
            "sampleCount": len(samples),
            "direction": "unconfirmed_not_implied_by_OSM_node_order"}


def sampled_polyline(points, height_at, step_m=SAMPLE_STEP_M):
    """Resample true geometry per 30m *along segments*, preserving OSM corners."""
    if len(points) < 2 or step_m <= 0:
        raise ValueError("Invalid OSM centreline")
    output = [(0.0, float(height_at(*points[0])))]
    travelled = 0.0
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        length = math.hypot(x1-x0, y1-y0)
        if length <= 0:
            raise ValueError("Repeated projected OSM vertex")
        parts = max(1, math.ceil(length/step_m))
        for i in range(1, parts+1):
            f = i/parts
            output.append((travelled+length*f,
                           float(height_at(x0+(x1-x0)*f, y0+(y1-y0)*f))))
        travelled += length
    return score_profile(output)


def sampled_height(ds, x, y):
    """Bilinear sample in the source-only multi-tile VRT, no synthetic fill."""
    import numpy as np
    gt = ds.GetGeoTransform()
    if abs(gt[2]) > 1e-9 or abs(gt[4]) > 1e-9 or gt[1] <= 0 or gt[5] >= 0:
        raise ValueError("Unexpected mosaic geotransform")
    # Pixel-centre fractional coordinates; bilinear read may cross source tiles.
    u = (x - gt[0])/gt[1] - .5
    v = (y - gt[3])/gt[5] - .5
    col, row = math.floor(u), math.floor(v)
    if col < 0 or row < 0 or col+1 >= ds.RasterXSize or row+1 >= ds.RasterYSize:
        raise ValueError("OSM measurement outside actual ground mosaic")
    block = ds.GetRasterBand(1).ReadAsArray(col, row, 2, 2)
    if block is None or block.shape != (2, 2):
        raise ValueError("Cannot read real MNT pixels")
    nodata = ds.GetRasterBand(1).GetNoDataValue()
    if not np.isfinite(block).all() or (nodata is not None and np.any(block == nodata)):
        raise ValueError("Missing/nodata MNT at real OSM vertex or segment")
    if np.any(block <= -100) or np.any(block >= 6000):
        raise ValueError("Invalid source ground MNT elevation")
    fx, fy = u-col, v-row
    return float((1-fy)*((1-fx)*block[0,0]+fx*block[0,1]) +
                 fy*((1-fx)*block[1,0]+fx*block[1,1]))


def adjacent_edges(datasets):
    """Check all 0.5m neighbouring centre-cell pairs across *all* tile borders."""
    import numpy as np
    result = []
    for key, ds in sorted(datasets.items()):
        x, y = map(int, key.split("-"))
        for other_key, edge in ((f"{x+1:04d}-{y:04d}", "east"),
                                (f"{x:04d}-{y+1:04d}", "north")):
            if other_key not in datasets:
                continue
            other = datasets[other_key]
            if edge == "east":
                a = ds.GetRasterBand(1).ReadAsArray(1999, 0, 1, 2000).ravel()
                b = other.GetRasterBand(1).ReadAsArray(0, 0, 1, 2000).ravel()
            else:
                a = ds.GetRasterBand(1).ReadAsArray(0, 0, 2000, 1).ravel()
                b = other.GetRasterBand(1).ReadAsArray(0, 1999, 2000, 1).ravel()
            nodata_a = ds.GetRasterBand(1).GetNoDataValue()
            nodata_b = other.GetRasterBand(1).GetNoDataValue()
            valid = np.isfinite(a) & np.isfinite(b)
            if nodata_a is not None: valid &= a != nodata_a
            if nodata_b is not None: valid &= b != nodata_b
            if valid.sum() != 2000:
                raise ValueError("Unmeasured/nodata cross-tile boundary: "+key+" -> "+other_key)
            delta = np.abs(a.astype(float)-b.astype(float))
            result.append({"tileA": key, "tileB": other_key, "edge": edge,
                           "validPairs": 2000,
                           "maxAdjacentPixelDifferenceM": round(float(delta.max()),3),
                           "p95AdjacentPixelDifferenceM": round(float(np.percentile(delta,95)),3)})
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--index", type=Path, default=Path("docs/p4/JANDRI-OSM-INDEX.json"))
    p.add_argument("--wfs", type=Path, required=True)
    p.add_argument("--metadata", type=Path, required=True)
    p.add_argument("--work", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()
    from osgeo import gdal, osr
    gdal.UseExceptions()
    geo, lambert = osr.SpatialReference(), osr.SpatialReference()
    geo.ImportFromEPSG(4326)
    lambert.ImportFromEPSG(2154)
    for srs in (geo, lambert):
        srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    project = osr.CoordinateTransformation(geo, lambert)
    original_osm = json.loads(args.index.read_text())
    expected = plan(original_osm, lambda lon, lat: project.TransformPoint(lon, lat)[:2])
    original_wfs = args.wfs.read_bytes()
    wfs_sha = hashlib.sha256(original_wfs).hexdigest()
    archived = json.loads(args.metadata.read_text())
    if (archived.get("wfsSourceSHA256") != wfs_sha
            or archived.get("sourceSHA256") != expected["sourceSHA256"]
            or archived.get("requiredTileIds") != expected["requiredTileIds"]):
        raise ValueError("Official archive or pinned OSM provenance mismatch")
    checked = evaluate(expected, json.loads(original_wfs))
    if not checked["coverageMetadataComplete"] or checked["requiredTileCount"] != EXPECTED_TILES:
        raise ValueError("Incomplete authentic MNT inventory")
    report = {"status": "started", "stage": "full_authentic_MNT_mosaic_gate_non_publishing",
              "osmSourceSHA256": expected["sourceSHA256"], "wfsSourceSHA256": wfs_sha,
              "tileCountExpected": EXPECTED_TILES, "sourceTiles": [],
              "crossTileEdges": [], "osmWayProfiles": [], "sharedNodeMeasurements": [],
              "readyFor3D": False, "reason": "Measured DEM analysis only, not a safe ski simulation"}
    args.work.mkdir(parents=True, exist_ok=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    rasters, wrappers = {}, []
    try:
        for item in checked["officialMntCandidates"]:
            key = item["tile"]
            url = verify_source_url(item["downloadURL"], key)
            target = args.work/(key+".tif")
            count = download(url, target)
            ds = validate_raster(target, key)
            band = ds.GetRasterBand(1)
            # Validate *every* source pixel, not merely one OSM sample.
            import numpy as np
            invalid = 0
            for start in range(0, ds.RasterYSize, 200):
                a = band.ReadAsArray(0, start, ds.RasterXSize, min(200, ds.RasterYSize-start))
                invalid += int(np.count_nonzero(~np.isfinite(a) | (a <= -100) | (a >= 6000)))
                nd = band.GetNoDataValue()
                if nd is not None:
                    invalid += int(np.count_nonzero(a == nd))
            if invalid:
                raise ValueError("Official source tile contains invalid/nodata pixels: "+key)
            rasters[key] = ds
            vpath = args.work/(key+".vrt")
            # GeoTIFF may lack EPSG authority ID; normalize after strict validation.
            gdal.Translate(str(vpath), ds, format="VRT", outputSRS="EPSG:2154")
            wrappers.append(str(vpath))
            report["sourceTiles"].append({"tile":key,"sha256":sha256(target),"bytes":count,
                                          "edition":item["edition"],"mission":item["mission"]})
            print("Strict full-MNT source tile",len(report["sourceTiles"]),"/24",key,flush=True)
        if len(rasters) != EXPECTED_TILES:
            raise ValueError("Missing real source raster")
        report["crossTileEdges"] = adjacent_edges(rasters)
        # 24 tiles in a complete 8 x 3 rectangular index should have 37 shared edges.
        # Validate against tile inventory instead of assuming any particular grid shape.
        potential = sum((f"{int(t.split('-')[0])+1:04d}-{t.split('-')[1]}" in rasters)
                        +(f"{t.split('-')[0]}-{int(t.split('-')[1])+1:04d}" in rasters)
                        for t in rasters)
        if len(report["crossTileEdges"]) != potential:
            raise ValueError("Cross-tile edge inventory incomplete")
        mosaic_path = args.work/"measured-jandri-source-only.vrt"
        mosaic = gdal.BuildVRT(str(mosaic_path), wrappers)
        if mosaic is None:
            raise ValueError("Cannot construct licensed source-only VRT")
        for feature in original_osm["features"]:
            if feature.get("type") != "way" or not feature.get("drawable"):
                continue
            points = [project.TransformPoint(lon, lat)[:2]
                      for lon,lat in feature["coordinates"]]
            profile = sampled_polyline(points, lambda x,y:sampled_height(mosaic,x,y))
            profile.update({"osmWay":feature["id"],"names":feature["names"],
                            "osmDifficulty":feature.get("tags",{}).get("piste:difficulty")})
            report["osmWayProfiles"].append(profile)
        if len(report["osmWayProfiles"]) != EXPECTED_WAYS:
            raise ValueError("Missing real OSM way profiles")
        report["sharedNodeMeasurements"] = measure_shared_nodes(
            original_osm, lambda lon,lat: project.TransformPoint(lon,lat)[:2],
            lambda x,y:sampled_height(mosaic,x,y))
        if len(report["sharedNodeMeasurements"]) != 8 or any(
                not node["allArmsMeasured"] for node in report["sharedNodeMeasurements"]):
            raise ValueError("Incomplete measured Jandri shared-node approaches")
        print("Measured authentic shared Jandri nodes:",
              len(report["sharedNodeMeasurements"]), flush=True)
        report["status"]="complete_real_mosaic_and_profiles_not_published"
        print("Real ground mosaic verified:",len(rasters),"tiles,",
              len(report["crossTileEdges"]),"complete borders,",
              len(report["osmWayProfiles"]),"measured OSM profiles",flush=True)
    except Exception as exc:
        report["status"]="blocked_no_publication"
        report["error"]=str(exc)
        raise
    finally:
        args.out.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n")


if __name__=="__main__":
    main()
