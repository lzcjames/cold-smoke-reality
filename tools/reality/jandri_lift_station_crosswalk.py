#!/usr/bin/env python3
"""Jandri I/II measured-source lift-to-station/piste proximity audit.

Consumes the already archived *real* OpenSkiData local evidence; never
redownloads worldwide data, guesses a boarding station or publishes a route.
"""
import argparse
import json
import math
from pathlib import Path

JANDRI = {"way/1229057878": "Jandri I", "way/1361005452": "Jandri II"}
PINNED_OSM = "40dcc37e95a259fb7d0f036e10e4147ce9c7343fb69b167c23ec92241da5ff26"
EARTH_RADIUS_M = 6371008.8


def projected_local(lon, lat, origin_lat):
    if not all(map(math.isfinite, (lon, lat, origin_lat))):
        raise ValueError("Non-finite coordinates")
    radians = math.pi / 180
    return (EARTH_RADIUS_M * radians * lon * math.cos(origin_lat*radians),
            EARTH_RADIUS_M * radians * lat)


def distance_to_segment(p, a, b):
    vx, vy = b[0]-a[0], b[1]-a[1]
    norm = vx*vx+vy*vy
    if norm <= 1e-12:
        return math.hypot(p[0]-a[0], p[1]-a[1])
    t = max(0, min(1, ((p[0]-a[0])*vx+(p[1]-a[1])*vy)/norm))
    return math.hypot(p[0]-a[0]-t*vx, p[1]-a[1]-t*vy)


def nearest_way(point, ways):
    origin_lat = point[1]
    p = projected_local(point[0], point[1], origin_lat)
    options = []
    for way in ways:
        coords = way["coordinates"]
        if len(coords) < 2:
            raise ValueError("Original OSM way has insufficient geometry")
        vertices = [projected_local(x,y,origin_lat) for x,y in coords]
        distance = min(distance_to_segment(p,a,b) for a,b in zip(vertices,vertices[1:]))
        options.append((distance,way["id"],way["names"][0]))
    if not options:
        raise ValueError("No authentic OSM piste segments")
    d, osm, name = min(options)
    return {"osmWay":osm,"name":name,"horizontalDistanceM":round(d,1),
            "proximityOnly":True,"approvedPhysicalAccess":False}


def inspect(report, index):
    if (report.get("stage") != "openskidata_Jandri_lifts_station_discovery_only" or
        report.get("readyForGameplay") is not False or
        index.get("originalResponseSHA256") != PINNED_OSM or
        index.get("wayCount") != 37):
        raise ValueError("Unverified historical OpenSkiData/OSM audit provenance")
    candidates = report.get("candidates") or {}
    lifts, stations = candidates.get("lifts"), candidates.get("spots")
    if (not isinstance(lifts,list) or not isinstance(stations,list) or
        len(lifts)!=45 or len(stations)!=74 or
        report.get("nearbyCounts") != {"lifts":45,"spots":74}):
        raise ValueError("Unexpected local real snapshot inventory")
    osmways = [w for w in index["features"] if w["type"]=="way" and w.get("drawable")]
    if len(osmways) != 37:
        raise ValueError("Incomplete pinned piste graph")
    result = []
    for upstream_id, label in JANDRI.items():
        matches=[l for l in lifts if upstream_id in l.get("upstreamOSMIds",[])]
        if len(matches)!=1:
            raise ValueError("Missing or ambiguous original Jandri lift: "+upstream_id)
        lift=matches[0]
        daily=lift["dailyFeatureId"]
        local_stations=[s for s in stations if s.get("liftDailyFeatureId")==daily]
        if len({s.get("dailyFeatureId") for s in local_stations})!=len(local_stations):
            raise ValueError("Duplicate daily station IDs")
        line=lift["geometryCoordinates"]
        if lift["geometryType"]!="LineString" or len(line)<2:
            raise ValueError("Cannot validate real single-line Jandri lift geometry")
        entry=[]
        for station in local_stations:
            xy=station["geometryCoordinates"]
            if not isinstance(xy,list) or len(xy)<2:
                raise ValueError("Station missing real coordinates")
            if not -180<=xy[0]<=180 or not -90<=xy[1]<=90:
                raise ValueError("Station coordinates outside WGS84")
            near=nearest_way(xy,osmways)
            entry.append({
                "dailyStationId":station["dailyFeatureId"],
                "upstreamOSMIds":station["upstreamOSMIds"],
                "name":station.get("name"),"positionTag":station.get("position"),
                "sourceEntryTag":station.get("entry"),
                "sourceExitTag":station.get("exit"),
                "coordinatesWGS84":xy,
                "nearestPinnedPiste":near,
                "boardingVerified":False,"disembarkVerified":False,
                "liftConnectionVerified":False,
            })
        result.append({
            "lift":label,"upstreamOSMId":upstream_id,
            "dailyFeatureId":daily,
            "reportedStatus":lift.get("status"),
            "sourceStationCount":len(entry),
            "stations":entry,
            "officialDirectionVerified":False,
            "verifiedTerminalEndpoints":False,
            "verifiedSkiOrFootTransfers":False,
            "expressToTopEnabled":False,
        })
    return {
        "stage":"Jandri_I_II_OpenSkiData_station_piste_proximity_only",
        "openskidataBuildUTC":report["publishedBuildUTC"],
        "openskidataSourceHashes":report["sha256"],
        "pinnedOSMSourceSHA256":PINNED_OSM,
        "lifts":result,"readyForGame":False,
        "caveat":"Closest centreline is not a groomed/accessible ski route or proof of station boarding. IGN terrain and official lift information must still be verified.",
    }


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--openskidata",type=Path,required=True)
    ap.add_argument("--osm-index",type=Path,default=Path("docs/p4/JANDRI-OSM-INDEX.json"))
    ap.add_argument("--out",type=Path,required=True)
    args=ap.parse_args()
    out=inspect(json.loads(args.openskidata.read_text()),
                json.loads(args.osm_index.read_text()))
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n")
    for lift in out["lifts"]:
        print("Authentic station crosswalk",lift["lift"],lift["upstreamOSMId"],
              "source-linked stations",lift["sourceStationCount"],flush=True)


if __name__=="__main__":
    main()
