#!/usr/bin/env python3
"""Add a surveyed, directed OSM junction graph to the existing DEM asset."""
import argparse
import json
import math
from pathlib import Path
from osgeo import osr

PRIMARY = 23257919
NEIGHBOURS = {23257916, 256295592}


def build(asset, ways):
    grid = asset["grid"]
    w, h, step = grid["cols"], grid["rows"], grid["step"]
    samples = grid["heights"]
    refs = [osr.SpatialReference(), osr.SpatialReference()]
    for ref, code in zip(refs, [4326, 2154]):
        ref.ImportFromEPSG(code)
        ref.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    transform = osr.CoordinateTransformation(*refs)

    def sample(point):
        x, y = (point[0] - grid["east"]) / step, (grid["north"] - point[1]) / step
        if not (20 / step <= x <= w - 1 - 20 / step and 20 / step <= y <= h - 1 - 20 / step):
            raise ValueError("Piste outside the DEM or its 20 metre border")
        i, j = int(x), int(y)
        u, v = x - i, y - j
        k = j * w + i
        return (1 - v) * ((1 - u) * samples[k] + u * samples[k + 1]) + v * (
            (1 - u) * samples[k + w] + u * samples[k + w + 1])

    pistes, node_coords = [], {}
    for way in sorted(ways, key=lambda way: (way["id"] != PRIMARY, way["id"])):
        tags = way["tags"]
        name = tags.get("piste:name") or tags.get("name")
        nodes, coords = way["nodes"], way["geometry"]
        if (tags.get("piste:type") != "downhill" or not name or
                len(nodes) != len(coords) or len(set(nodes)) != len(nodes)):
            raise ValueError(f"Invalid piste {way['id']}")
        points = []
        for node, c in zip(nodes, coords):
            lonlat = [c["lon"], c["lat"]]
            if node_coords.setdefault(node, lonlat) != lonlat:
                raise ValueError(f"Shared node {node} has conflicting coordinates")
            point = [round(value, 2) for value in transform.TransformPoint(*lonlat)[:2]]
            sample(point)
            points.append(point)
        if sample(points[-1]) > sample(points[0]):
            points.reverse()
            nodes = nodes[::-1]
        if sample(points[0]) - sample(points[-1]) < 5:
            raise ValueError(f"Insufficient endpoint descent {way['id']}")
        pistes.append({"osmWay": way["id"], "name": name, "difficulty": tags.get("piste:difficulty"),
                       "nodes": nodes, "points": points})

    primary = pistes[0]
    if primary["osmWay"] != PRIMARY or primary["points"] != asset["piste"]["points"]:
        raise ValueError("Primary piste differs from the previously shipped centreline")
    if {p["osmWay"] for p in pistes[1:]} != NEIGHBOURS:
        raise ValueError("Missing surveyed neighbouring piste")

    junctions = []
    for index, node in enumerate(primary["nodes"]):
        linked = [p for p in pistes if node in p["nodes"]]
        if len(linked) < 2:
            continue
        point = primary["points"][index]
        directions = {"incoming": [], "outgoing": []}
        for piste in linked:
            i = piste["nodes"].index(node)
            for step_dir, key in [(-1, "incoming"), (1, "outgoing")]:
                distance, previous = 0, point
                for j in range(i + step_dir, len(piste["points"]) if step_dir > 0 else -1, step_dir):
                    other = piste["points"][j]
                    length = math.dist(previous, other)
                    if length == 0:
                        continue
                    if distance + length >= 25:
                        t = (25 - distance) / length
                        previous = [a + (b - a) * t for a, b in zip(previous, other)]
                        distance = 25
                        break
                    distance += length
                    previous = other
                if distance >= 12 and (sample(point) - sample(previous)) * step_dir >= 0.5:
                    directions[key].append(piste["osmWay"])
        if not directions["incoming"] or not directions["outgoing"]:
            raise ValueError(f"Junction {node} lacks a confirmed downhill transition")
        junctions.append({"osmNode": node, "lonLat": node_coords[node], "point": point, **directions})
    return {"pistes": pistes, "junctions": junctions}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--asset", type=Path, required=True)
    p.add_argument("--osm", type=Path, nargs="+", required=True)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()
    asset = json.loads(args.asset.read_text())
    ways = [way for path in args.osm for way in json.loads(path.read_text())["elements"]]
    asset.update(build(asset, ways))
    args.out.write_text(json.dumps(asset, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
