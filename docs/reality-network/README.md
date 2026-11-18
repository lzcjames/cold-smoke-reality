# La Balme piste network

Open the Alpe d’Huez piste network from the title screen or append
`?reality=alpe-dhuez&network=1`. It starts on the incoming section of
Déversoir, about 65 m along the mapped line before the fork. The original
`?reality=alpe-dhuez` still starts on La Balme in single-piste mode.

## Survey and data sources

The retained OSM snapshot is dated **2026-11-18 18:17:25 UTC**. The survey
checked 208 downhill ways from Overpass within the WGS84 bounding box
45.085° N, 6.065° E to 45.120° N, 6.115° E. Exact line intersections and
shared node IDs agree on the two direct neighbours below. Proximity
alone is insufficient for an edge. For example, the other way named
Déversoir (1219562168) comes within 145 m of La Balme and does not
intersect it. Combe Charbonnière (150810517) is approximately 170 m
away at its closest. Neither adds a direct connection. The source extracts are
[La Balme](../../data/reality/la-balme.osm.json) and
[neighbouring ways](../../data/reality/la-balme-neighbours.osm.json).
These contain © OpenStreetMap contributors data under the ODbL 1.0.

| OSM node | Latitude, longitude | Lambert-93 E, N (m) | Downhill choices |
|---|---|---|---|
| [251693664](https://www.openstreetmap.org/node/251693664) | 45.1050884, 6.1019936 | 943913.90, 6449882.07 | Incoming Déversoir [256295592](https://www.openstreetmap.org/way/256295592) can continue left on Déversoir (red) or turn right onto La Balme [23257919](https://www.openstreetmap.org/way/23257919) (black) |
| [253678404](https://www.openstreetmap.org/node/253678404) | 45.0915731, 6.0899313 | 943024.63, 6448345.00 | La Balme joins Campanules [23257916](https://www.openstreetmap.org/way/23257916) (red), left from the La Balme approach. Incoming Campanules joins the same downhill continuation |

A junction requires the same OSM node ID and exact source coordinates.
The importer orders each way downhill from its endpoint elevations.
An approach or exit must have at least 12 m of mapped line and at least
0.5 m of signed elevation change measured up to 25 m from the node.
The left/straight/right arrows compare the incoming 22 m chord with
the outgoing 24 m chord, using ±0.26 radians for straight ahead.
This validates mapped topological and downhill continuity. It does
not indicate current snow, opening or avalanche conditions.

## Terrain and navigation

The three ways share the existing `grid`: IGN RGE ALTI, 628 × 728
at 15 m in EPSG:2154, the same 6.025–6.150° E and 45.050–45.145° N
coverage and 20 m interior border as the original release. No DEM data,
license, acquisition cost or area was added. The original numbers on La
Balme are unchanged. Red stakes mark the two other pistes. Direction
panels are approximately 22 m up the incoming line and 18 m to its
side, using the destination's difficulty tint for the face and support.
The panel rear omits the arrow. Crossing the former La Balme end on
Campanules continues on the same surface. The network run restarts
when the player leaves the DEM interior or skis 68 m from every
surveyed line.

The graph and marker positions are prepared once. A 96 m cell index
limits distance queries to local candidate segments. New decorations
use a 768 × 80 RGBA atlas and a shared vertex buffer. The camera's
192 m longitudinal band and its neighbours are submitted as at most
one draw, with a lateral bounds check. The
original mode instantiates neither the network nor its decoration
pipeline, and there is still only one height array and terrain clipmap.

To reproduce the graph from the retained extracts:

```sh
/usr/bin/python3 -B tools/reality/network.py \
  --asset data/reality/alpe-dhuez.json \
  --osm data/reality/la-balme.osm.json data/reality/la-balme-neighbours.osm.json \
  --out /tmp/alpe-dhuez-network.json
cmp /tmp/alpe-dhuez-network.json data/reality/alpe-dhuez.json
```
