#!/usr/bin/env python3
"""Acquire named downhill OSM way geometry for later *manual* exact-node review.

This tool fetches survey data; it does not create or publish a playable resort.
Overpass may be unavailable or rate-limited. Store and review the raw response.
"""

import argparse
import json
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


# The historical overpass.kumi.systems host moved to private.coffee.
# Both endpoints are public, rate-limited OSM infrastructure.
OVERPASS = ("https://overpass.private.coffee/api/interpreter",
            "https://overpass-api.de/api/interpreter")


def query_for_bbox(bbox):
    south, west, north, east = bbox
    if not (-90 <= south < north <= 90 and -180 <= west < east <= 180):
        raise ValueError("Invalid WGS84 bbox; use SOUTH WEST NORTH EAST")
    if north - south > 0.22 or east - west > 0.28:
        raise ValueError("Refusing unexpectedly large ski-area extraction.")
    coords = ",".join(str(v) for v in bbox)
    return (f'[out:json][timeout:120];'
            f'(way["piste:type"="downhill"]["piste:name"]({coords});'
            f'way["piste:type"="downhill"]["name"]({coords}););'
            f'out body geom;')


def inspect(document):
    if not document.get("osm3s", {}).get("timestamp_osm_base"):
        raise ValueError("Overpass response has no dated OSM snapshot.")
    ways = {}
    for way in document.get("elements", []):
        if way.get("type") != "way":
            continue
        tags = way.get("tags", {})
        if tags.get("piste:type") != "downhill" or tags.get("area") == "yes":
            continue
        name = tags.get("piste:name") or tags.get("name")
        nodes, geom = way.get("nodes"), way.get("geometry")
        if not name or not isinstance(nodes, list) or not isinstance(geom, list):
            continue
        if len(nodes) != len(geom) or len(nodes) < 2:
            continue
        ways[way["id"]] = way
    node_to_ways = {}
    for way in ways.values():
        for node in way["nodes"]:
            node_to_ways.setdefault(node, set()).add(way["id"])
    intersections = {}
    for node, ids in node_to_ways.items():
        if len(ids) > 1:
            intersections[str(node)] = sorted(ids)
    return {
        "timestampUTC": document["osm3s"]["timestamp_osm_base"],
        "surveyWays": len(ways),
        "ways": [
            {"osmWay": w["id"], "name": w["tags"].get("piste:name") or w["tags"].get("name"),
             "difficulty": w["tags"].get("piste:difficulty"), "nodeCount": len(w["nodes"]),
             "sharedNodes": sum(n in intersections for n in map(str, w["nodes"]))}
            for w in sorted(ways.values(), key=lambda item: item["id"])
        ],
        "sharedNodeWayIds": intersections,
    }


def fetch(query, attempts=3):
    payload = urlencode({"data": query}).encode()
    for attempt in range(attempts):
        try:
            request = Request(OVERPASS[attempt % len(OVERPASS)], data=payload, headers={
                "User-Agent": "ColdSmokeReality/1.0 (real piste GIS research)",
                "Content-Type": "application/x-www-form-urlencoded",
            })
            with urlopen(request, timeout=150) as response:
                raw = response.read(25 * 1024 * 1024 + 1)
            if len(raw) > 25 * 1024 * 1024:
                raise ValueError("Overpass response exceeds 25 MiB.")
            return json.loads(raw)
        except (HTTPError, URLError, TimeoutError) as error:
            if attempt == attempts - 1:
                raise RuntimeError("Overpass unavailable; retry later without inventing data.") from error
            time.sleep(3 * (attempt + 1))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--bbox", nargs=4, type=float, required=True,
                   metavar=("S", "W", "N", "E"))
    p.add_argument("--out", type=Path, required=True, help="Preserve original Overpass JSON")
    p.add_argument("--review", type=Path, required=True, help="Write ID/node survey report")
    args = p.parse_args()
    data = fetch(query_for_bbox(args.bbox))
    result = inspect(data)
    if result["surveyWays"] < 3:
        raise ValueError("Too few named OSM pistes; adjust the surveyed bbox.")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.review.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8")
    args.review.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")
    print("%d OSM ways / %d shared nodes, timestamp %s; NOT a playable resort" %
          (result["surveyWays"], len(result["sharedNodeWayIds"]), result["timestampUTC"]))


if __name__ == "__main__":
    main()
