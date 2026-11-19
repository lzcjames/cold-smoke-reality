"""P4 geodata gates with known real Alpe d'Huez OSM and synthetic negatives.

These tests never substitute fabricated Les Deux Alpes survey points.
Run after python3-gdal installation in the GIS job.
"""

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def module(path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "tools/reality" / path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


osm_tool = module("p4_osm.py", "osm_p4")
pipeline = module("p4_import.py", "pipeline_p4")
graph = module("network.py", "graph_p4")

bbox = [44.98, 6.10, 45.06, 6.22]  # research envelope, not a measured piste
q = osm_tool.query_for_bbox(bbox)
assert 'piste:type' in q and "out body geom" in q
for invalid_bbox in [[-91, 6, 45, 6.5], [45, 6, 45, 6.2], [44, 5, 46, 7]]:
    try:
        osm_tool.query_for_bbox(invalid_bbox)
    except ValueError:
        pass
    else:
        raise AssertionError("Unexpectedly accepted invalid or large Overpass bbox")

first = json.loads((ROOT / "data/reality/la-balme.osm.json").read_text())
second = json.loads((ROOT / "data/reality/la-balme-neighbours.osm.json").read_text())
known = {"osm3s": first["osm3s"], "elements": first["elements"] + second["elements"]}
overview = osm_tool.inspect(known)
assert overview["surveyWays"] == 3
assert overview["timestampUTC"] == "2026-11-18T18:17:25Z"
assert "251693664" in overview["sharedNodeWayIds"]
assert "253678404" in overview["sharedNodeWayIds"]
assert set(overview["sharedNodeWayIds"]["251693664"]) == {23257919, 256295592}

real_primary = 23257919
neighbour_ids = [23257916, 256295592]
selected = pipeline.selected_ways(known, real_primary, neighbour_ids)
assert {w["id"] for w in selected} == {23257919, 23257916, 256295592}

actual = json.loads((ROOT / "data/reality/alpe-dhuez.json").read_text())
rebuilt = graph.build(actual, selected, primary_id=real_primary,
                      neighbour_ids=set(neighbour_ids))
assert rebuilt["pistes"] == actual["pistes"]
assert rebuilt["junctions"] == actual["junctions"]

# Topology-only fixture (not production resort data): a branch that joins a
# different branch must yield a candidate even when absent from the primary.
# The real DEM still decides whether such a candidate is skiable.
chain = [
    {"osmWay": 1, "nodes": [10, 20]},
    {"osmWay": 2, "nodes": [20, 30]},
    {"osmWay": 3, "nodes": [30, 40]},
]
assert graph.junction_node_ids(chain) == [20, 30]
assert graph.junction_node_ids([
    {"osmWay": 1, "nodes": [10, 20, 30]},
    {"osmWay": 2, "nodes": [20, 30]},
    {"osmWay": 3, "nodes": [30, 40]},
]) == [20, 30]
assert graph.junction_node_ids([
    {"osmWay": 1, "nodes": [10, 20]},
    {"osmWay": 2, "nodes": [30, 40]},
]) == []

for bad in [
    (real_primary, [23257916, 23257916]),
    (real_primary, [23257916, 999999999]),
    (real_primary, [23257916]),
    (real_primary, [23257916, 256295592, 999999999]),
]:
    try:
        pipeline.selected_ways(known, *bad)
    except ValueError:
        pass
    else:
        raise AssertionError("Invalid selected OSM ways unexpectedly accepted: " + str(bad))

broken = json.loads(json.dumps(known))
broken["elements"][0]["geometry"][0]["lat"] = 180
try:
    pipeline.selected_ways(broken, real_primary, neighbour_ids)
except ValueError:
    pass
else:
    raise AssertionError("Invalid GIS coordinate unexpectedly accepted")

# P4 was published after a full authentic OSM + IGN MNT source audit.
# Require the pinned source identity and actual directed OSM junctions here;
# an invented or substituted second resort must now fail GIS preflight.
published = json.loads((ROOT / "data/reality/les-deux-alpes.json").read_text())
assert published["id"] == "les-deux-alpes"
assert published["version"] == 1
assert published["piste"]["osmWay"] == 219409078
assert {p["osmWay"] for p in published["pistes"]} == {
    219409078, 643745486, 643786947
}
assert {j["osmNode"] for j in published["junctions"]} == {
    6057592057, 6057592113
}
assert published["provenance"]["osmTimestampUTC"] == "2026-07-24T11:04:51Z"
assert published["provenance"]["osmSha256"] == (
    "40dcc37e95a259fb7d0f036e10e4147ce9c7343fb69b167c23ec92241da5ff26"
)
assert "IGN LiDAR HD MNT 0.5 m" in published["elevationSource"]
assert len(published["grid"]["heights"]) == (
    published["grid"]["cols"] * published["grid"]["rows"]
)
print("P4 GIS preflight passed: both real resorts and pinned P4 survey provenance")
