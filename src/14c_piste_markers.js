// Numbered piste signs fixed in world space, facing the downhill approach.
const PisteMarkers = (() => {
  const colours = new Map([
    ['novice', '#087a42'], ['easy', '#1259ad'], ['intermediate', '#b7212b'],
    ['advanced', '#171b20'], ['expert', '#171b20'], ['freeride', '#af6915'],
  ]);
  const colour = difficulty => colours.get(difficulty) || '#56616d';

  function layout(terrain) {
    const { start, length, halfWidth, centre, height } = terrain;
    const first = start + 20;
    const spacing = Math.max(135, (length - first) / 14);
    const posts = [];
    for (let s = first; s < length - 12; s += spacing) {
      const side = posts.length % 2 === 0 ? 1 : -1;
      const dx = centre(s + 8) - centre(s - 8), d = Math.hypot(dx, 16);
      const acrossX = 16 / d, acrossZ = dx / d;
      const offset = side * halfWidth * 0.78;
      const x = centre(s) + acrossX * offset, z = -s + acrossZ * offset;
      if (!terrain.contains(x, z)) continue;
      // Toe each face in toward the piste so the lettering can be read on approach.
      const turn = -0.32 * side;
      const faceX = acrossX * Math.cos(turn) + acrossZ * Math.sin(turn);
      const faceZ = acrossZ * Math.cos(turn) - acrossX * Math.sin(turn);
      posts.push({ x, y: height(x, z), z, faceX, faceZ, s });
    }
    return posts.map((post, index) => ({ ...post, number: posts.length - index }));
  }

  function init(gfx, terrain) {
    const posts = layout(terrain);
    if (!posts.length) return null;

    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size * posts.length;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const background = colour(terrain.difficulty);
    for (const [index, post] of posts.entries()) {
      const cx = index * size + size / 2;
      ctx.beginPath();
      ctx.arc(cx, 64, 59, 0, 2 * Math.PI);
      ctx.fillStyle = background;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(terrain.piste, cx, 40, 100);
      ctx.font = 'bold 55px sans-serif';
      ctx.fillText(String(post.number), cx, 77);
    }
    const texture = gfx.texture({
      w: canvas.width, h: canvas.height, format: 'rgba8',
      data: new Uint8Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer),
    });

    const verts = [];
    function face(post, dx, dz, half, low, high, u0, u1, offset = 0) {
      const { x, y, z } = post;
      const vx = x - dz * offset, vz = z + dx * offset;
      const l = vx - dx * half, r = vx + dx * half;
      const lz = vz - dz * half, rz = vz + dz * half;
      verts.push(l, y + low, lz, u0, 1, r, y + low, rz, u1, 1, l, y + high, lz, u0, 0,
        r, y + low, rz, u1, 1, r, y + high, rz, u1, 0, l, y + high, lz, u0, 0);
    }
    for (const [index, post] of posts.entries()) {
      const { faceX: x, faceZ: z } = post;
      const u0 = index / posts.length, u1 = (index + 1) / posts.length;
      face(post, x, z, 0.72, 1.22, 2.66, u0, u1, 0.026);
      face(post, -x, -z, 0.72, 1.22, 2.66, u0, u1, 0.026);
      for (const [dx, dz] of [[x, z], [-x, -z], [-z, x], [z, -x]]) {
        face(post, dx, dz, 0.046, -0.24, 2.02, -1, -1, 0.046);
      }
    }
    const vb = gfx.buffer(new Float32Array(verts), 'vertex');
    const pipe = gfx.pipeline({
      name: 'pisteSigns',
      lib: [SL.common, SL.fog],
      buffers: [{ attrs: [['pos', 'vec3f'], ['uv', 'vec2f']] }],
      varyings: { wp: 'vec3f', uv: 'vec2f' },
      uniforms: { origin: 'vec4f' },
      textures: { tSign: '2d', tSky: '2d' },
      vs: `fn vert(a: VIn) -> VOut {
        var v: VOut; v.wp = a.pos - M.origin.xyz; v.uv = a.uv;
        v.clip = U.viewProj * vec4f(v.wp, 1.0); return v;
      }`,
      fs: `fn frag(v: VOut) -> FOut {
        var o: FOut;
        let ink: vec4f = tex(tSign, v.uv);
        var col: vec3f = ink.rgb * ink.rgb;
        if (v.uv.x < 0.0) { col = vec3f(0.32, 0.14, 0.043); }
        else { if (ink.a < 0.5) { discard; } }
        col *= max(0.22, U.ambSky.a);
        o.color = vec4f(applyFog(col, v.wp), 0.0); return o;
      }`,
    });
    return {
      pipe,
      draw(origin) {
        gfx.draw(pipe, { u: { origin: [...origin, 0] }, tex: { tSign: texture, tSky: Sky.lut }, vb: [vb], count: verts.length / 5 });
      },
    };
  }

  return { init, layout, colour };
})();
