#!/usr/bin/env python3
"""Extract real Les Deux Alpes downhill OSM ways from a Geofabrik .osm.pbf.

Fallback for overloaded public Overpass. Preserves original way IDs, original
node IDs, exact node coordinates and OSM tags; never infers a junction from
proximity. Requires Python PyOsmium.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path

BOUNDS = (44.975, 6.095, 45.050, 6.205)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pbf", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--max-way", type=int, default=2500)
    args = parser.parse_args()
    import osmium  # imported only when the PBF extraction is requested

    class Survey(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.ways = []
            self.skipped = 0

        def way(self, way):
            tags = way.tags
            if tags.get("piste:type") != "downhill" or tags.get("area") == "yes":
                return
            name = tags.get("piste:name") or tags.get("name")
            if not name:
                return
            points = []
            try:
                for node in way.nodes:
                    if not node.location.valid():
                        self.skipped += 1
                        return
                    points.append({
                        "lat": round(node.location.lat, 7),
                        "lon": round(node.location.lon, 7),
                    })
            except (ValueError, RuntimeError):
                self.skipped += 1
                return
            if len(points) < 2:
                return
            south, west, north, east = BOUNDS
            if any(not (south <= p["lat"] <= north and west <= p["lon"] <= east)
                   for p in points):
                return
            if len(self.ways) >= args.max_way:
                raise RuntimeError("Too many eligible ways; refuse truncated OSM survey.")
            self.ways.append({
                "type": "way", "id": int(way.id), "nodes": [int(n.ref) for n in way.nodes],
                "geometry": points,
                "tags": {str(t.k): str(t.v) for t in way.tags},
            })

    survey = Survey()
    survey.apply_file(str(args.pbf), locations=True)
    sha = hashlib.sha256()
    with args.pbf.open("rb") as source:
        for chunk in iter(lambda: source.read(4 * 1024 * 1024), b""):
            sha.update(chunk)
    provenance = {
        "source": "Geofabrik OSM Rhone-Alpes · © OpenStreetMap contributors ODbL 1.0",
        "pbfURL": args.source_url,
        "pbfSHA256": sha.hexdigest(),
        "retrievedUTC": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "osmTimestamp": None,
        "waysWithoutLocations": survey.skipped,
    }
    snapshot = {"version": 0.6, "generator": "PyOsmium / Geofabrik source",
                "elements": survey.ways, "p4_provenance": provenance}
    args.out.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n")
    print("Verified OSM way IDs:", len(survey.ways))
    print("PBF SHA-256", provenance["pbfSHA256"])
    print("Source:", args.source_url)
    if len(survey.ways) < 3:
        raise RuntimeError("Fewer than 3 eligible named downhill ways in source region.")


if __name__ == "__main__":
    main()
