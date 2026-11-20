#!/usr/bin/env python3
"""Measure each exact shared Jandri OSM node and slopes on each adjacent arm.

Only evaluates bare-earth MNT values; shared coordinates do not authorize
playable junctions, signs, groomed widths, or automatically directed links.
"""
import math


def measure_shared_nodes(index, project, height_at, sample_distance_m=15.0):
    if not (0 < sample_distance_m <= 30):
        raise ValueError("Invalid local sampling distance")
    members = {}
    for way in index["features"]:
        if way.get("type") != "way" or not way.get("drawable"):
            continue
        nodes, coords = way["nodes"], way["coordinates"]
        if len(nodes) != len(coords) or len(nodes) < 2:
            raise ValueError("Malformed pinned OSM way")
        for i, node in enumerate(nodes):
            xy = tuple(coords[i])
            members.setdefault(node, []).append((way, i, xy))

    candidates = []
    for osm_node, refs in sorted(members.items()):
        if len({w["names"][0] for w, _, _ in refs}) <= 1:
            continue
        xy = refs[0][2]
        if any(other != xy for _, _, other in refs):
            raise ValueError("Conflicting original shared-node geometry")
        x, y = project(*xy)
        h = float(height_at(x, y))
        if not math.isfinite(h):
            raise ValueError("No real MNT elevation at shared OSM node")
        arms = []
        for way, index_in_way, _ in refs:
            for neighbour_index in (index_in_way - 1, index_in_way + 1):
                if not 0 <= neighbour_index < len(way["coordinates"]):
                    continue
                other = way["coordinates"][neighbour_index]
                ex, ey = project(*other)
                length = math.hypot(ex-x, ey-y)
                if length < .01:
                    raise ValueError("Repeated projected OSM node near junction")
                distance = min(sample_distance_m, length / 2)
                fraction = distance / length
                neighbour_h = float(height_at(x+(ex-x)*fraction, y+(ey-y)*fraction))
                if not math.isfinite(neighbour_h):
                    raise ValueError("Nodata real MNT along shared-node arm")
                rise = neighbour_h - h
                arms.append({
                    "osmWay": way["id"], "name": way["names"][0],
                    "nodeIndex": index_in_way, "adjacentNode": way["nodes"][neighbour_index],
                    "armPosition": "toward_previous_OSM_node" if neighbour_index < index_in_way
                                   else "toward_next_OSM_node",
                    "sampleDistanceM": round(distance, 3),
                    "heightAwayFromNodeM": round(neighbour_h, 3),
                    "riseAwayFromNodeM": round(rise, 3),
                    "gradeAwayFromNodePct": round(100*rise/distance, 2),
                    "downhillAwayFromNodeByHeightOnly": rise < 0
                })
        candidates.append({
            "osmNode": osm_node, "coordinatesWGS84": list(xy),
            "projectedLambert93": [round(x, 3), round(y, 3)],
            "measuredGroundHeightM": round(h, 3),
            "arms": arms, "allArmsMeasured": len(arms) >= len(refs),
            "approvedPlayableConnection": False,
            "approvedDirectionalSign": False,
            "reason": "Local bare-earth slope does not establish safe skiable piste width, priority, grooming, traversability or signage."
        })
    return candidates
