# Real IGN Jandri 2 browser laboratory (not ski gameplay)

After the official IGN MNT workflow produced authenticated Jandri 2
terrain tiles, this developer-only page provides an actual **WebGL
view of six original measured ground chunks** on GitHub Pages.

Expected address after successful main deployment:

https://lzcjames.github.io/cold-smoke-reality/ign-lab/

It does not load on the normal landing page and does **not** register
new routes, lift access, groomed piste boundaries or collision ground.

## Publishing integrity

The Pages build retrieves a known audited, source-only GitHub Actions
artifact from run 45054544727 (same-repository, 24 official IGN TIFF
source audit). Before staging the small derived JSON tiles, it requires
all these checks to pass:

- The candidate's original OSM SHA, official tile identities and
  non-playability source flags match the original measured report.
- All six tiles reproduce the original measured grid byte-verified,
  including overlapping source height nodes.
- The source-only synchronous sampler agrees at all measured vertices
  and interior cell midpoints without inventing data outside coverage.
- The measured triangle geometry agrees across every tile boundary.

If the archived source is missing or expired, the public **game
continues to deploy without the optional preview**. If source files
exist but fail validation, the Pages workflow fails closed instead
of silently showing fabricated ground.

The page uses no third-party JS or GPU framework. It verifies each
actual tile's SHA-256 with Web Crypto **before** constructing WebGL
buffers. Each chunk is capped at 4096 vertices. Pointer dragging
rotates the camera; wheel zoom changes inspection distance.
The production page does not fetch these resources.

Attribution: **MNT LiDAR HD © IGN — Licence Ouverte / Open Licence 2.0**,
https://www.data.gouv.fr/datasets/mnt-lidar-hd .
Any missing coverage, off-piste safety boundaries, signage, or 3200m
summit descent remain unverified. The viewer is explicitly not an
interactive ski resort.

## Remaining work to make a real playable area

Register an independently reviewed terrain/world origin in the
existing physics renderer, stream only a small stable working set
near the player, use preloaded synchronous height snapshots for
both skis, and pass true browser skiing smoothness across tile seams.
A visualization-only page cannot authorize any ski piste.
