// Injected into the in-memory test page inside Skier's closure.
let auditMesh, auditParts;
K.auditContact = function (origin, height) {
  const mesh = K.mesh;
  if (mesh !== auditMesh) {
    const ski = skiMesh(0);
    const bottom = [];
    for (let i = 0; i < ski.idx.length; i += 3) {
      const t = Array.from(ski.idx.subarray(i, i + 3));
      if (t.every(v => v < 45 * 6 && v % 6 < 2)) bottom.push(t);
    }
    if (bottom.length !== 88) throw Error('Unexpected ski sole topology');
    auditParts = [B.footL, B.footR].map(bone => {
      const vertices = [];
      for (let i = 0; i < mesh.nv; i++) {
        if (mesh.V[i * 10 + 6] !== 9 || mesh.V[i * 10 + 7] !== 1 || mesh.W[i * 4] !== bone) continue;
        if (mesh.W[i * 4 + 2] !== 1) throw Error('Ski vertex is not rigid');
        vertices.push(i * 10);
      }
      if (vertices.length !== ski.nv) throw Error('Unexpected rendered ski vertex count');
      const expected = bottom.map(t => t.map(v => vertices[v]));
      const soleOffsets = new Set(vertices.filter((_, i) => i < 45 * 6 && i % 6 < 2));
      const triangles = [];
      for (let i = 0; i < mesh.I.length; i += 3) {
        const a = mesh.I[i] * 10, b = mesh.I[i + 1] * 10, c = mesh.I[i + 2] * 10;
        if (soleOffsets.has(a) && soleOffsets.has(b) && soleOffsets.has(c)) triangles.push([a, b, c]);
      }
      if (JSON.stringify(triangles) !== JSON.stringify(expected)) throw Error('Rendered ski triangles differ from source');
      return { bone, vertices, triangles };
    });
    auditMesh = mesh;
  }
  const gap = (x, y, z) => y + origin[1] - height(x + origin[0], z + origin[2], 0.5);
  return auditParts.map(({bone, vertices, triangles}) => {
    const T = boneData.subarray(bone * 16, bone * 16 + 16);
    const transformed = new Map(vertices.map(i => [i, m4.tp(T, mesh.V.subarray(i, i + 3))]));
    const sole = { tip: Infinity, binding: Infinity, tail: Infinity, all: Infinity };
    const tops = {tip: -Infinity, binding: -Infinity, tail: -Infinity};
    const zone = z => z <= -0.50 ? 'tip' : z >= 0.40 ? 'tail' : 'binding';
    for (const i of vertices) tops[zone(mesh.V[i + 8])] = Math.max(tops[zone(mesh.V[i + 8])], gap(...transformed.get(i)));
    for (const [a, b, c] of triangles) {
      const A = transformed.get(a), B = transformed.get(b), C = transformed.get(c);
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4-i; j++) {
        const u = i/4, v = j/4, w = 1-u-v;
        const g = gap(u*A[0]+v*B[0]+w*C[0],u*A[1]+v*B[1]+w*C[1],u*A[2]+v*B[2]+w*C[2]);
        const region = zone(u*mesh.V[a+8]+v*mesh.V[b+8]+w*mesh.V[c+8]);
        sole[region] = Math.min(sole[region], g);
        sole.all = Math.min(sole.all, g);
      }
    }
    return {sole, tops};
  });
};
