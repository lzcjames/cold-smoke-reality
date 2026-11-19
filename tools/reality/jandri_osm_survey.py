#!/usr/bin/env python3
"""Read-only real OSM Jandri downhill piste survey; not a playable 3D pack.

No invented way IDs, segments, DEM, route connections or real-world hazards.
Keeps the source JSON unchanged and produces provenance + a namespaced index.
The map is an *OSM centreline* atlas, NOT a resort operator's official map.
"""
import argparse
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

# Deliberately covers the Jandri glacier, Toura, Crêtes and resort return sector.
# Bounds are a screening filter, not a claim about official sector boundaries.
BBOX = (44.954, 6.075, 45.063, 6.207)  # south, west, north, east
ENDPOINTS = (
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
)
LABEL = re.compile(r"jandri", re.I)
PREFIX = re.compile(r"^jandri\s*([ivx]+|[0-9]+)(?:\s*bis)?$", re.I)
SNAPSHOT_VERSION = 1


def query():
    south, west, north, east = BBOX
    bbox = ",".join(str(x) for x in (south, west, north, east))
    # Request all downhill elements with an explicit Jandri name, along with
    # route-relation members if the mapper used a named piste relation.
    return (
        '[out:json][timeout:75];('
        f'way["piste:type"="downhill"]["name"~"Jandri",i]({bbox});'
        f'way["piste:type"="downhill"]["piste:name"~"Jandri",i]({bbox});'
        f'relation["piste:type"="downhill"]["name"~"Jandri",i]({bbox});'
        f'relation["route"="piste"]["name"~"Jandri",i]({bbox});'
        ');out body geom;'
    )


def fetch():
    payload = urlencode({"data": query()}).encode()
    errors = []
    for endpoint in ENDPOINTS:
        try:
            req = Request(endpoint, data=payload, headers={
                "User-Agent": "ColdSmokeReality-JandriReadOnlySurvey/1.0",
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
            })
            with urlopen(req, timeout=95) as response:
                raw = response.read(9_000_001)
            if len(raw) > 9_000_000:
                raise ValueError("Overpass response exceeds 9 MB survey cap")
            doc = json.loads(raw)
            if not isinstance(doc.get("elements"), list):
                raise ValueError("Not an Overpass elements response")
            return raw, doc, endpoint
        except Exception as err:
            errors.append(f"{endpoint}: {type(err).__name__}: {err}")
            time.sleep(2)
    raise RuntimeError("Jandri real OSM query unavailable: " + " | ".join(errors))


def names(tags):
    return [tags[k] for k in ("name", "piste:name") if isinstance(tags.get(k), str)
            and LABEL.search(tags[k])]


def build_index(document, raw, endpoint):
    if not isinstance(document.get("elements"), list):
        raise ValueError("Missing real Overpass elements")
    rows = []
    for element in document["elements"]:
        tags = element.get("tags") or {}
        found_names = names(tags)
        if not found_names:
            continue
        # Never interpret gondola/lift/powerlines as piste routes.
        if tags.get("aerialway") or tags.get("piste:type") != "downhill":
            continue
        typ = element.get("type")
        if typ not in ("way", "relation"):
            continue
        if typ == "relation":
            # Relations reference OSM constituent ways; don't draw fake links
            # between unrelated parts or duplicate underlying member ways.
            rows.append({
                "type": typ, "id": element["id"], "names": found_names,
                "tags": tags, "memberCount": len(element.get("members", [])),
                "drawable": False,
                "reason": "Named relation: must validate member way continuity",
            })
            continue
        nodes = element.get("nodes")
        geom = element.get("geometry")
        if not isinstance(nodes, list) or not isinstance(geom, list) or len(nodes) != len(geom) or len(nodes) < 2:
            raise ValueError(f"OSM way {element.get('id')} has no complete real node geometry")
        if any(not isinstance(v.get("lat"), (int,float)) or
               not isinstance(v.get("lon"), (int,float)) for v in geom):
            raise ValueError(f"Invalid coordinate in OSM way {element.get('id')}")
        length = 0.0
        import math
        for a,b in zip(geom, geom[1:]):
            mean_lat = math.radians((a["lat"]+b["lat"])/2)
            length += math.hypot((b["lon"]-a["lon"])*111320*math.cos(mean_lat),
                                 (b["lat"]-a["lat"])*111132)
        rows.append({
            "type": "way", "id": element["id"], "names": found_names,
            "nodes": nodes,
            "coordinates": [[p["lon"],p["lat"]] for p in geom],
            "tags": tags,
            "approxPlanarLengthM": round(length,1),
            "drawable": True,
        })
    rows.sort(key=lambda r:(r["names"][0].lower(),r["type"],r["id"]))
    if not rows:
        raise ValueError("No real named Jandri downhill OSM features in survey extent")
    coords = [q for row in rows if row.get("drawable") for q in row["coordinates"]]
    bbox = [min(q[0] for q in coords),min(q[1] for q in coords),
            max(q[0] for q in coords),max(q[1] for q in coords)]
    return {
        "schema": SNAPSHOT_VERSION, "source": "OpenStreetMap / Overpass",
        "copyright": "© OpenStreetMap contributors · ODbL 1.0",
        "sourceUrl": endpoint,
        "snapshotTimestampUTC": document.get("osm3s", {}).get("timestamp_osm_base"),
        "queriedAtUTC": datetime.now(timezone.utc).isoformat(),
        "queryBBoxSWNE": list(BBOX),
        "originalResponseSHA256": hashlib.sha256(raw).hexdigest(),
        "boundsWGS84": bbox,
        "wayCount": sum(row["type"]=="way" for row in rows),
        "relationCount": sum(row["type"]=="relation" for row in rows),
        "matchedNames": sorted({name for row in rows for name in row["names"]}),
        "features": rows,
        "publication": "Survey only; 3D gameplay demands verified ground DEM, downhill and collision gates",
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw-out", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--fixture", help="Offline original Overpass JSON; no network")
    args = ap.parse_args()
    if args.fixture:
        raw = Path(args.fixture).read_bytes()
        doc = json.loads(raw)
        endpoint = "offline original fixture"
    else:
        raw, doc, endpoint = fetch()
    report = build_index(doc, raw, endpoint)
    for path, data in [(args.raw_out, raw),
                       (args.out, json.dumps(report, ensure_ascii=False, indent=2).encode())]:
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    print(json.dumps({
        "osmEdition":report["snapshotTimestampUTC"],
        "sourceSHA256":report["originalResponseSHA256"],
        "ways":report["wayCount"],"relations":report["relationCount"],
        "names":report["matchedNames"],
        "bbox": report["boundsWGS84"]
    },ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
