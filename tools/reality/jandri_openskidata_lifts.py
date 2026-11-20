#!/usr/bin/env python3
"""Audit a *single daily OpenSkiData snapshot* of Jandri-adjacent lifts/stations.

Input is the publisher's downloaded GeoJSON and metadata.json. This script
never downloads or calls OpenSkiMap tiles; CI enforces once-per-day snapshots.
OpenSkiData mostly derives lift geometry from OSM and is not independent
operator confirmation. The output is audit-only, never a playable lift pack.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

# Wider than the pinned Jandri piste bbox to capture lift stations nearby.
BBOX = (6.115, 44.980, 6.220, 45.030)  # WGS84 lon, lat, lon, lat
MAX_RELEVANT = 250
MAX_POINTS_PER_LIFT = 10000
ATTRIBUTION = ("Data from OpenSkiData / OpenSkiMap.org, © OpenStreetMap "
               "contributors (ODbL), Skimap.org, Who's On First, © Mapterhorn")


def bbox_intersects_geometry(geometry, bounds=BBOX):
    if not isinstance(geometry, dict):
        return False
    typ, coords = geometry.get("type"), geometry.get("coordinates")
    if typ not in ("Point", "LineString", "MultiLineString") or not isinstance(coords, list):
        return False
    if typ == "Point":
        points = [coords]
    elif typ == "LineString":
        points = coords
    else:
        points = [point for section in coords if isinstance(section, list)
                  for point in section]
    valid = [p for p in points if isinstance(p, list) and len(p) >= 2
             and all(isinstance(n, (int, float)) and math.isfinite(n) for n in p[:2])
             and -180 <= p[0] <= 180 and -90 <= p[1] <= 90]
    if len(valid) != len(points) or not valid:
        raise ValueError("Malformed official OpenSkiData geometry")
    w, s, e, n = bounds
    return not (max(p[0] for p in valid) < w or
                min(p[0] for p in valid) > e or
                max(p[1] for p in valid) < s or
                min(p[1] for p in valid) > n)


def osm_source_ids(properties):
    result = set()
    for source in properties.get("sources", []) or []:
        if isinstance(source, dict) and source.get("type") == "openstreetmap":
            value = source.get("id")
            if isinstance(value, str) and value:
                result.add(value)
    return sorted(result)


def classify_feature(feature, kind):
    if not isinstance(feature, dict) or feature.get("type") != "Feature":
        raise ValueError("Not an OpenSkiData GeoJSON feature")
    p, geometry = feature.get("properties"), feature.get("geometry")
    if not isinstance(p, dict) or not isinstance(geometry, dict):
        raise ValueError("Missing source properties/geometry")
    if not bbox_intersects_geometry(geometry):
        return None
    stable_sources = osm_source_ids(p)
    if kind == "lifts":
        if geometry.get("type") not in ("LineString", "MultiLineString"):
            raise ValueError("Local lift does not have a line geometry")
        stations = p.get("stations") or []
        station_ids = [x.get("properties", {}).get("id")
                       for x in stations if isinstance(x, dict)]
        return {
            "dailyFeatureId": p.get("id"),
            "upstreamOSMIds": stable_sources,
            "name": p.get("name"),
            "liftType": p.get("liftType"),
            "status": p.get("status"),
            "access": p.get("access"),
            "ref": p.get("ref"),
            "durationSeconds": p.get("duration"),
            "capacityPerHour": p.get("capacity"),
            "occupancy": p.get("occupancy"),
            "stationsEmbedded": len(stations),
            "embeddedStationIDs": station_ids[:30],
            "geometryType": geometry["type"],
            "geometryCoordinates": geometry["coordinates"],
            "approvedForBoarding": False,
            "approvedForGameplay": False,
        }
    if kind == "spots":
        if geometry.get("type") != "Point" or p.get("spotType") != "lift_station":
            return None
        return {
            "dailyFeatureId": p.get("id"),
            "upstreamOSMIds": stable_sources,
            "name": p.get("name"),
            "position": p.get("position"),
            "entry": p.get("entry"),
            "exit": p.get("exit"),
            "liftDailyFeatureId": p.get("liftId"),
            "geometryCoordinates": geometry["coordinates"],
            "approvedForBoarding": False,
        }
    raise ValueError("Unknown OpenSkiData dataset")


def stream_candidates(path, kind):
    import ijson
    result, count = [], 0
    with path.open("rb") as source:
        for feature in ijson.items(source, "features.item", use_float=True):
            count += 1
            candidate = classify_feature(feature, kind)
            if candidate is not None:
                result.append(candidate)
                if len(result) > MAX_RELEVANT:
                    raise ValueError("Too many Jandri candidates: unexpected source bounds")
                if kind == "lifts":
                    geom = candidate["geometryCoordinates"]
                    points = geom if candidate["geometryType"] == "LineString" else [
                        pt for line in geom for pt in line]
                    if len(points) > MAX_POINTS_PER_LIFT:
                        raise ValueError("Unexpectedly complex lift geometry")
    if not count:
        raise ValueError("No features in publisher GeoJSON")
    return count, result


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as fp:
        for chunk in iter(lambda: fp.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def validate_metadata(meta):
    if not isinstance(meta, dict) or meta.get("version") != 1:
        raise ValueError("Unrecognized OpenSkiData source metadata")
    source = meta.get("source") or {}
    osm_stamp = (source.get("openStreetMap") or {}).get("dataTimestamp")
    build_stamp = (meta.get("run") or {}).get("finishedAt")
    if not isinstance(osm_stamp, str) or not isinstance(build_stamp, str):
        raise ValueError("OpenSkiData source/build timestamps missing")
    counts = meta.get("counts") or {}
    if not isinstance(counts.get("lifts"), int) or not isinstance(counts.get("spots"), int):
        raise ValueError("Missing OpenSkiData original record counts")
    if not isinstance(meta.get("formatVersion"), str):
        raise ValueError("Unpinned OpenSkiData format version")
    return build_stamp, osm_stamp


def report_for_snapshot(meta, lifts_path, spots_path):
    build_stamp, osm_stamp = validate_metadata(meta)
    counts = {}
    candidates = {}
    for kind, path in (("lifts", lifts_path), ("spots", spots_path)):
        count, nearby = stream_candidates(path, kind)
        if count != meta["counts"][kind]:
            raise ValueError("OpenSkiData record count mismatch for " + kind)
        counts[kind] = count
        candidates[kind] = nearby
    lift_ids = {x["dailyFeatureId"] for x in candidates["lifts"]}
    for station in candidates["spots"]:
        station["linkedLocalLiftRecord"] = station["liftDailyFeatureId"] in lift_ids
    return {
        "stage": "openskidata_Jandri_lifts_station_discovery_only",
        "publishedBuildUTC": build_stamp,
        "openStreetMapSnapshotUTC": osm_stamp,
        "formatVersion": meta["formatVersion"],
        "boundsWGS84": list(BBOX),
        "sourceURLs": {
            "metadata": "https://tiles.openskimap.org/metadata.json",
            "lifts": "https://tiles.openskimap.org/geojson/lifts.geojson",
            "spots": "https://tiles.openskimap.org/geojson/spots.geojson",
        },
        "sha256": {"lifts": sha256(lifts_path), "spots": sha256(spots_path)},
        "publisherFeatureCounts": counts,
        "nearbyCounts": {kind: len(items) for kind, items in candidates.items()},
        "candidates": candidates,
        "attribution": ATTRIBUTION,
        "approvedBoardingStations": 0,
        "approvedSkiLiftRideLinks": 0,
        "readyForGameplay": False,
        "limitations": [
            "OpenSkiData is substantially derived from OpenStreetMap; not independent geometry verification.",
            "Content-hash daily IDs are unstable; use recorded upstream OSM IDs for durable links.",
            "Station boarding/exit and lift operating state require official corroboration.",
            "Actual Jandri piste-to-station walking/skiing connectivity and collision safety are unverified.",
            "OpenSkiData 3D heights come from Mapterhorn; IGN LiDAR HD is authoritative for local terrain QA.",
        ],
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--metadata", type=Path, required=True)
    p.add_argument("--lifts", type=Path, required=True)
    p.add_argument("--spots", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()
    meta = json.loads(args.metadata.read_text())
    result = report_for_snapshot(meta, args.lifts, args.spots)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print("Authentic OpenSkiData nearby Jandri candidates:",
          result["nearbyCounts"], flush=True)


if __name__ == "__main__":
    main()
