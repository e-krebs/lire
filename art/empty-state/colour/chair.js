import * as THREE from "three";

export const chairDimensions = {
  shellRadius: 1.11,
  shellArcDegrees: 90,
  armRun: 0.92,
  headrestArcLengthScale: 1.25,
  headrestEndRadius: 0.16,
  armTopFrontZ: 0.427,
  shellEndLift: 0.028,
  headrestEndDrop: 0.035,
  jointRadius: 0.065,
  armRimRadius: 0.085,
  headrestHeight: 0.82,
  headrestDepth: 0.19,
  headrestLean: 14,
  headrestBottom: 1.19,
  headrestBottomZ: -0.78,
  bodyWidth: 1.62,
  bodyBaseWidth: 1.25,
  armThickness: 0.22,
  armTop: 1.21,
  bodyBottom: 0.25,
  backLean: 20,
  armFrontLean: 4,
  seatWidth: 1.15,
  seatDepth: 0.915,
  seatThickness: 0.52,
  seatTop: 0.82,
  seatFront: 0.5,
  seatSwell: 0.08,
  legHeight: 0.27,
  legTopRadius: 0.045,
  legBottomRadius: 0.037,
  frontLegX: 0.485,
  frontLegZ: 0.41,
  rearLegX: 0.57,
  rearLegZ: -0.51,
};

function smoothNormals({ geometry }) {
  geometry.computeVertexNormals();
  const positions = geometry.getAttribute("position"),
    normals = geometry.getAttribute("normal"),
    shared = new Map(),
    keys = [];
  for (let i = 0; i < positions.count; i++) {
    const key = [positions.getX(i), positions.getY(i), positions.getZ(i)]
      .map((n) => n.toFixed(6))
      .join(",");
    keys.push(key);
    const normal = shared.get(key) || new THREE.Vector3();
    normal.add(new THREE.Vector3().fromBufferAttribute(normals, i));
    shared.set(key, normal);
  }
  for (const normal of shared.values()) normal.normalize();
  for (let i = 0; i < normals.count; i++) {
    const n = shared.get(keys[i]);
    normals.setXYZ(i, n.x, n.y, n.z);
  }
}

