// Junction panels and branch stakes share an atlas, a mesh and a pipeline.
const JunctionSigns = (() => {
  function init(gfx, network) {
    if (!network?.signs.length) return null;
    const { signs, stakes } = network;
    const tileWidth = 256, tileHeight = 80;
    // The old one-row atlas exceeded maxTextureDimension2D above ~16-64
    // junction boards, depending on the GPU. Pack into a capped 2D grid.
    const textureLimit = Math.min(4096, gfx.caps?.maxTex || 4096);
    const columns = Math.min(signs.length, Math.floor(textureLimit / tileWidth));
    const rows = Math.ceil(signs.length / columns);
    if (!columns || rows * tileHeight > textureLimit) {
      throw Error('Junction sign atlas exceeds GPU texture limit.');
    }
    const canvas = document.createElement('canvas');
    canvas.width = tileWidth * columns;
    canvas.height = tileHeight * rows;
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'middle';
    for (const [i, sign] of signs.entries()) {
      const x = (i % columns) * tileWidth, y = Math.floor(i / columns) * tileHeight;
      ctx.fillStyle = PisteMarkers.colour(sign.difficulty);
      ctx.fillRect(x, y, tileWidth, tileHeight);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 4, y + 4, tileWidth - 8, tileHeight - 8);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText(sign.arrow, x + 16, y + 41);
      ctx.font = 'bold 25px sans-serif';
      ctx.fillText(sign.name, x + 67, y + 41, 175);
    }
    const texture = gfx.texture({
      w: canvas.width, h: canvas.height, format: 'rgba8',
      data: new Uint8Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer),
    });

    const cell = z => Math.floor(z / 192);
    const groups = new Map();
    function faces(item, i) {
      const { x, y, z, right: [dx, dz] } = item;
      const tint = PisteMarkers.colour(item.difficulty).slice(1).match(/../g).map(v => parseInt(v, 16) / 255);
      const id = cell(z);
      if (!groups.has(id)) groups.set(id, { verts: [], left: x, right: x });
      const group = groups.get(id), { verts } = group;
      group.left = Math.min(group.left, x - 2);
      group.right = Math.max(group.right, x + 2);
      function face(rx, rz, width, lo, hi, offset, u0 = -1, u1 = -1,
                    vTop = 0, vBottom = 1) {
        const px = x - rz * offset, pz = z + rx * offset;
        function vertex(side, h, u, v) {
          verts.push(px + rx * side * width, y + h, pz + rz * side * width, u, v, ...tint);
        }
        vertex(-1, lo, u0, vBottom); vertex(1, lo, u1, vBottom);
        vertex(-1, hi, u0, vTop);
        vertex(1, lo, u1, vBottom); vertex(1, hi, u1, vTop);
        vertex(-1, hi, u0, vTop);
      }
      const sign = i != null, poleWidth = sign ? 0.055 : 0.043;
      for (const [rx, rz] of [[dx, dz], [-dx, -dz], [-dz, dx], [dz, -dx]]) {
        face(rx, rz, poleWidth, -0.44, sign ? 2.20 : 1.46, poleWidth);
      }
      if (sign) {
        // Arrow appears only on the uphill-facing side. The reverse uses the matching solid colour.
        const tileX = (i % columns) * tileWidth;
        const tileY = Math.floor(i / columns) * tileHeight;
        face(dx, dz, 1.48, 1.66, 2.585, 0.077,
          (tileX + 0.5) / canvas.width, (tileX + tileWidth - 0.5) / canvas.width,
          (tileY + 0.5) / canvas.height, (tileY + tileHeight - 0.5) / canvas.height);
        face(-dx, -dz, 1.48, 1.66, 2.585, 0.077);
      } else {
        face(dx, dz, 0.14, 1.00, 1.46, 0.055);
        face(-dx, -dz, 0.14, 1.00, 1.46, 0.055);
      }
    }
    signs.forEach((sign, i) => faces(sign, i));
    stakes.forEach(stake => faces(stake));
    const vertices = [], ranges = new Map(), visible = new Map();
    const ids = [...groups.keys()].sort((a, b) => a - b);
    for (const id of ids) {
      const { verts, left, right } = groups.get(id);
      ranges.set(id, { first: vertices.length / 8, end: (vertices.length + verts.length) / 8, left, right });
      vertices.push(...verts);
    }
    // Consecutive longitudinal bands occupy a single vertex range. Build the three-band windows once.
    for (const id of ids) for (let cameraCell = id - 1; cameraCell <= id + 1; cameraCell++) {
      const range = ranges.get(id), window = visible.get(cameraCell);
      if (window) {
        window.count = range.end - window.first;
        window.left = Math.min(range.left, window.left);
        window.right = Math.max(range.right, window.right);
      } else {
        visible.set(cameraCell, { first: range.first, count: range.end - range.first, left: range.left, right: range.right });
      }
    }
    const vb = gfx.buffer(new Float32Array(vertices), 'vertex');
    const pipe = gfx.pipeline({
      name: 'junctionSigns',
      lib: [SL.common, SL.fog],
      buffers: [{ attrs: [['pos', 'vec3f'], ['uv', 'vec2f'], ['tint', 'vec3f']] }],
      varyings: { wp: 'vec3f', uv: 'vec2f', tint: 'vec3f' },
      uniforms: { origin: 'vec4f' },
      textures: { tSign: '2d', tSky: '2d' },
      vs: `fn vert(a: VIn) -> VOut {
        var v: VOut; v.wp = a.pos - M.origin.xyz; v.uv = a.uv; v.tint = a.tint;
        v.clip = U.viewProj * vec4f(v.wp, 1.0); return v;
      }`,
      fs: `fn frag(v: VOut) -> FOut {
        var o: FOut;
        let texel: vec3f = tex(tSign, v.uv).rgb;
        let ink: vec3f = select(texel, v.tint, v.uv.x < 0.0);
        let light: vec3f = vec3f(0.28) + 0.55 * U.ambSky.rgb + 0.45 * U.ambGnd.rgb + 0.30 * U.sunCol.rgb;
        o.color = vec4f(applyFog(ink * ink * light, v.wp), 0.0); return o;
      }`,
    });
    return {
      pipe,
      stats: { atlasWidth: canvas.width, atlasHeight: canvas.height,
        signs: signs.length, stakes: stakes.length, vertexCount: vertices.length / 8 },
      draw(render) {
        const [x, , z] = render.cam.pos;
        const batch = visible.get(cell(z));
        if (!batch || x < batch.left - 260 || x > batch.right + 260) return;
        gfx.draw(pipe, { first: batch.first, count: batch.count, u: { origin: [...render.origin, 0] },
          tex: { tSign: texture, tSky: Sky.lut }, vb: [vb] });
      },
    };
  }
  return { init };
})();
