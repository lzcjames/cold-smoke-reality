#!/usr/bin/env python3
"""Fail-closed independent OSM quadrant survey for Les Deux Alpes region.

Each response retains independent timestamp, original raw bytes and SHA256.
Partial snapshots are NEVER merged into an invented atomic OSM snapshot.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode

try:
    from .p4_osm import OVERPASS, inspect, query_for_bbox
except ImportError:
    from p4_osm import OVERPASS, inspect, query_for_bbox

DEFAULT_BBOX = (44.97, 6.05, 45.09, 6.23)

def shards(bbox=DEFAULT_BBOX):
    south, west, north, east = bbox
    if not -90 <= south < north <= 90 or not -180 <= west < east <= 180:
        raise ValueError("Invalid WGS84 survey bounds")
    midlat=(south+north)/2
    midlon=(west+east)/2
    return [(south,west,midlat,midlon),(south,midlon,midlat,east),
            (midlat,west,north,midlon),(midlat,midlon,north,east)]

def fetch_raw(query):
    payload=urlencode({"data":query}).encode()
    errors=[]
    for url in OVERPASS:
        try:
            req=Request(url,data=payload,headers={
                "User-Agent":"ColdSmokeReality/1.0 (source-only resort survey)",
                "Content-Type":"application/x-www-form-urlencoded"})
            with urlopen(req,timeout=75) as res:
                raw=res.read(25*1024*1024+1)
            if len(raw)>25*1024*1024:
                raise ValueError("Overpass source exceeds size budget")
            return raw
        except (OSError,TimeoutError) as exc:
            errors.append(type(exc).__name__)
    raise RuntimeError("Both Overpass services failed: "+", ".join(errors))

def survey(out, query_fn=query_for_bbox, fetch_fn=fetch_raw, bbox=DEFAULT_BBOX):
    out=Path(out)
    out.mkdir(parents=True,exist_ok=True)
    results=[]
    for idx,box in enumerate(shards(bbox),1):
        tag=f"quadrant-{idx}"
        entry={"id":tag,"bboxWGS84":list(box),"status":"blocked_no_usable_source",
               "sourceApprovedForGameplay":False}
        try:
            # One bound request per box; never copy neighbours to cover gaps.
            raw=fetch_fn(query_fn(box))
            doc=json.loads(raw)
            review=inspect(doc)
            if len(raw)>25*1024*1024:
                raise ValueError("Source fragment exceeds 25MiB")
            sourcefile=out/(tag+"-overpass-raw.json")
            sourcefile.write_bytes(raw)
            reviewfile=out/(tag+"-review.json")
            reviewfile.write_text(json.dumps(review,indent=2)+"\n",encoding="utf8")
            entry.update({"status":"source_candidates_unreviewed",
                          "file":sourcefile.name,
                          "rawResponseSHA256":hashlib.sha256(raw).hexdigest(),
                          "timestampUTC":review["timestampUTC"],
                          "namedDownhillWays":review["surveyWays"],
                          "review":reviewfile.name})
        except Exception as exc:
            entry["error"]=type(exc).__name__+": "+str(exc)[:250]
        results.append(entry)
        print(tag,entry["status"],entry.get("namedDownhillWays",0),flush=True)
    summary={"schema":"cold-smoke-regional-shard-survey/v1",
             "resortId":"les-deux-alpes",
             "requestedBBoxWGS84":list(bbox),
             "numberOfIndependentResponses":sum(x["status"]=="source_candidates_unreviewed" for x in results),
             "allShardsDownloaded":all(x["status"]=="source_candidates_unreviewed" for x in results),
             "wholeResortMembershipReviewed":False,
             "wholeResortCoverageApproved":False,
             "combinedAtomicSnapshot":False,
             "approvedForGameplay":False,"shards":results}
    (out/"status.json").write_text(json.dumps(summary,indent=2)+"\n",encoding="utf8")
    return summary

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out-dir",type=Path,required=True)
    p.add_argument("--bbox",type=float,nargs=4,metavar=("SOUTH","WEST","NORTH","EAST"),
                   default=DEFAULT_BBOX,
                   help="Subset of WGS84 survey area; still split into four smaller squares")
    args=p.parse_args()
    result=survey(args.out_dir,bbox=tuple(args.bbox))
    if not result["allShardsDownloaded"]:
        print("Incomplete Overpass source survey. Inspect status.json; never infer a full resort.")
    print("Captured",result["numberOfIndependentResponses"],"/4 source quadrants")

if __name__=="__main__":
    main()