export function buildWinterChair({
  parent,
  rug,
  position = [0, 0, 0],
  rotationY = 0,
  blanket = true,
}) {
  const d = chairDimensions,
    chair = new THREE.Group();
  parent.add(chair);
  chair.name = "winter armchair";
  chair.position.set(...position);
  chair.rotation.y = rotationY;
  const bodyColor = "#d3b165",
    shadeColor = "#c7a65d",
    woodColor = "#edd2a9";
  const cloth = document.createElement("canvas");
  cloth.width = cloth.height = 128;
  const ink = cloth.getContext("2d");
  ink.fillStyle = "#ffffff";
  ink.fillRect(0, 0, 128, 128);
  for (let n = 0; n < 128; n += 4) {
    ink.fillStyle = "#f8f8f8";
    ink.fillRect(n, 0, 1, 128);
    ink.fillRect(0, n, 128, 1);
    for (let row = 0; row < 32; row++)
      if ((n / 4 + row) % 2 === 0) {
        ink.fillStyle = "#fdfdfd";
        ink.fillRect(n, row * 4, 1, 2);
      }
  }
  const weave = new THREE.CanvasTexture(cloth);
  weave.colorSpace = THREE.SRGBColorSpace;
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
  weave.repeat.set(8, 8);
  const material = ({ color, ...rest }) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      metalness: 0,
      flatShading: false,
      ...rest,
    });
  const upholstery = material({ color: bodyColor, map: weave }),
    shade = material({ color: shadeColor, map: weave }),
    wood = material({ color: woodColor });
  function mesh({
    geometry,
    mat,
    parent = chair,
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    shadow = true,
    name,
  }) {
    const o = new THREE.Mesh(geometry, mat);
    o.position.set(...position);
    o.rotation.set(...rotation);
    o.castShadow = shadow;
    o.receiveShadow = true;
    if (name) o.name = name;
    parent.add(o);
    return o;
  }
  function pad({ size, position, mat = upholstery, radius, rotation = [0, 0, 0], deform, name }) {
    const [w, h, z] = size,
      geometry = new THREE.BoxGeometry(w, h, z, 48, 40, 20),
      v = geometry.getAttribute("position");
    for (let i = 0; i < v.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(v, i),
        core = new THREE.Vector3(
          THREE.MathUtils.clamp(p.x, -w / 2 + radius, w / 2 - radius),
          THREE.MathUtils.clamp(p.y, -h / 2 + radius, h / 2 - radius),
          THREE.MathUtils.clamp(p.z, -z / 2 + radius, z / 2 - radius),
        );
      const rounded = core.clone().add(p.sub(core).normalize().multiplyScalar(radius));
      if (deform) deform({ p: rounded });
      v.setXYZ(i, rounded.x, rounded.y, rounded.z);
    }
    smoothNormals({ geometry });
    return mesh({ geometry, position, rotation, mat, name });
  }
  const legs = [];
  for (const side of [-1, 1])
    for (const rear of [false, true]) {
      const a = new THREE.Vector3(
          side * (rear ? d.rearLegX : d.frontLegX),
          0,
          rear ? d.rearLegZ : d.frontLegZ,
        ),
        b = new THREE.Vector3(side * (rear ? 0.505 : 0.485), d.legHeight, rear ? -0.395 : 0.395);
      const geometry = new THREE.CylinderGeometry(
          d.legTopRadius,
          d.legBottomRadius,
          d.legHeight,
          24,
        ),
        v = geometry.getAttribute("position"),
        bottom = [];
      for (let i = 0; i < v.count; i++) {
        const t = (v.getY(i) + d.legHeight / 2) / d.legHeight;
        if (t < 0.00001) bottom.push(i);
        v.setXYZ(
          i,
          a.x + (b.x - a.x) * t + v.getX(i),
          d.legHeight * t,
          a.z + (b.z - a.z) * t + v.getZ(i),
        );
      }
      smoothNormals({ geometry });
      const leg = mesh({ geometry, mat: wood, name: (rear ? "rear" : "front") + " leg " + side });
      legs.push({ leg, bottom, a, b });
    }
  pad({
    size: [1.15, 0.08, 0.82],
    position: [0, d.seatTop - d.seatThickness - 0.04, 0.04],
    radius: 0.035,
    name: "thin base band",
  });
  const halfAngle = THREE.MathUtils.degToRad(d.shellArcDegrees / 2),
    arcLength = 2 * d.shellRadius * halfAngle,
    coreHalf = arcLength / 2;
  function arcProfile({ distance, y }) {
    const side = Math.sign(distance),
      along = Math.abs(distance),
      theta = Math.min(along / d.shellRadius, halfAngle),
      x = d.shellRadius * Math.sin(theta),
      z = d.shellRadius * (1 - Math.cos(theta));
    let point = new THREE.Vector2(side * x, z),
      tangent = new THREE.Vector2(Math.cos(theta), side * Math.sin(theta)),
      armFraction = 0;
    if (along > coreHalf) {
      const t = THREE.MathUtils.clamp((along - coreHalf) / d.armRun, 0, 1);
      armFraction = t;
      const h00 = 2 * t ** 3 - 3 * t ** 2 + 1,
        h10 = t ** 3 - 2 * t ** 2 + t,
        h01 = -2 * t ** 3 + 3 * t ** 2,
        h11 = t ** 3 - t ** 2;
      point.set(
        side * (h00 * x + h10 * 0.15 + h01 * 0.7 - h11 * 0.035),
        h00 * z + h10 * 0.15 + h01 * (d.armTopFrontZ - d.headrestBottomZ) + h11 * 0.78,
      );
      tangent.set(
        (6 * t * t - 6 * t) * x +
          (3 * t * t - 4 * t + 1) * 0.15 +
          (-6 * t * t + 6 * t) * 0.7 -
          (3 * t * t - 2 * t) * 0.035,
        side *
          ((6 * t * t - 6 * t) * z +
            (3 * t * t - 4 * t + 1) * 0.15 +
            (-6 * t * t + 6 * t) * (d.armTopFrontZ - d.headrestBottomZ) +
            (3 * t * t - 2 * t) * 0.78),
      );
    }
    const fraction = THREE.MathUtils.clamp((y - d.bodyBottom) / (d.armTop - d.bodyBottom), 0, 1),
      flare = THREE.MathUtils.lerp(
        (d.bodyBaseWidth - d.armThickness) / (d.bodyWidth - d.armThickness),
        1,
        fraction,
      ),
      backSlope = Math.tan(THREE.MathUtils.degToRad(d.backLean)),
      frontSlope = Math.tan(THREE.MathUtils.degToRad(d.armFrontLean)),
      slope =
        y > d.headrestBottom
          ? Math.tan(THREE.MathUtils.degToRad(d.headrestLean))
          : THREE.MathUtils.lerp(
              backSlope,
              frontSlope,
              THREE.MathUtils.smoothstep(armFraction, 0, 1),
            ),
      centreZ = d.headrestBottomZ - slope * (y - d.headrestBottom);
    if (along > coreHalf && y <= d.headrestBottom)
      tangent.y +=
        side *
        (frontSlope - backSlope) *
        (d.headrestBottom - y) *
        6 *
        armFraction *
        (1 - armFraction);
    const normal = new THREE.Vector2(-tangent.y, tangent.x * flare).normalize();
    return { x: point.x * flare, z: centreZ + point.y, normal, theta, along };
  }
  function profileLength({ end }) {
    let length = 0,
      previous = arcProfile({ distance: coreHalf, y: d.headrestBottom + d.headrestHeight / 2 });
    for (let i = 1; i <= 1024; i++) {
      const point = arcProfile({
        distance: coreHalf + ((end - coreHalf) * i) / 1024,
        y: d.headrestBottom + d.headrestHeight / 2,
      });
      length += Math.hypot(point.x - previous.x, point.z - previous.z);
      previous = point;
    }
    return length;
  }
  let low = coreHalf,
    high = coreHalf + d.armRun;
  for (let i = 0; i < 32; i++) {
    const mid = (low + high) / 2;
    if (profileLength({ end: mid }) < coreHalf * (d.headrestArcLengthScale - 1)) low = mid;
    else high = mid;
  }
  const headrestHalf = high,
    headrestArcLength = arcLength + 2 * profileLength({ end: headrestHalf });
  function curvedShell({
    name,
    height,
    depth,
    bottom,
    radius = 0.1,
    edgeDepth = 0.055,
    seam = false,
    lower = false,
  }) {
    const positions = [],
      uvs = [],
      indices = [],
      half = [lower ? coreHalf + d.armRun : headrestHalf, height / 2, depth / 2];
    for (const [axis, uAxis, vAxis, segmentsU, segmentsV] of [
      [2, 0, 1, 128, 40],
      [0, 2, 1, 16, 40],
      [1, 0, 2, 128, 16],
    ])
      for (const sign of [-1, 1]) {
        const offset = positions.length / 3;
        for (let row = 0; row <= segmentsV; row++)
          for (let col = 0; col <= segmentsU; col++) {
            const q = [0, 0, 0];
            q[axis] = sign * half[axis];
            q[uAxis] = ((2 * col) / segmentsU - 1) * half[uAxis];
            q[vAxis] = ((2 * row) / segmentsV - 1) * half[vAxis];
            const jointRadius = lower
                ? q[1] > 0
                  ? d.armRimRadius
                  : radius
                : q[1] < 0
                  ? d.jointRadius
                  : radius,
              radii = [lower ? radius : d.headrestEndRadius, jointRadius, edgeDepth],
              p = new THREE.Vector3(...q),
              core = new THREE.Vector3(
                ...q.map((n, i) =>
                  THREE.MathUtils.clamp(n, -half[i] + radii[i], half[i] - radii[i]),
                ),
              ),
              delta = p
                .clone()
                .sub(core)
                .divide(new THREE.Vector3(...radii))
                .normalize()
                .multiply(new THREE.Vector3(...radii));
            p.copy(core.add(delta));
            let y = bottom + p.y + height / 2;
            const t = (p.y + height / 2) / height,
              atEnd = Math.pow(Math.abs(p.x) / half[0], 8);
            if (!lower) y -= d.headrestEndDrop * atEnd * Math.pow(1 - t, 4);
            else
              y +=
                d.shellEndLift *
                Math.exp(-Math.pow((Math.abs(p.x) - coreHalf) / 0.18, 2)) *
                Math.pow(t, 4);
            const profile = arcProfile({ distance: p.x, y }),
              side = Math.abs(profile.theta) / halfAngle;
            if (!lower && profile.along > coreHalf) {
              // Normal offsets fold at the tight arm turn; retain the circular depth direction.
              const depthAngle = profile.along / d.shellRadius;
              profile.normal.set(-Math.sign(p.x) * Math.sin(depthAngle), Math.cos(depthAngle));
            }
            let n = p.z;
            if (lower) {
              n *= 1 + 0.65 * Math.pow(1 - side, 2);
              if (n > 0)
                n +=
                  0.055 *
                  Math.exp(-Math.pow((y - 0.8) / 0.25, 2)) *
                  Math.max(0, 1 - side ** 4) *
                  Math.pow(p.z / (depth / 2), 4);
            }
            if (seam && n > 0)
              n -=
                0.008 *
                Math.exp(-Math.pow(p.y / 0.03, 2)) *
                Math.pow(n / (depth / 2), 4) *
                Math.max(0, 1 - Math.pow(p.x / half[0], 8));
            const rearPadding =
              lower && n < 0 ? 0.1 * (1 - t) * Math.pow(-p.z / (depth / 2), 4) : 0;
            positions.push(
              profile.x + profile.normal.x * n,
              y,
              profile.z + profile.normal.y * n - rearPadding,
            );
            uvs.push(col / segmentsU, row / segmentsV);
          }
        for (let row = 0; row < segmentsV; row++)
          for (let col = 0; col < segmentsU; col++) {
            const a = offset + row * (segmentsU + 1) + col,
              b = a + 1,
              c = a + segmentsU + 1,
              e = c + 1,
              forward = axis === 2 ? sign > 0 : sign < 0;
            if (forward) indices.push(a, b, c, b, e, c);
            else indices.push(a, c, b, b, c, e);
          }
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    smoothNormals({ geometry });
    return mesh({ geometry, mat: upholstery, name });
  }
  const back = curvedShell({
    name: "continuous back and arm shell",
    height: d.armTop - d.bodyBottom,
    depth: d.armThickness,
    bottom: d.bodyBottom,
    radius: 0.1,
    lower: true,
  });
  const seatCentreY = d.seatTop - d.seatThickness / 2,
    seatCentreZ = d.seatFront - d.seatDepth / 2;
  pad({
    size: [d.seatWidth, d.seatThickness, d.seatDepth],
    position: [0, seatCentreY, seatCentreZ],
    radius: 0.1,
    mat: shade,
    name: "loose seat cushion",
    deform: ({ p }) => {
      const u = p.x / (d.seatWidth / 2),
        across = Math.max(0, 1 - Math.pow(u, 4));
      if (p.z > 0)
        p.z +=
          d.seatSwell *
          across *
          Math.max(0, 1 - Math.pow(p.y / (d.seatThickness / 2), 2)) *
          Math.pow(p.z / (d.seatDepth / 2), 4);
      if (p.z < 0) p.z += 0.125 * u * u * Math.pow(-p.z / (d.seatDepth / 2), 4);
      if (p.y > 0)
        p.y +=
          0.022 *
          across *
          Math.max(0, 1 - Math.pow(p.z / (d.seatDepth / 2 + 0.06), 4)) *
          Math.pow(p.y / (d.seatThickness / 2), 4);
    },
  });

  const headrest = curvedShell({
    name: "reclined headrest",
    height: d.headrestHeight,
    depth: d.headrestDepth,
    bottom: d.headrestBottom,
    radius: 0.12,
    edgeDepth: 0.055,
    seam: true,
  });
  if (blanket) {
    const g = new THREE.Group();
    chair.add(g);
    g.name = "folded teal blanket";
    g.position.set(0.12, d.seatTop + 0.023, 0.18);
    const cloth = material({ color: "#83a6a2", flatShading: true }),
      band = material({ color: "#dce0c3", flatShading: true });
    for (const [size, p] of [
      [
        [0.73, 0.11, 0.51],
        [0, 0.055, 0],
      ],
      [
        [0.73, 0.07, 0.43],
        [0, 0.139, -0.025],
      ],
    ]) {
      const item = pad({ size, position: p, mat: cloth, radius: 0.025 });
      g.add(item);
    }
    mesh({
      parent: g,
      geometry: new THREE.BoxGeometry(0.73, 0.012, 0.067),
      position: [0, 0.18, 0.06],
      mat: band,
    });
    for (let i = 0; i < 7; i++) {
      const a = new THREE.Vector3(-0.3 + i * 0.1, 0.11, 0.24),
        b = new THREE.Vector3(-0.3 + i * 0.1, 0.065, 0.33),
        delta = b.clone().sub(a),
        o = mesh({
          parent: g,
          geometry: new THREE.CylinderGeometry(0.012, 0.012 * 0.94, delta.length(), 4),
          position: a.clone().add(b).multiplyScalar(0.5).toArray(),
          mat: cloth,
        });
      o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    }
  }
  parent.updateMatrixWorld(true);
  const headrestArmContacts = [-1, 1].map((sign) => {
    const vertices = headrest.geometry.getAttribute("position"),
      body = back.geometry.getAttribute("position"),
      ray = new THREE.Raycaster();
    let closest = null,
      samples = 0;
    for (let i = 0; i < vertices.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(vertices, i);
      if (Math.sign(p.x) !== sign || p.y > d.headrestBottom + 0.1 || Math.abs(p.x) < 0.59) continue;
      const world = chair.localToWorld(p.clone());
      ray.set(world.clone().add(new THREE.Vector3(0, 0.3, 0)), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(back)[0];
      if (!hit) continue;
      const top = chair.worldToLocal(hit.point.clone()),
        gap = p.y - top.y;
      samples++;
      if (!closest || Math.abs(gap) < Math.abs(closest.gap))
        closest = { headPoint: p.toArray(), armPoint: top.toArray(), gap };
    }
    const headBounds = new THREE.Box3().setFromBufferAttribute(vertices),
      bodyBounds = new THREE.Box3().setFromBufferAttribute(body);
    const junction = arcProfile({ distance: sign * (coreHalf - 0.035), y: d.headrestBottom }),
      origin = chair.localToWorld(new THREE.Vector3(junction.x, 3, junction.z));
    ray.set(origin, new THREE.Vector3(0, -1, 0));
    const bodyHits = ray
      .intersectObject(back)
      .map((hit) => chair.worldToLocal(hit.point.clone()).y);
    ray.set(
      chair.localToWorld(new THREE.Vector3(junction.x, 0, junction.z)),
      new THREE.Vector3(0, 1, 0),
    );
    const headHits = ray
        .intersectObject(headrest)
        .map((hit) => chair.worldToLocal(hit.point.clone()).y),
      headBottom = headHits.length ? Math.min(...headHits) : null,
      armTop = bodyHits.length ? Math.max(...bodyHits) : null;
    return {
      arm: "rear arm junction " + sign,
      samples,
      closest,
      junction: [junction.x, junction.z],
      headBottom,
      armTop,
      junctionGap: headBottom === null || armTop === null ? null : headBottom - armTop,
      sideOverhang:
        Math.max(Math.abs(headBounds.min.x), Math.abs(headBounds.max.x)) -
        Math.max(Math.abs(bodyBounds.min.x), Math.abs(bodyBounds.max.x)),
      headrestReach: headBounds.max.z,
      frontArmTipZ: bodyBounds.max.z,
    };
  });
  if (
    headrestArmContacts.some(
      (contact) =>
        !contact.closest ||
        contact.junctionGap === null ||
        contact.junctionGap > 0.0015 ||
        contact.junctionGap < -0.08 ||
        contact.sideOverhang > 0,
    )
  )
    throw Error("Rounded headrest ends must rest on the arm junctions within the shell width");
  const headrestEndContacts = [-1, 1].map((sign) => {
    const profile = arcProfile({
        distance: sign * (headrestHalf - d.headrestEndRadius / 2),
        y: d.headrestBottom,
      }),
      ray = new THREE.Raycaster();
    ray.set(
      chair.localToWorld(new THREE.Vector3(profile.x, 0, profile.z)),
      new THREE.Vector3(0, 1, 0),
    );
    const headHits = ray
      .intersectObject(headrest)
      .map((hit) => chair.worldToLocal(hit.point.clone()).y);
    ray.set(
      chair.localToWorld(new THREE.Vector3(profile.x, 3, profile.z)),
      new THREE.Vector3(0, -1, 0),
    );
    const armHits = ray.intersectObject(back).map((hit) => chair.worldToLocal(hit.point.clone()).y);
    const gap =
      headHits.length && armHits.length ? Math.min(...headHits) - Math.max(...armHits) : null;
    if (gap === null || gap > 0.0015 || gap < -0.1)
      throw Error("Extended headrest ends must rest on the unchanged arm tops");
    return { side: sign, point: [profile.x, profile.z], gap };
  });
  const shellChecks = [headrest, back].map((panel) => {
    const vertices = panel.geometry.getAttribute("position"),
      keys = new Set();
    const key = ({ x, y, z }) => [x, y, z].map((n) => Math.round(n * 1e6)).join(",");
    for (let i = 0; i < vertices.count; i++)
      keys.add(key({ x: vertices.getX(i), y: vertices.getY(i), z: vertices.getZ(i) }));
    let unmatched = 0;
    for (let i = 0; i < vertices.count; i++)
      if (!keys.has(key({ x: -vertices.getX(i), y: vertices.getY(i), z: vertices.getZ(i) })))
        unmatched++;
    if (unmatched) throw Error("Curved chair shell must be symmetric");
    return {
      panel: panel.name,
      vertices: vertices.count,
      unmatchedMirrorVertices: unmatched,
      radius: d.shellRadius,
      profileOrigin: [0, d.headrestBottom, d.headrestBottomZ],
      circularCoreCentre: [0, d.headrestBottom, d.headrestBottomZ + d.shellRadius],
      profile: "90 degree circular back with low arm continuations",
      rotation: panel.rotation.toArray().slice(0, 3),
    };
  });
  parent.updateMatrixWorld(true);
  const lowerShellBounds = new THREE.Box3().setFromBufferAttribute(
      back.geometry.getAttribute("position"),
    ),
    headrestBounds = new THREE.Box3().setFromBufferAttribute(
      headrest.geometry.getAttribute("position"),
    );
  if (
    lowerShellBounds.max.y > d.armTop + 0.035 ||
    headrestBounds.max.y - lowerShellBounds.max.y < 0.7
  )
    throw Error("Only the headrest may rise above the low arm shell");
  const armSymmetryUnmatchedVertices = shellChecks.find(
    (panel) => panel.panel === back.name,
  ).unmatchedMirrorVertices;
  const checks = {
    continuousLowerShell: true,
    lowerShellMeshes: chair.children.filter((item) => item === back).length,
    separateArmMeshes: chair.children.filter((item) => item.name.startsWith("flared arm")).length,
    sharedArcLength: arcLength,
    sharedArcProfile: true,
    lowArmContinuations: true,
    lowerShellMaxY: lowerShellBounds.max.y,
    headrestMaxY: headrestBounds.max.y,
    headrestStep: headrestBounds.max.y - lowerShellBounds.max.y,
    armRimRadius: d.armRimRadius,
    sharedArcProfileName: "90 degree circular back with low arm continuations",
    shellEndLift: d.shellEndLift,
    headrestEndDrop: d.headrestEndDrop,
    jointRadius: d.jointRadius,
    armSymmetryUnmatchedVertices,
    headrestArmContacts,
    shellChecks,
    headrestThickness: d.headrestDepth,
    armRun: d.armRun,
    arcSegments: 128,
    colour: bodyColor,
    shadeColour: shadeColor,
    woodColour: woodColor,
    fineWeave: true,
    headrestPads: 1,
    headrestLeanDegrees: d.headrestLean,
    lowerBackLeanDegrees: d.backLean,
    shellRadius: d.shellRadius,
    headrestArcDegrees: d.shellArcDegrees,
    lowerBackPrimaryArcDegrees: d.shellArcDegrees,
    headrestHorizontalSeams: 1,
    headrestWidth: new THREE.Box3()
      .setFromBufferAttribute(headrest.geometry.getAttribute("position"))
      .getSize(new THREE.Vector3()).x,
    headrestHeight: d.headrestHeight,
    armTop: d.armTop,
    bodyWidthAtArms: d.bodyWidth,
    bodyWidthAtBase: d.bodyBaseWidth,
    seatTop: d.seatTop + 0.022,
    seatThickness: d.seatThickness,
    taperedLegs: 4,
    legRadii: [d.legTopRadius, d.legBottomRadius],
    legLength: d.legHeight,
    position: chair.position.toArray(),
    rotationY: chair.rotation.y,
    legSplayDegrees: legs.map(({ a, b }) =>
      THREE.MathUtils.radToDeg(Math.atan(Math.hypot(a.x - b.x, a.z - b.z) / d.legHeight)),
    ),
  };
  Object.assign(checks, {
    headrestArcLength,
    headrestArcLengthScale: headrestArcLength / arcLength,
    headrestProfileEndDistance: headrestHalf,
    headrestEndContacts,
  });
  chair.userData.landmarks = {
    headrestTop: [
      0,
      d.headrestBottom + d.headrestHeight,
      d.headrestBottomZ - d.headrestHeight * Math.tan(THREE.MathUtils.degToRad(d.headrestLean)),
    ],
    headrestBottom: [0, d.headrestBottom, d.headrestBottomZ],
    seatTop: [0, d.seatTop, seatCentreZ],
    armTop: [d.bodyWidth / 2 - d.armThickness / 2, d.armTop, 0.13 - 0.22],
    frontFoot: [d.frontLegX, 0, d.frontLegZ],
  };
  if (rug) {
    const ray = new THREE.Raycaster(),
      footContacts = [],
      footFieldClearances = [],
      footDiamondClearances = [],
      footCentres = [],
      footprint = new THREE.Box3();
    for (const { leg, bottom } of legs) {
      const vertices = leg.geometry.getAttribute("position");
      let footLevel = -Infinity;
      for (const i of bottom) {
        const p = new THREE.Vector3()
          .fromBufferAttribute(vertices, i)
          .applyMatrix4(leg.matrixWorld);
        ray.set(new THREE.Vector3(p.x, p.y + 0.5, p.z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(rug, true)[0];
        if (!hit) throw Error("Chair foot misses rug");
        footLevel = Math.max(footLevel, hit.point.y - chair.position.y);
      }
      for (const i of bottom) vertices.setY(i, footLevel);
      smoothNormals({ geometry: leg.geometry });
      vertices.needsUpdate = true;
    }
    parent.updateMatrixWorld(true);
    const inverse = rug.matrixWorld.clone().invert(),
      projected = new THREE.Box3(),
      field = rug.userData.chairField;
    chair.traverse((o) => {
      if (!o.geometry) return;
      const v = o.geometry.getAttribute("position");
      for (let i = 0; i < v.count; i++)
        projected.expandByPoint(
          new THREE.Vector3()
            .fromBufferAttribute(v, i)
            .applyMatrix4(o.matrixWorld)
            .applyMatrix4(inverse),
        );
    });
    for (const { leg, bottom } of legs) {
      const vertices = leg.geometry.getAttribute("position"),
        gaps = [],
        points = [];
      for (const i of bottom) {
        const p = new THREE.Vector3()
          .fromBufferAttribute(vertices, i)
          .applyMatrix4(leg.matrixWorld);
        ray.set(new THREE.Vector3(p.x, p.y + 0.5, p.z), new THREE.Vector3(0, -1, 0));
        gaps.push(p.y - ray.intersectObject(rug, true)[0].point.y);
        points.push(p.applyMatrix4(inverse));
      }
      footContacts.push(Math.min(...gaps));
      for (const p of points) footprint.expandByPoint(p);
      const centre = new THREE.Vector3()
          .addVectors(
            new THREE.Box3().setFromPoints(points).min,
            new THREE.Box3().setFromPoints(points).max,
          )
          .multiplyScalar(0.5),
        radius = Math.max(...points.map((p) => Math.hypot(p.x - centre.x, p.z - centre.z)));
      footCentres.push([centre.x, centre.z]);
      footFieldClearances.push(
        Math.min(field.x - Math.abs(centre.x), field.z - Math.abs(centre.z)) - radius,
      );
      const distances = field.diamonds.map((polygon) => {
        let inside = true,
          distance = Infinity;
        for (let i = 0; i < polygon.length; i++) {
          const a = polygon[i],
            b = polygon[(i + 1) % polygon.length],
            dx = b[0] - a[0],
            dz = b[1] - a[1],
            t = THREE.MathUtils.clamp(
              ((centre.x - a[0]) * dx + (centre.z - a[1]) * dz) / (dx * dx + dz * dz),
              0,
              1,
            );
          distance = Math.min(
            distance,
            Math.hypot(centre.x - a[0] - t * dx, centre.z - a[1] - t * dz),
          );
          if (dx * (centre.z - a[1]) - dz * (centre.x - a[0]) < 0) inside = false;
        }
        return (inside ? -distance : distance) - radius;
      });
      footDiamondClearances.push(Math.min(...distances));
    }
    const rugMargins = {
        left: 1.02 + footprint.min.x,
        right: 1.02 - footprint.max.x,
        rear: field.halfDepth + footprint.min.z,
        front: field.halfDepth - footprint.max.z,
      },
      chairProjectionMargins = {
        left: 1.02 + projected.min.x,
        right: 1.02 - projected.max.x,
        rear: field.halfDepth + projected.min.z,
        front: field.halfDepth - projected.max.z,
      };
    if (
      Math.min(...Object.values(rugMargins)) < 0.08 ||
      Math.max(...footContacts.map(Math.abs)) > 0.001 ||
      Math.min(...footFieldClearances, ...footDiamondClearances) < 0.06
    )
      throw Error("Chair must sit on plain rug field with visible clearance");
    Object.assign(checks, {
      rugMargins,
      chairProjectionMargins,
      footContactGaps: footContacts,
      footBorderClearances: footFieldClearances,
      footDiamondClearances,
      footCentresOnRug: footCentres,
    });
  }
  const bounds = new THREE.Box3().setFromObject(chair);
  Object.assign(checks, {
    worldBounds: [bounds.min.toArray(), bounds.max.toArray()],
    width: bounds.max.x - bounds.min.x,
    depth: bounds.max.z - bounds.min.z,
    height: bounds.max.y - bounds.min.y,
  });
  chair.userData.geometryChecks = checks;
  return chair;
}
