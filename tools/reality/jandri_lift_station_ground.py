#!/usr/bin/env python3
"""Non-publishing IGN LiDAR HD ground check for archived Jandri lift stations.

Uses pinned original OpenSkiData station crosswalk, frozen 24 IGN tile metadata,
and authentic source rasters. Outside the pinned pistes' 250m screening footprint
means UNMEASURED, not invalid station. Never approves boarding or top teleport.
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

PINNED_OSM = "40dcc37e95a259fb7d0f036e10e4147ce9c7343fb69b167c23ec92241da5ff26"
EXPECTED_LIFTS = {"way/1229057878": "Jandri I", "way/1361005452": "Jandri II"}


def tile_at(x, y):
    if not math.isfinite(x) or not math.isfinite(y):
        raise ValueError("Non-finite projected station location")
    # Official tile ID's y component is its NORTH edge; row pixel centers
    # begin at tileY*1000 and extend southwards over the next 1000m.
    return f"{math.floor(x / 1000):04d}-{math.ceil(y / 1000):04d}"


def station_inventory(crosswalk, project, required):
    if (crosswalk.get("stage") != "Jandri_I_II_OpenSkiData_station_piste_proximity_only"
            or crosswalk.get("pinnedOSMSourceSHA256") != PINNED_OSM
            or crosswalk.get("readyForGame") is not False):
        raise ValueError("Unverified station crosswalk provenance")
    lifts = crosswalk.get("lifts")
    if not isinstance(lifts, list) or len(lifts) != 2 or {
        item.get("upstreamOSMId") for item in lifts
    } != set(EXPECTED_LIFTS):
        raise ValueError("Missing/duplicate verified Jandri lift source IDs")
    rows = []
    seen = set()
    for lift in lifts:
        if lift.get("lift") != EXPECTED_LIFTS[lift["upstreamOSMId"]]:
            raise ValueError("Lift name/identity source mismatch")
        stations = lift.get("stations")
        if not isinstance(stations, list) or len(stations) != lift.get("sourceStationCount"):
            raise ValueError("Source-linked station inventory inconsistent")
        for station in stations:
            station_id = station.get("dailyStationId")
            if not isinstance(station_id, str) or not station_id or station_id in seen:
                raise ValueError("Duplicate/missing source station identity")
            seen.add(station_id)
            coords = station.get("coordinatesWGS84")
            if (not isinstance(coords, list) or len(coords) < 2 or
                    not all(isinstance(v, (int, float)) and math.isfinite(v) for v in coords[:2]) or
                    not (-180 <= coords[0] <= 180 and -90 <= coords[1] <= 90)):
                raise ValueError("Station has invalid WGS84 coordinates")
            x, y = project(coords[0], coords[1])
            key = tile_at(x, y)
            rows.append({
                "lift": lift["lift"], "upstreamLiftOSMId": lift["upstreamOSMId"],
                "stationSourceId": station_id,
                "stationSourceOSMIds": station.get("upstreamOSMIds") or [],
                "stationName": station.get("name"),
                "sourcePositionTag": station.get("positionTag"),
                "sourceEntryTag": station.get("sourceEntryTag"),
                "sourceExitTag": station.get("sourceExitTag"),
                "originalWGS84": [round(coords[0], 8), round(coords[1], 8)],
                "projectedLambert93": [round(x, 3), round(y, 3)],
                "candidateMntTileId": key,
                "insideVerifiedJandri24TileInventory": key in required,
                "sourceGeometryHeightM": (
                    round(coords[2], 2) if len(coords) >= 3 and
                    isinstance(coords[2], (int, float)) and math.isfinite(coords[2]) else None
                ),
                "ignGroundHeightM": None, "ignGroundTileSHA256": None,
                "operatorBoardingApproved": False,
                "safeDisembarkApproved": False, "pisteTransferApproved": False,
                "expressToTopEnabled": False,
                "explanation": "Ground terrain measurement alone does not verify lift clearance, station floor, passage, or allowed ski/foot transfers",
            })
    if len(rows) != 6:
        raise ValueError("Expected exactly six source-linked Jandri station records")
    return rows


def ground_sample(ds, x, y):
    """Require four genuine neighbouring ground pixels; never fill missing DEM."""
    import numpy as np
    gt = ds.GetGeoTransform()
    if abs(gt[2]) > 1e-9 or abs(gt[4]) > 1e-9:
        raise ValueError("Unsupported rotated official raster")
    u, v = (x-gt[0])/gt[1]-.5, (y-gt[3])/gt[5]-.5
    ix, iy = math.floor(u), math.floor(v)
    # An isolated source tile cannot safely interpolate across an edge.
    if ix < 0 or iy < 0 or ix + 1 >= ds.RasterXSize or iy + 1 >= ds.RasterYSize:
        return None
    a = ds.GetRasterBand(1).ReadAsArray(ix, iy, 2, 2)
    nodata = ds.GetRasterBand(1).GetNoDataValue()
    if a is None or a.shape != (2, 2) or not np.isfinite(a).all():
        return None
    if nodata is not None and np.any(a == nodata):
        return None
    if np.any(a <= -100) or np.any(a >= 6000):
        return None
    fx, fy = u-ix, v-iy
    return float((1-fy)*((1-fx)*a[0,0]+fx*a[0,1]) +
                 fy*((1-fx)*a[1,0]+fx*a[1,1]))


def audit(crosswalk, index, wfs_raw, meta, project, work):
    plan_data = plan(index, project)
    wfs_hash = hashlib.sha256(wfs_raw).hexdigest()
    if (meta.get("wfsSourceSHA256") != wfs_hash
            or meta.get("sourceSHA256") != plan_data["sourceSHA256"]
            or meta.get("requiredTileIds") != plan_data["requiredTileIds"]):
        raise ValueError("Pinned WFS/OSM original provenance mismatch")
    evaluated = evaluate(plan_data, json.loads(wfs_raw))
    if not evaluated["coverageMetadataComplete"] or evaluated["requiredTileCount"] != 24:
        raise ValueError("Incomplete original IGN screening index")
    required = set(evaluated["requiredTileIds"])
    rows = station_inventory(crosswalk, project, required)
    by_tile = {x["tile"]: x for x in evaluated["officialMntCandidates"]}
    needed = sorted({s["candidateMntTileId"] for s in rows if s["insideVerifiedJandri24TileInventory"]})
    report = {
        "stage": "Jandri_I_II_authentic_IGN_station_ground_only",
        "status": "started", "pinnedOSMSourceSHA256": PINNED_OSM,
        "wfsSourceSHA256": wfs_hash,
        "openskidataSourceHashes": crosswalk["openskidataSourceHashes"],
        "openskidataBuildUTC": crosswalk["openskidataBuildUTC"],
        "requiredJandriPisteMntTiles": 24,
        "sourceLinkedStations": len(rows),
        "stationsWithinPisteMntInventory": len([s for s in rows if s["insideVerifiedJandri24TileInventory"]]),
        "sourceTileHashes": [], "stationMeasurements": rows,
        "approvedBoardingZones": 0, "approvedExpressDestinations": 0,
        "readyForGame": False,
    }
    work.mkdir(parents=True, exist_ok=True)
    try:
        for tile in needed:
            info = by_tile[tile]
            path = work / (tile + ".tif")
            count = download(verify_source_url(info["downloadURL"], tile), path)
            ds = validate_raster(path, tile)
            digest = sha256(path)
            report["sourceTileHashes"].append({"tile":tile,"sha256":digest,"bytes":count})
            for row in rows:
                if row["candidateMntTileId"] != tile:
                    continue
                x, y = project(*row["originalWGS84"])
                measured = ground_sample(ds, x, y)
                if measured is not None:
                    row["ignGroundHeightM"] = round(measured, 2)
                    row["ignGroundTileSHA256"] = digest
                    row["sourceHeightMinusIGNGroundM"] = (
                        round(row["sourceGeometryHeightM"]-measured,2)
                        if row["sourceGeometryHeightM"] is not None else None)
                else:
                    row["explanation"] = "Source station is too close to tile boundary or has missing ground pixels; no interpolated substitute"
            ds = None
            print("Verified station source IGN ground tile",tile,flush=True)
        report["stationsWithActualIGNGroundHeight"] = sum(s["ignGroundHeightM"] is not None for s in rows)
        report["stationsOutsidePisteMntInventory"] = 6 - report["stationsWithinPisteMntInventory"]
        report["status"] = "source_ground_measured_with_explicit_coverage_limits"
    except Exception as exc:
        report["status"] = "blocked_no_publication"
        report["error"] = str(exc)
        raise
    return report


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--crosswalk",type=Path,required=True)
    p.add_argument("--index",type=Path,default=Path("docs/p4/JANDRI-OSM-INDEX.json"))
    p.add_argument("--wfs",type=Path,required=True)
    p.add_argument("--metadata",type=Path,required=True)
    p.add_argument("--work",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    args=p.parse_args()
    from osgeo import osr
    geo,lambert=osr.SpatialReference(),osr.SpatialReference()
    geo.ImportFromEPSG(4326)
    lambert.ImportFromEPSG(2154)
    for srs in (geo,lambert):
        srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    tx=osr.CoordinateTransformation(geo,lambert)
    project=lambda lon,lat:tx.TransformPoint(lon,lat)[:2]
    args.out.parent.mkdir(parents=True,exist_ok=True)
    try:
        report=audit(json.loads(args.crosswalk.read_text()),
                     json.loads(args.index.read_text()),args.wfs.read_bytes(),
                     json.loads(args.metadata.read_text()),project,args.work)
    except Exception as exc:
        args.out.write_text(json.dumps({"status":"blocked_no_publication","error":str(exc)},
                                      indent=2)+"\n")
        raise
    args.out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print("Jandri original station coverage:", report["stationsWithinPisteMntInventory"],
          "/ 6 in pinned ground inventory,",report["stationsWithActualIGNGroundHeight"],
          "actual IGN ground heights",flush=True)


if __name__=="__main__":
    main()
