#!/usr/bin/env python3
"""SVG atlas from validated real Jandri OSM polylines (not a playable terrain).

No interpolated joins, fictional way IDs or terrain. Keep labels and legends
distinct from a real ski-area map; OSM piste:difficulty is not operator advice.
"""
import argparse
import html
import json
import math
from pathlib import Path

COLORS = {
    "novice":"#1a965a", "easy":"#287bda",
    "intermediate":"#df5454", "advanced":"#252a38",
    "expert":"#252a38",
}
WIDTH, HEIGHT, PLOT_W = 1440, 1000, 1050

def esc(value):
    return html.escape(str(value),quote=True)

def make_svg(index):
    ways=[r for r in index.get("features",[]) if r.get("type")=="way" and r.get("drawable")]
    if not ways: raise ValueError("No actual OSM Jandri way geometry to draw")
    for way in ways:
        if len(way["nodes"]) != len(way["coordinates"]) or len(way["nodes"])<2:
            raise ValueError("Invalid source geometry")
    bounds=index["boundsWGS84"]
    lon0=(bounds[0]+bounds[2])/2
    lat0=(bounds[1]+bounds[3])/2
    cos=math.cos(math.radians(lat0))
    projected=lambda p: ((p[0]-lon0)*111320*cos,(p[1]-lat0)*111132)
    coords=[projected(p) for way in ways for p in way["coordinates"]]
    minx,maxx=min(p[0] for p in coords),max(p[0] for p in coords)
    miny,maxy=min(p[1] for p in coords),max(p[1] for p in coords)
    scale=min(910/max(1,maxx-minx),860/max(1,maxy-miny))
    xmid=(minx+maxx)/2; ymid=(miny+maxy)/2
    def xy(p):
        x,y=projected(p)
        return (530+(x-xmid)*scale,520-(y-ymid)*scale)
    svg=[
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label="Actual OpenStreetMap Jandri named downhill piste centreline survey">',
        '<rect width="100%" height="100%" fill="#edf4f6"/>',
        '<rect x="25" y="95" width="1020" height="868" rx="18" fill="#e0ebf0" stroke="#b1c8d1"/>',
        '<rect x="1074" y="95" width="345" height="868" rx="18" fill="#ffffff" stroke="#bfd0d5"/>',
        '<text x="35" y="51" font-family="Arial,sans-serif" font-weight="700" font-size="30" fill="#152735">LES DEUX ALPES · JANDRI</text>',
        '<text x="35" y="80" font-family="Arial,sans-serif" font-size="17" fill="#3f5b6c">Real OSM downhill piste centreline atlas — not a playable 3D release</text>'
    ]
    # Fixed-grid 500m local-distance visual reference, no fabricated contour.
    step=500*scale
    if step>=20:
        x=530-(xmid-minx)*scale
        while x<1034:
            if x>=35: svg.append(f'<path d="M{x:.2f} 107 V949" stroke="#c7d9df" stroke-width="1"/>')
            x+=step
        y=520+(ymid-miny)*scale
        while y>107:
            if y<949: svg.append(f'<path d="M35 {y:.2f} H1034" stroke="#c7d9df" stroke-width="1"/>')
            y-=step
    for way in ways:
        pts=[xy(p) for p in way["coordinates"]]
        path="M"+" L".join(f"{p[0]:.1f},{p[1]:.1f}" for p in pts)
        color=COLORS.get(way.get("tags",{}).get("piste:difficulty"),"#767f8f")
        svg.append(f'<path d="{path}" fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>')
        svg.append(f'<path d="{path}" fill="none" stroke="{color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>')
        svg.append(f'<circle cx="{pts[0][0]:.1f}" cy="{pts[0][1]:.1f}" r="3" fill="#253e4f"/>')
    # Name once per matched name on longest genuinely sourced way.
    byname={}
    for way in ways:
        label=way["names"][0]
        if label not in byname or way["approxPlanarLengthM"]>byname[label]["approxPlanarLengthM"]:
            byname[label]=way
    for name,way in byname.items():
        pts=[xy(p) for p in way["coordinates"]]
        x,y=pts[len(pts)//2]
        svg.append(f'<text x="{x+10:.0f}" y="{y-11:.0f}" font-family="Arial,sans-serif" font-size="17" font-weight="700" paint-order="stroke" stroke="#fff" stroke-width="5" fill="#18354b">{esc(name)}</text>')
    svg.extend([
        '<path d="M945 190 V129" stroke="#17384e" stroke-width="4"/>',
        '<path d="M934 148 L945 125 L956 148" fill="none" stroke="#17384e" stroke-width="4"/>',
        '<text x="935" y="116" font-size="20" font-family="Arial,sans-serif" fill="#17384e">N</text>',
        '<text x="1094" y="140" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="#1a3140">OSM ROUTES</text>',
        f'<text x="1094" y="166" font-family="Arial,sans-serif" font-size="14" fill="#537087">{len(ways)} named way segments</text>'
    ])
    # Each named way group shown; no claim that a route is complete.
    groups={}
    for way in ways: groups.setdefault(way["names"][0],[]).append(way)
    y=203
    for name,group in sorted(groups.items(),key=lambda p:p[0].lower()):
        if y>872: break
        difficulty=group[0].get("tags",{}).get("piste:difficulty","unknown")
        color=COLORS.get(difficulty,"#767f8f")
        distance=sum(w["approxPlanarLengthM"] for w in group)
        svg.append(f'<circle cx="1102" cy="{y-5}" r="7" fill="{color}"/>')
        svg.append(f'<text x="1119" y="{y}" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="#1b3243">{esc(name)}</text>')
        svg.append(f'<text x="1119" y="{y+21}" font-family="Arial,sans-serif" font-size="13" fill="#587184">{len(group)} ways · ~{distance/1000:.2f} km · OSM {esc(difficulty)}</text>')
        y+=57
    svg.extend([
        '<text x="35" y="985" font-family="Arial,sans-serif" font-size="14" fill="#435d6c">© OpenStreetMap contributors · ODbL 1.0 · No invented connections · No DEM / snow surface</text>',
        f'<text x="1093" y="928" font-family="Arial,sans-serif" font-size="12" fill="#435d6c">OSM edition: {esc(index.get("snapshotTimestampUTC") or "not reported")}</text>',
        '</svg>'
    ])
    return "\n".join(svg)+"\n"

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--index",required=True)
    parser.add_argument("--out",required=True)
    args=parser.parse_args()
    source=json.loads(Path(args.index).read_text())
    path=Path(args.out)
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(make_svg(source),encoding="utf-8")
    print(f"Rendered {source['wayCount']} actual Jandri OSM ways to {path}")
if __name__=="__main__": main()
