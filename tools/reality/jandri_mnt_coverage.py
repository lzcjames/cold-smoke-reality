#!/usr/bin/env python3
"""Read-only Jandri ground-MNT coverage gate; never downloads or publishes DEM.

Plans a conservative Lambert-93 rectangular coverage from the pinned real
OSM way vertices. The rectangle includes a 250 m safety margin; it is a
screening region, NOT a claim about official Jandri piste boundaries.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

try:\n    from .p4_ign_tiles import ENDPOINT, approved_tile_url, params\nexcept ImportError:  # direct command-line execution\n    from p4_ign_tiles import ENDPOINT, approved_tile_url, params

PINNED_SHA = "40dcc37e95a259fb7d0f036e10e4147ce9c7343fb69b167c23ec92241da5ff26"
PINNED_STAMP = "2026-07-24T11:04:51Z"
MARGIN_M = 250


def plan(index, project, margin=MARGIN_M):
    if (index.get("originalResponseSHA256") != PINNED_SHA or
            index.get("snapshotTimestampUTC") != PINNED_STAMP or
            index.get("wayCount") != 37):
        raise ValueError("Not the pinned authentic 37-way Jandri snapshot")
    features = [f for f in index.get("features", []) if f.get("type") == "way"
                and f.get("drawable")]
    if len(features) != 37:
        raise ValueError("Incomplete OSM ways")
    xy = []
    for feature in features:
        coords, nodes = feature.get("coordinates"), feature.get("nodes")
        if not isinstance(coords, list) or not isinstance(nodes, list) or len(coords) != len(nodes) or len(coords) < 2:
            raise ValueError("Invalid original OSM nodes/coordinates")
        for lon, lat in coords:
            if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                raise ValueError("Invalid geographic coordinate")
            x, y = project(lon, lat)
            if not all(map(math.isfinite, (x, y))):
                raise ValueError("Invalid Lambert projection")
            xy.append((x, y))
    west = min(x for x, _ in xy) - margin
    east = max(x for x, _ in xy) + margin
    south = min(y for _, y in xy) - margin
    north = max(y for _, y in xy) + margin
    tile_ids = [f"{x:04d}-{y:04d}" for x in range(math.floor(west / 1000), math.floor(east / 1000) + 1)
                for y in range(math.ceil(south / 1000), math.ceil(north / 1000) + 1)]
    return {
        "sourceSHA256": PINNED_SHA, "snapshotTimestampUTC": PINNED_STAMP,
        "corridor": "bounding rectangle of 37 OSM ways (not full future resort)",
        "projectedCRS": "EPSG:2154", "marginM": margin,
        "boundsLambert93": [west, south, east, north],
        "requiredTileIds": sorted(tile_ids),
        "missingRouteGeometry": ["Jandri 5", "Jandri 1 bis (if present)"],
    }


def evaluate(plan_data, wfs):
    if wfs.get("type") != "FeatureCollection" or not isinstance(wfs.get("features"), list):
        raise ValueError("Not an IGN WFS feature collection")
    reported = wfs.get("numberMatched")
    if reported not in (None, "unknown") and int(reported) > len(wfs["features"]):
        raise ValueError("WFS response truncated; must paginate before coverage claims")
    by_tile = {}
    for feature in wfs["features"]:
        props = feature.get("properties")
        if not isinstance(props, dict):
            continue
        key = props.get("coordonnees_nw")
        if not isinstance(key, str) or not key:
            continue
        if key in by_tile:
            raise ValueError("Duplicate official WFS tile identifier: " + key)
        by_tile[key] = props
    available, missing, invalid = [], [], []
    for key in plan_data["requiredTileIds"]:
        props = by_tile.get(key)
        if props is None:
            missing.append(key)
        elif not approved_tile_url(props.get("url_mnt")):
            invalid.append(key)
        else:
            available.append({"tile": key, "edition": props.get("date_edition"),
                              "mission": props.get("code_mission"),
                              "downloadURL": props["url_mnt"]})
    return {
        **plan_data, "stage": "official_metadata_only_no_rasters_checked",
        "wfsFeatureCount": len(wfs["features"]),
        "requiredTileCount": len(plan_data["requiredTileIds"]),
        "approvedMntMetadataCount": len(available),
        "missingTiles": missing, "unapprovedMntUrls": invalid,
        "officialMntCandidates": available,
        "coverageMetadataComplete": not (missing or invalid),
        "safeToPublish3D": False,
        "note": "Even complete metadata is NOT a validated DEM or a complete Jandri resort.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", type=Path, default=Path("docs/p4/JANDRI-OSM-INDEX.json"))
    parser.add_argument("--wfs", type=Path, help="Saved original official WFS response; no network if provided")
    parser.add_argument("--raw-out", type=Path, help="Store exact retrieved WFS response")
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    from osgeo import osr
    geo = osr.SpatialReference()
    lambert = osr.SpatialReference()
    geo.ImportFromEPSG(4326)
    lambert.ImportFromEPSG(2154)
    geo.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    lambert.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    transform = osr.CoordinateTransformation(geo, lambert)
    plan_data = plan(json.loads(args.index.read_text()),
                     lambda lon, lat: transform.TransformPoint(lon, lat)[:2])
    if args.wfs:
        raw = args.wfs.read_bytes()
    else:
        # Screening bounds from the original source, deliberately padded.
        index = json.loads(args.index.read_text())
        west, south, east, north = index["boundsWGS84"]
        bbox = [west - .006, south - .006, east + .006, north + .006]
        request = Request(ENDPOINT + "?" + urlencode(params(bbox)),
                          headers={"User-Agent": "ColdSmokeReality-JandriMNTPreflight/1.0"})
        with urlopen(request, timeout=90) as response:
            raw = response.read(8_000_001)
    if len(raw) > 8_000_000:
        raise ValueError("WFS metadata response exceeds safe size limit")
    report = evaluate(plan_data, json.loads(raw))
    report["wfsSourceSHA256"] = hashlib.sha256(raw).hexdigest()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    if args.raw_out:
        args.raw_out.parent.mkdir(parents=True, exist_ok=True)
        args.raw_out.write_bytes(raw)
    print("Jandri required official MNT tile metadata:", report["approvedMntMetadataCount"],
          "/", report["requiredTileCount"])
    print("Metadata gate:", "COMPLETE (not terrain-certified)" if report["coverageMetadataComplete"]
          else "BLOCKED (missing or invalid official MNT URLs)")


if __name__ == "__main__":
    main()
