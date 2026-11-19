#!/usr/bin/env python3
"""Discover *official* LiDAR HD ground-DEM tiles; never download/publish assets.

The IGN WFS endpoint indexes kilometer tiles. This discovery output is evidence,
not a guarantee of usable elevation data or lawful reproduction of a specific file.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

ENDPOINT = "https://data.geopf.fr/wfs/ows"
LAYER = "IGNF_LIDAR-HD_METADONNEE:metadata"
DEFAULT_BBOX = (6.115, 44.982, 6.165, 45.020)  # W,S,E,N; screening only


def params(bbox, count=500):
    west, south, east, north = bbox
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError("Invalid WGS84 bounds (west south east north)")
    if east - west > 0.20 or north - south > 0.20:
        raise ValueError("Rejecting broad, expensive tile survey")
    return {
        "SERVICE": "WFS", "VERSION": "2.0.0", "REQUEST": "GetFeature",
        "TYPENAMES": LAYER, "OUTPUTFORMAT": "application/json",
        "SRSNAME": "CRS:84",
        "BBOX": ",".join(map(str, bbox)) + ",CRS:84",
        "COUNT": str(count),
    }


def approved_tile_url(value):
    if not isinstance(value, str) or not value.strip():
        return None
    url = value.strip()
    parts = urlparse(url)
    if (parts.scheme != "https" or parts.username or parts.password or
            parts.port not in (None, 443) or parts.hostname not in
            {"data.geopf.fr", "wxs.ign.fr", "geoservices.ign.fr"}):
        return None
    if not parts.path.lower().endswith((".tif", ".tiff", ".zip")):
        return None
    return url


def summarize(document, bbox):
    if document.get("type") != "FeatureCollection" or not isinstance(document.get("features"), list):
        raise ValueError("IGN WFS returned something other than a GeoJSON FeatureCollection")
    features = document["features"]
    rows = []
    for feature in features:
        properties = feature.get("properties") or {}
        if not isinstance(properties, dict):
            continue
        # The official IGN metadata layer advertises an explicit URL for a
        # ground model; DO NOT substitute a canopy model, DSM or a LAZ cloud.
        raw = next((v for k, v in properties.items() if k.lower() == "url_mnt"), None)
        url = approved_tile_url(raw)
        rows.append({
            "featureId": str(feature.get("id", "")),
            "mntUrl": url,
            "hasMntDownload": bool(url),
            "edition": properties.get("date_edition"),
            "mission": properties.get("code_mission"),
            "sourceProperties": sorted(properties.keys()),
        })
    rows.sort(key=lambda x: x["featureId"])
    return {
        "stage": "index_only_not_dem_verified",
        "source": "IGN LiDAR HD WFS, metadata layer",
        "licenseMetadata": "IGN MNT LiDAR HD: Licence Ouverte 2.0; verify individual file",
        "bboxWGS84_W_S_E_N": list(bbox),
        "returnedFeatures": len(features),
        "featuresWithApprovedMntUrl": sum(row["hasMntDownload"] for row in rows),
        "possibleTruncation": (document.get("numberMatched") not in (None, "unknown")
                               and str(document.get("numberMatched")) != str(len(features))),
        "tiles": rows,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bbox", nargs=4, type=float, default=DEFAULT_BBOX,
                        metavar=("W", "S", "E", "N"))
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--raw-out", type=Path, required=True)
    parser.add_argument("--source-file", type=Path,
                        help="Offline saved WFS GeoJSON; do not contact the server")
    args = parser.parse_args()
    parameters = params(args.bbox)
    url = ENDPOINT + "?" + urlencode(parameters)
    if args.source_file:
        raw = args.source_file.read_bytes()
    else:
        request = Request(url, headers={"User-Agent": "ColdSmokeReality/1.0 (source audit)"})
        with urlopen(request, timeout=90) as response:
            raw = response.read(8 * 1024 * 1024 + 1)
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError("Index response too large")
    doc = json.loads(raw)
    report = summarize(doc, tuple(args.bbox))
    report.update({
        "queriedAtUTC": datetime.now(timezone.utc).isoformat(),
        "wfsRequest": url,
        "sourceResponseSha256": hashlib.sha256(raw).hexdigest(),
    })
    args.raw_out.parent.mkdir(parents=True, exist_ok=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.raw_out.write_bytes(raw)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print("IGN tile metadata:", report["returnedFeatures"], "features /",
          report["featuresWithApprovedMntUrl"], "ground DEM links.")
    if not report["featuresWithApprovedMntUrl"]:
        print("NO VERIFIED MNT TILE URL: remain blocked; do not publish terrain.")


if __name__ == "__main__":
    main()
