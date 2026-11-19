#!/usr/bin/env python3
"""Produce one real resort pack from a licensed local DEM and surveyed OSM ways.

No web requests or synthetic geometry. Every selected piste and junction must
exist in the supplied timestamped OSM export and the DEM must cover it.
"""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path


def load_module(file, name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def selected_ways(document, primary, neighbours):
    """Validate the *actual* Overpass way IDs and node/geometry pairs."""
    wanted = {primary, *neighbours}
    if not 3 <= len(wanted) <= 5 or len(wanted) != len(neighbours) + 1:
        raise ValueError("Select 1 primary + 2–4 distinct neighbouring OSM ways.")
    elements = document.get("elements")
    if not isinstance(elements, list):
        raise ValueError("OSM export must contain an elements array.")
    ways = [way for way in elements if way.get("type") == "way" and
            way.get("id") in wanted]
    if len(ways) != len(wanted) or {way["id"] for way in ways} != wanted:
        raise ValueError("Selected OSM ways are missing or duplicated.")
    for way in ways:
        tags = way.get("tags", {})
        nodes, coords = way.get("nodes"), way.get("geometry")
        if (tags.get("piste:type") != "downhill" or
                tags.get("area") == "yes" or
                not (tags.get("piste:name") or tags.get("name")) or
                not isinstance(nodes, list) or
                not isinstance(coords, list) or len(nodes) != len(coords) or
                len(nodes) < 2 or len(set(nodes)) != len(nodes)):
            raise ValueError("Not a measured named downhill line: OSM way %s" % way["id"])
        if any(not isinstance(c, dict) or not isinstance(c.get("lon"), (int, float))
               or not isinstance(c.get("lat"), (int, float)) or
               not -180 <= c["lon"] <= 180 or not -90 <= c["lat"] <= 90
               for c in coords):
            raise ValueError("Invalid OSM node coordinates in way %s" % way["id"])
    return ways


def build_pack(dem, osm, source, primary, neighbours, bounds, piste_bounds,
               resort_id, dem_edition, dem_reference):
    if not dem.exists() or not dem.is_file():
        raise ValueError("A real local DEM GeoTIFF is required.")
    if not osm.exists() or not osm.is_file():
        raise ValueError("A real Overpass export is required.")
    if not dem_edition.strip() or not dem_reference.strip():
        raise ValueError("Record the actual DEM product edition and source URL.")
    document = json.loads(osm.read_text(encoding="utf-8"))
    stamp = document.get("osm3s", {}).get("timestamp_osm_base")
    if not stamp or "T" not in stamp or not stamp.endswith("Z"):
        raise ValueError("Overpass OSM snapshot must include a UTC timestamp.")
    ways = selected_ways(document, primary, neighbours)
    imp = load_module("import.py", "measured_reality_import")
    graph = load_module("network.py", "measured_reality_network")
    asset = imp.build(dem, osm, source, primary, resort_id, bounds, piste_bounds)
    asset.update(graph.build(asset, ways, primary_id=primary, neighbour_ids=set(neighbours)))
    if not asset["junctions"] or not any(len(j["outgoing"]) > 1 for j in asset["junctions"]):
        raise ValueError("No confirmed OSM downhill fork among the selected ways.")
    # An unrelated piste near the chosen resort must not sneak into the pack
    # just because another pair forms a valid junction.
    adjacency = {p["osmWay"]: set() for p in asset["pistes"]}
    for junction in asset["junctions"]:
        ids = set(junction["incoming"] + junction["outgoing"])
        for osm_id in ids:
            adjacency[osm_id].update(ids - {osm_id})
    reachable, pending = set(), [primary]
    while pending:
        item = pending.pop()
        if item in reachable:
            continue
        reachable.add(item)
        pending.extend(adjacency[item] - reachable)
    if reachable != set(adjacency):
        raise ValueError("Some selected pistes are not connected by exact OSM nodes.")
    asset["provenance"] = {
        "osm": "© OpenStreetMap contributors · ODbL 1.0",
        "osmTimestampUTC": stamp,
        "osmSha256": sha256(osm),
        "wayIds": [primary, *sorted(neighbours)],
        "demSource": imp.SOURCES[source],
        "demEdition": dem_edition.strip(),
        "demReference": dem_reference.strip(),
        "demSha256": sha256(dem),
        "cropWGS84": list(bounds),
        "pisteBoundsWGS84": list(piste_bounds),
    }
    return asset


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dem", type=Path, required=True, help="Real IGN or Copernicus GeoTIFF")
    parser.add_argument("--osm", type=Path, required=True, help="Timestamped Overpass JSON, out geom")
    parser.add_argument("--source", required=True, choices=("ign", "ign-lidar-hd", "copernicus"))
    parser.add_argument("--primary-way", type=int, required=True)
    parser.add_argument("--neighbour-way", type=int, action="append", required=True,
                        help="Repeat 2–4 times; must share exact OSM node IDs with the graph")
    parser.add_argument("--resort-id", default="les-deux-alpes", choices=("les-deux-alpes",))
    parser.add_argument("--crop-bounds", nargs=4, type=float, required=True,
                        metavar=("W", "S", "E", "N"))
    parser.add_argument("--piste-bounds", nargs=4, type=float, required=True,
                        metavar=("S", "W", "N", "E"))
    parser.add_argument("--dem-edition", required=True, help="Exact product/version/tile ID")
    parser.add_argument("--dem-reference", required=True, help="Published DEM source URL")
    parser.add_argument("--out", type=Path,
                        default=Path("data/reality/les-deux-alpes.json"))
    args = parser.parse_args()
    west, south, east, north = args.crop_bounds
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        parser.error("Invalid WGS84 crop bounds")
    south, west, north, east = args.piste_bounds
    if not (-90 <= south < north <= 90 and -180 <= west < east <= 180):
        parser.error("Invalid WGS84 piste bounds")
    asset = build_pack(args.dem, args.osm, args.source,
                       args.primary_way, args.neighbour_way,
                       args.crop_bounds, args.piste_bounds, args.resort_id,
                       args.dem_edition, args.dem_reference)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(asset, ensure_ascii=False, separators=(",", ":")) +
                        "\n", encoding="utf-8")
    print("Verified real resort %s: %s pistes, %s exact-node junctions, %s DEM samples" %
          (asset["id"], len(asset["pistes"]), len(asset["junctions"]),
           len(asset["grid"]["heights"])))


if __name__ == "__main__":
    main()
