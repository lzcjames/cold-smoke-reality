#!/usr/bin/env python3
"""Audit actual OSM Les Deux Alpes downhill ways WITHOUT inventing connections.

The report is exploratory; overlapping lines or nearby endpoints do NOT create
a connection. Only identical OSM node IDs with matching coordinates qualify
for a candidate junction. Elevation and directed downhill validation follow
separately once an authentic DEM is available.
"""
import argparse
import collections
import json
import math
from pathlib import Path

SURVEY_BOUNDS = (44.975, 6.095, 45.050, 6.205)  # S, W, N, E


def audit(doc):
    ways = []
    seen = set()
    for item in doc.get("elements", []):
        if item.get("type") != "way" or item.get("id") in seen:
            continue
        seen.add(item["id"])
        tags = item.get("tags", {})
        if tags.get("piste:type") != "downhill" or tags.get("area") == "yes":
            continue
        name = tags.get("piste:name") or tags.get("name")
        nodes, coords = item.get("nodes", []), item.get("geometry", [])
        if not name or len(nodes) != len(coords) or len(nodes) < 2:
            continue
        south, west, north, east = SURVEY_BOUNDS
        if any(not (south <= p["lat"] <= north and west <= p["lon"] <= east)
               for p in coords):
            continue
        if len(set(nodes)) != len(nodes):
            continue
        length = 0
        for p, q in zip(coords, coords[1:]):
            lat = math.radians((p["lat"] + q["lat"]) / 2)
            length += math.hypot((q["lon"] - p["lon"]) * 111_195 * math.cos(lat),
                                 (q["lat"] - p["lat"]) * 111_195)
        if length < 50:
            continue
        ways.append({
            "id": item["id"], "name": name,
            "difficulty": tags.get("piste:difficulty", "unspecified"),
            "lengthM": round(length), "nodes": nodes,
            "geometry": coords,
            "bbox": [
                round(min(p["lat"] for p in coords), 7),
                round(min(p["lon"] for p in coords), 7),
                round(max(p["lat"] for p in coords), 7),
                round(max(p["lon"] for p in coords), 7),
            ],
        })
    nodes = collections.defaultdict(list)
    node_coord = {}
    for way in ways:
        for n, p in zip(way["nodes"], way["geometry"]):
            point = [p["lon"], p["lat"]]
            if n in node_coord and node_coord[n] != point:
                raise ValueError(f"OSM shared node {n} has conflicting surveyed coordinates")
            node_coord[n] = point
            nodes[n].append(way["id"])
    connections = []
    links = collections.defaultdict(set)
    for node, ids in sorted(nodes.items()):
        ids = sorted(set(ids))
        if len(ids) < 2:
            continue
        connections.append({"osmNode": node, "lonLat": node_coord[node], "ways": ids})
        for a in ids:
            links[a].update(b for b in ids if b != a)
    components, unvisited = [], {w["id"] for w in ways}
    by_id = {w["id"]: w for w in ways}
    while unvisited:
        seed = min(unvisited)
        visited = {seed}
        pending = [seed]
        while pending:
            current = pending.pop()
            for other in links[current] & unvisited:
                if other not in visited:
                    visited.add(other)
                    pending.append(other)
        unvisited -= visited
        chosen = sorted((by_id[w] for w in visited),
                        key=lambda x: (-x["lengthM"], x["id"]))
        components.append({
            "wayCount": len(visited),
            "wayIds": [w["id"] for w in chosen],
            "ways": [{
                "id": w["id"], "name": w["name"],
                "difficulty": w["difficulty"], "lengthM": w["lengthM"],
                "bbox": w["bbox"],
            } for w in chosen],
            "sharedNodes": sum(all(i in visited for i in j["ways"][:2])
                               for j in connections),
        })
    components.sort(key=lambda c: (-c["wayCount"], -c["sharedNodes"],
                                   -sum(w["lengthM"] for w in c["ways"])))
    return {
        "source": "© OpenStreetMap contributors · ODbL 1.0",
        "osmTimestamp": doc.get("osm3s", {}).get("timestamp_osm_base"),
        "scope": "Les Deux Alpes exploratory survey; topology not yet DEM-validated",
        "boundsSWNE": SURVEY_BOUNDS,
        "eligibleNamedWays": len(ways),
        "exactSharedNodeJunctionCandidates": len(connections),
        "largestComponentWayCount": components[0]["wayCount"] if components else 0,
        "components": components[:15],
        "sharedNodes": connections,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--osm", required=True, type=Path)
    p.add_argument("--report", required=True, type=Path)
    args = p.parse_args()
    data = audit(json.loads(args.osm.read_text()))
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print("OSM timestamp", data["osmTimestamp"])
    print("Named downhill ways", data["eligibleNamedWays"])
    print("Verified exact-node candidates", data["exactSharedNodeJunctionCandidates"])
    print("Largest connected component", data["largestComponentWayCount"])
    for component in data["components"][:5]:
        print("Component", component["wayCount"], "ways /",
              component["sharedNodes"], "candidate shared nodes")
        for w in component["ways"][:8]:
            print("  ", w["id"], w["name"], w["difficulty"], w["lengthM"], "m")
    if data["eligibleNamedWays"] < 3 or data["largestComponentWayCount"] < 3:
        print("WARNING: No verified 3-way connected area; do not publish a network.")


if __name__ == "__main__":
    main()
