/* Planet Creator — "ink": painted activity kinds beyond the original three.
 *
 * These objects use the locked ink vocabulary: one flat warm or cool wash per
 * face, broken ink at the silhouette, and one hard-edged slate cast shadow with
 * a darker dried rim. base.js places the returned group in the feature's tangent
 * frame; every off-centre foot is seated back onto the curved terrain here.
 */

import { P } from './params.js';

const R = 120;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a.clone().lerp(b, t);

const NOISE = /* glsl */ `
float inkH13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float inkH12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float inkN3(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(inkH13(i), inkH13(i + vec3(1.0,0.0,0.0)), f.x), mix(inkH13(i + vec3(0.0,1.0,0.0)), inkH13(i + vec3(1.0,1.0,0.0)), f.x), f.y);
  float b = mix(mix(inkH13(i + vec3(0.0,0.0,1.0)), inkH13(i + vec3(1.0,0.0,1.0)), f.x), mix(inkH13(i + vec3(0.0,1.0,1.0)), inkH13(i + vec3(1.0,1.0,1.0)), f.x), f.y);
  return mix(a, b, f.z);
}
float inkN2(vec2 x){
  vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(inkH12(i), inkH12(i + vec2(1.0,0.0)), f.x), mix(inkH12(i + vec2(0.0,1.0)), inkH12(i + vec2(1.0,1.0)), f.x), f.y);
}
float inkF3(vec3 p){ float s=0.0,a=0.5,n=0.0; for(int i=0;i<3;i++){ s+=a*inkN3(p); n+=a; p=p*2.03+vec3(1.7,-2.3,0.9); a*=0.5; } return s/n; }
float inkF2(vec2 p){ float s=0.0,a=0.5,n=0.0; for(int i=0;i<3;i++){ s+=a*inkN2(p); n+=a; p=p*2.03+vec2(1.7,-2.3); a*=0.5; } return s/n; }
float inkPixel(float x,float w){ return clamp(x/max(w,1e-5)+0.5,0.0,1.0); }
`;

const WASH_VERT = /* glsl */ `
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vNL; varying vec3 vAx; varying vec3 vAz;
void main(){
  vec4 wp=modelMatrix*vec4(position,1.0);
  vW=wp.xyz; vN=normalize(mat3(modelMatrix)*normal); vL=position; vNL=normal;
  vAx=normalize(mat3(modelMatrix)*vec3(1.0,0.0,0.0));
  vAz=normalize(mat3(modelMatrix)*vec3(0.0,0.0,1.0));
  gl_Position=projectionMatrix*viewMatrix*wp;
}`;

const WASH_FRAG = /* glsl */ `
uniform vec3 uSunDir,uLit,uShade,uInk,uPaper,uSky,uBoxMin,uBoxMax;
uniform float uRag,uGrain,uInkLine,uSeed,uTop,uSkyTop,uDry,uMargin,uLitEdge,uBase;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vNL; varying vec3 vAx; varying vec3 vAz;
${NOISE}
void main(){
  vec3 n=normalize(vN);
  float l=dot(n,uSunDir);
  float grain=inkF3(vW*4.6+uSeed)*0.65+inkN3(vW*13.0+uSeed)*0.35;
  float edge=l+(inkF3(vW*0.9+uSeed*2.0)-0.5)*uRag+(inkN3(vW*2.7+uSeed)-0.5)*uRag*0.35;
  float lit=inkPixel(edge-0.04,max(fwidth(l),0.012));
  vec3 c=mix(uShade,uLit,lit);
  c=mix(c,mix(uShade,uInk,0.4),(1.0-lit)*smoothstep(0.45,0.92,grain)*0.55);
  float y=(vL.y-uBoxMin.y)/max(0.001,uBoxMax.y-uBoxMin.y);
  vec3 an=abs(vNL),hb=(uBoxMax-uBoxMin)*0.5,lp=vL-(uBoxMax+uBoxMin)*0.5;
  vec2 fp=lp.xy,fh=hb.xy; vec3 across=vAx;
  if(an.x>an.z&&an.x>=an.y){ fp=lp.zy; fh=hb.zy; across=vAz; }
  bool horiz=an.y>an.x&&an.y>an.z;
  if(horiz){ fp=lp.xz; fh=hb.xz; }
  vec2 ed=fh-abs(fp);
  float toEdge=horiz?min(ed.x,ed.y):min(ed.x,fh.y-fp.y);
  float wob=inkF2(vec2(fp.x*1.3,vL.y*0.9)+uSeed)-0.5;
  float fy=fwidth(y)+1e-4;
  c=mix(c,mix(c,uSky,0.5),inkPixel(y-(0.58+wob*0.3),fy)*uSkyTop);
  c=mix(c,mix(c,uSky,0.45),inkPixel(y-(0.86+wob*0.2),fy)*uSkyTop);
  float bands=smoothstep(0.35,0.75,inkN2(vec2(fp.x*3.0+uSeed,vL.y*0.35)));
  float hair=inkN2(vec2(fp.x*26.0+uSeed,vL.y*0.9))*0.6+inkN2(vec2(fp.x*60.0,vL.y*2.0+uSeed))*0.4;
  float dry=uDry*(0.25+0.75*y)*bands;
  c=mix(c,mix(c,uSky,0.6),inkPixel(hair-(1.0-0.7*dry),fwidth(hair)+1e-4)*step(0.001,dry));
  c=mix(c,uPaper,smoothstep(0.74,0.97,y)*lit*uTop);
  c=mix(c,mix(uShade,uInk,0.55),(1.0-smoothstep(0.0,0.2,y))*uBase);
  c*=0.97+0.07*(grain-0.5)*uGrain;
  vec3 V=normalize(cameraPosition-vW);
  float face=abs(dot(n,V));
  float band=1.0-inkPixel(face,fwidth(face)*3.2);
  float tooth=inkF2(vec2(vW.y*2.4,(vW.x+vW.z)*1.7)+uSeed*3.0);
  float stroke=band*smoothstep(0.44,0.78,tooth)*mix(0.5,1.0,1.0-lit)*uInkLine;
  c=mix(c,uInk,stroke);
  float marg=uMargin*(0.35+1.3*inkF2(vec2(fp.x+fp.y,vL.y)*2.6+uSeed));
  float paper=(1.0-inkPixel(toEdge-marg,fwidth(toEdge)+1e-4))*step(1e-4,uMargin);
  float litSide=dot(across,uSunDir)>=0.0?1.0:-1.0;
  float litEdge=fh.x-fp.x*litSide;
  float strip=1.0-inkPixel(litEdge-uLitEdge*(0.8+0.5*wob),fwidth(litEdge)+1e-4);
  paper=max(paper,strip*step(1e-4,uLitEdge)*(horiz?0.0:1.0));
  gl_FragColor=vec4(mix(c,uPaper,paper),1.0);
}`;

const SHADOW_VERT = /* glsl */ `
attribute vec2 aP; varying vec2 vP;
void main(){
  vP=aP;
  vec4 wp=modelMatrix*vec4(position,1.0);
  vec3 toCam=cameraPosition-wp.xyz;
  float dist=length(toCam);
  wp.xyz+=toCam/max(dist,1e-4)*(0.02+0.002*dist);
  gl_Position=projectionMatrix*viewMatrix*wp;
}`;

const SHADOW_FRAG = /* glsl */ `
uniform vec3 uInk; uniform float uAlpha,uCentre,uStretch,uSeed; varying vec2 vP;
${NOISE}
void main(){
  float r=length(vec2((vP.x-uCentre)*uStretch,vP.y));
  float e=r-(1.0+(inkF2(vP*1.6+uSeed)-0.5)*0.24);
  float fw=fwidth(e)+1e-5;
  float a=1.0-inkPixel(e,fw);
  float rim=inkPixel(e+1.5*fw,fw)*a;
  a*=uAlpha*(1.0+0.55*rim);
  if(a<0.01) discard;
  gl_FragColor=vec4(uInk,a);
}`;

function sunOf(T, uniforms) {
  return (uniforms && uniforms.uSunDir) || { value: new T.Vector3(0.79, 0.6, 0.05) };
}

function featureFrame(T, features, dir) {
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
  const P = dir.clone().multiplyScalar(R + features.heightAt(dir));
  return { q, P, qi: q.clone().invert() };
}

function onGround(features, frame, local) {
  const v = local.clone().applyQuaternion(frame.q).add(frame.P);
  const dir = v.clone().normalize();
  const h = features.heightAt(dir);
  return {
    dir,
    pos: dir.clone().multiplyScalar(R + h).sub(frame.P).applyQuaternion(frame.qi),
  };
}

function groundNormal(T, features, frame, span = 0.5) {
  const h = (x, z) => features.heightAt(
    new T.Vector3(x, 0, z).applyQuaternion(frame.q).add(frame.P).normalize(),
  );
  return new T.Vector3(
    -(h(span, 0) - h(-span, 0)) / (2 * span),
    1,
    -(h(0, span) - h(0, -span)) / (2 * span),
  ).normalize();
}

function washMaterial(T, uniforms, pal, geo, {
  lit, shade, ink = pal.ink, paper = pal.paper, sky = null,
  rag = 0.12, grain = 1, inkLine = 0.6, top = 0.45, seed = 0,
  skyTop = 0.25, dry = 0.2, margin = 0.01, litEdge = 0, base = 0.5,
}) {
  geo.computeBoundingBox();
  return new T.ShaderMaterial({
    uniforms: {
      uSunDir: sunOf(T, uniforms),
      uLit: { value: lit }, uShade: { value: shade }, uInk: { value: ink.clone() },
      uPaper: { value: paper.clone() }, uSky: { value: (sky || mix(lit, paper, 0.5)).clone() },
      uBoxMin: { value: geo.boundingBox.min.clone() }, uBoxMax: { value: geo.boundingBox.max.clone() },
      uRag: { value: rag }, uGrain: { value: grain }, uInkLine: { value: inkLine },
      uTop: { value: top }, uSeed: { value: seed }, uSkyTop: { value: skyTop },
      uDry: { value: dry }, uMargin: { value: margin }, uLitEdge: { value: litEdge }, uBase: { value: base },
    },
    vertexShader: WASH_VERT,
    fragmentShader: WASH_FRAG,
  });
}

function shadowMaterial(T, pal, seed, alpha = 0.40) {
  return new T.ShaderMaterial({
    uniforms: {
      uInk: { value: mix(pal.shadeCool, pal.ink, 0.45) },
      uAlpha: { value: alpha }, uCentre: { value: 0.4 }, uStretch: { value: 1.25 }, uSeed: { value: seed },
    },
    vertexShader: SHADOW_VERT,
    fragmentShader: SHADOW_FRAG,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
  });
}

function groundWash(T, features, frame, { len, wide, mat, away, side, origin = null, flare = 0.85, lift = 0.02 }) {
  const steps = Math.max(4, Math.ceil(len / 0.42));
  const lanes = Math.max(4, Math.ceil((2 * wide * (0.5 + flare)) / 0.42));
  const pos = new Float32Array((steps + 1) * (lanes + 1) * 3);
  const ap = new Float32Array((steps + 1) * (lanes + 1) * 2);
  const idx = [];
  const p = new T.Vector3();
  const d = new T.Vector3();
  let k = 0;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const w = wide * (0.5 + flare * u);
    for (let j = 0; j <= lanes; j++) {
      const v = (j / lanes) * 2 - 1;
      p.copy(away).multiplyScalar(u * len).addScaledVector(side, v * w);
      if (origin) p.add(origin);
      d.copy(p).applyQuaternion(frame.q).add(frame.P).normalize();
      p.copy(d).multiplyScalar(R + features.heightAt(d) + lift).sub(frame.P).applyQuaternion(frame.qi);
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      ap[k * 2] = u; ap[k * 2 + 1] = v;
      k++;
      if (i && j) {
        const o = (i - 1) * (lanes + 1) + j - 1;
        idx.push(o, o + 1, o + lanes + 1, o + 1, o + lanes + 2, o + lanes + 1);
      }
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('aP', new T.BufferAttribute(ap, 2));
  geo.setIndex(idx);
  const m = new T.Mesh(geo, mat);
  m.frustumCulled = false;
  m.userData.groundWash = true;
  return m;
}

function castShadow(T, features, frame, dir, uniforms, pal, { len, wide, seed, origin = null, flare = 0.85, lift = 0.02, alpha = 0.40 }) {
  const flat = sunOf(T, uniforms).value.clone().addScaledVector(dir, -sunOf(T, uniforms).value.dot(dir));
  if (flat.lengthSq() < 1e-5) return null;
  const away = flat.normalize().negate().applyQuaternion(frame.qi);
  const side = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), away).normalize();
  return groundWash(T, features, frame, {
    len, wide, away, side, origin, flare, lift, mat: shadowMaterial(T, pal, seed, alpha),
  });
}

function roughen(geo, seed, amount = 0.1) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 91.7 + y * 57.3 + z * 33.1 + seed * 7.1) * 43758.5453;
    const s = 1 + amount * ((n - Math.floor(n)) * 2 - 1);
    p.setXYZ(i, x * s, y * (1 + (s - 1) * 0.35), z * s);
  }
  geo.computeVertexNormals();
  return geo;
}

function spireGeometry(T, radius, height, sides, seed) {
  const geo = new T.CylinderGeometry(radius * 0.05, radius, height, sides, 2, false).toNonIndexed();
  const p = geo.attributes.position;
  const bendX = Math.sin(seed * 4.13) * height * 0.07;
  const bendZ = Math.sin(seed * 7.31 + 1.7) * height * 0.07;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = clamp((y + height * 0.5) / height, 0, 1);
    const edge = 1 + Math.sin(t * 7.1 + seed) * 0.09;
    p.setXYZ(i, p.getX(i) * edge + bendX * t * t, y, p.getZ(i) * edge + bendZ * t * t);
  }
  roughen(geo, seed, 0.12);
  geo.clearGroups();
  const n = geo.attributes.normal;
  for (let i = 0; i < p.count; i += 3) geo.addGroup(i, 3, n.getX(i) < 0 ? 1 : 0);
  return geo;
}

function paintedMesh(T, uniforms, pal, geo, colors, seed, options = {}) {
  return new T.Mesh(geo, washMaterial(T, uniforms, pal, geo, {
    ...colors, seed, rag: 0.16, grain: 1.15, inkLine: 0.72, top: 0.35,
    skyTop: 0.32, dry: 0.2, margin: 0.012, base: 0.62, ...options,
  }));
}

function statNumber(...values) {
  for (const value of values) if (Number.isFinite(Number(value)) && Number(value) > 0) return Number(value);
  return 0;
}

function wheelMeasures(feature) {
  const activeS = statNumber(feature.stats?.activeS) || 3600;
  const radius = P['living.wheel'] > 0
    ? clamp(1.2 + 0.85 * Math.sqrt(activeS / 3600), 1.4, 3.2)
    : P['kinds.wheel.radius'];
  const cadence = statNumber(feature.stats?.avgCadence);
  const spinRps = P['living.wheel'] > 0 && cadence
    ? clamp(0.15 + ((cadence - 50) / 60) * 0.2, 0.15, 0.35)
    : 0;
  return { radius, spinRps };
}

function addWheelSpokes(T, group, geo, material, radius, centreY, count, uniforms, spinRps) {
  const up = new T.Vector3(0, 1, 0);
  const ray = new T.Vector3();
  const spokes = [];
  for (let i = 0; i < count; i++) {
    const a = i * TAU / count;
    const spoke = new T.Mesh(geo, material);
    spoke.name = 'wheel-spoke';
    ray.set(Math.cos(a), Math.sin(a), 0);
    spoke.position.set(ray.x * radius * 0.455, centreY + ray.y * radius * 0.455, 0);
    spoke.quaternion.setFromUnitVectors(up, ray);
    group.add(spoke);
    spokes.push({ mesh: spoke, angle: a });
  }
  if (!spinRps) return;
  const updateMatrixWorld = group.updateMatrixWorld;
  group.updateMatrixWorld = function updateSpinningWheel(force) {
    const turn = -TAU * spinRps * (Number(uniforms?.uTime?.value) || 0);
    for (let i = 0; i < spokes.length; i++) {
      const spoke = spokes[i];
      const a = spoke.angle + turn;
      ray.set(Math.cos(a), Math.sin(a), 0);
      spoke.mesh.position.set(ray.x * radius * 0.455, centreY + ray.y * radius * 0.455, 0);
      spoke.mesh.quaternion.setFromUnitVectors(up, ray);
    }
    return updateMatrixWorld.call(this, force);
  };
}

function spires(T, ctx) {
  const { feature, features, uniforms, palette: pal, rng } = ctx;
  const stats = feature.stats || {};
  const sets = statNumber(stats.strength?.sets);
  const activeS = statNumber(stats.activeS);
  const load = statNumber(stats.strength?.volumeKg, stats.trainingLoad);
  const count = clamp(Math.round(sets || (activeS ? activeS / P['kinds.spires.countSeconds'] : 4)), 3, 12);
  const tallest = stats.strength?.volumeKg
    ? clamp(4.2 + Math.log1p(load / 900) * P['kinds.spires.heightK'], 4.2, 10.5)
    : clamp(4.0 + Math.sqrt(load) * P['kinds.spires.loadK'] + activeS / 3600, 4.2, 9.2);
  const dir = feature.dir;
  const frame = featureFrame(T, features, dir);
  const g = new T.Group();
  const up = new T.Vector3(0, 1, 0);
  const litPlane = mix(pal.landMid, pal.litWarm, 0.32);
  const shadePlane = mix(pal.shadeCool, pal.ink, 0.34);
  const planeMaterial = (geo, color, seed) => washMaterial(T, uniforms, pal, geo, {
    lit: color, shade: color, sky: color, seed,
    rag: 0, grain: 0.55, inkLine: 1, top: 0, skyTop: 0, dry: 0, margin: 0, base: 0,
  });
  for (let i = 0; i < count; i++) {
    const a = i * 2.399963 + rng() * 0.28;
    const r = i ? 0.65 + Math.sqrt(i / Math.max(1, count - 1)) * 2.35 : 0;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const height = tallest * (i ? 0.45 + rng() * 0.42 : 1);
    const radius = (0.42 + height * 0.075) * (0.82 + rng() * 0.34);
    const geo = spireGeometry(T, radius, height, 4 + (i % 2), 11 + i * 3.7);
    const m = new T.Mesh(geo, [
      planeMaterial(geo, litPlane, 9 + i * 4.1),
      planeMaterial(geo, shadePlane, 10.3 + i * 4.1),
    ]);
    const seat = onGround(features, frame, new T.Vector3(x, 0, z));
    m.quaternion.setFromUnitVectors(up, seat.dir.clone().applyQuaternion(frame.qi));
    m.rotateY(rng() * TAU);
    const axis = up.clone().applyQuaternion(m.quaternion);
    m.position.copy(seat.pos).addScaledVector(axis, height * 0.5 - 0.14);
    m.frustumCulled = false;
    g.add(m);
    const shadow = castShadow(T, features, frame, dir, uniforms, pal, {
      len: height * 0.8, wide: radius * 2, flare: 0, seed: 18.7 + i * 2.9, origin: seat.pos,
    });
    if (shadow) g.add(shadow);
  }
  return g;
}

function wheel(T, ctx) {
  const { feature, features, uniforms, palette: pal } = ctx;
  const dir = feature.dir;
  const frame = featureFrame(T, features, dir);
  const g = new T.Group();
  const rig = new T.Group();
  const seat = onGround(features, frame, new T.Vector3());
  rig.position.copy(seat.pos);
  const up = new T.Vector3(0, 1, 0);
  rig.quaternion.setFromUnitVectors(up, groundNormal(T, features, frame, 0.8));
  const sunL = sunOf(T, uniforms).value.clone().applyQuaternion(frame.qi);
  rig.rotateY(Math.atan2(sunL.x, sunL.z) + 0.42);
  g.add(rig);

  const ochre = {
    lit: mix(pal.landMid, pal.litWarm, 0.46), shade: mix(pal.sepia, pal.shadeCool, 0.62),
    sky: mix(pal.litWarm, pal.paper, 0.3),
  };
  const slate = {
    lit: mix(pal.landHigh, pal.shadeCool, 0.18), shade: mix(pal.shadeCool, pal.ink, 0.52),
    sky: mix(pal.skyHigh, pal.paper, 0.24),
  };
  const { radius, spinRps } = wheelMeasures(feature);
  const spokes = Math.round(P['kinds.wheel.spokes']);
  const centreY = radius - 0.18;
  const ringGeo = new T.TorusGeometry(radius, 0.24, 4, 32).toNonIndexed();
  const ringPos = ringGeo.attributes.position;
  const sunWheel = sunL.clone().applyAxisAngle(up, -rig.rotation.y).setZ(0).normalize();
  ringGeo.clearGroups();
  let groupStart = 0;
  let groupMaterial = 0;
  for (let i = 0; i < ringPos.count; i += 3) {
    const x = ringPos.getX(i) + ringPos.getX(i + 1) + ringPos.getX(i + 2);
    const y = ringPos.getY(i) + ringPos.getY(i + 1) + ringPos.getY(i + 2);
    const material = x * sunWheel.x + y * sunWheel.y < 0 ? 1 : 0;
    if (material !== groupMaterial) {
      if (i > groupStart) ringGeo.addGroup(groupStart, i - groupStart, groupMaterial);
      groupStart = i;
      groupMaterial = material;
    }
  }
  ringGeo.addGroup(groupStart, ringPos.count - groupStart, groupMaterial);
  ringGeo.computeVertexNormals();
  const ring = new T.Mesh(ringGeo, [
    washMaterial(T, uniforms, pal, ringGeo, {
      lit: ochre.lit, shade: ochre.lit, sky: ochre.lit, seed: 3.2,
      rag: 0, grain: 0.45, inkLine: 0.8, top: 0, skyTop: 0, dry: 0, margin: 0, base: 0,
    }),
    washMaterial(T, uniforms, pal, ringGeo, {
      lit: slate.lit, shade: slate.lit, sky: slate.lit, seed: 3.2,
      rag: 0, grain: 0.45, inkLine: 0.8, top: 0, skyTop: 0, dry: 0, margin: 0, base: 0,
    }),
  ]);
  ring.position.y = centreY;
  ring.frustumCulled = false;
  rig.add(ring);

  const spokeGeo = new T.CylinderGeometry(0.07, 0.09, radius * 0.91, 6);
  const spokeMat = washMaterial(T, uniforms, pal, spokeGeo, {
    ...slate, seed: 5.6, rag: 0.08, grain: 0.9, inkLine: 0.58, top: 0.15, base: 0.3,
  });
  addWheelSpokes(T, rig, spokeGeo, spokeMat, radius, centreY, spokes, uniforms, spinRps);
  const hubGeo = new T.CylinderGeometry(0.31, 0.31, 0.48, 8);
  const hub = paintedMesh(T, uniforms, pal, hubGeo, slate, 7.1);
  hub.position.set(0, centreY, 0);
  hub.rotation.x = Math.PI / 2;
  rig.add(hub);


  const shadow = castShadow(T, features, frame, dir, uniforms, pal, {
    len: P['living.wheel'] > 0 ? radius * (4.8 / 2.05) : 4.8,
    wide: P['living.wheel'] > 0 ? radius * (1.25 / 2.05) : 1.25,
    seed: 12.9, origin: seat.pos,
  });
  if (shadow) g.add(shadow);
  return g;
}

function lagoon(T, ctx) {
  const { feature, features, uniforms, palette: pal, rng } = ctx;
  const dir = feature.dir;
  const frame = featureFrame(T, features, dir);
  const g = new T.Group();
  const start = rng() * TAU;
  const basinRadius = features.lagoons?.find((basin) => basin.featureId === feature.id)?.radius || 6;
  const near = Math.max(1.8, basinRadius * 0.75);
  const far = Math.max(8, basinRadius * 1.3);
  let shore = null;
  for (let j = 0; j < 12 && !shore; j++) {
    const a = start + j * TAU / 12;
    let crest = null;
    for (let r = near; r <= far; r += 0.5) {
      const local = new T.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
      const seat = onGround(features, frame, local);
      const height = features.heightAt(seat.dir);
      if (height > features.seaLevel + 0.08 && (!crest || height > crest.height)) {
        crest = { local, seat, height };
      }
    }
    shore = crest;
  }
  if (!shore) {
    const local = new T.Vector3(Math.cos(start) * basinRadius, 0, Math.sin(start) * basinRadius);
    shore = { local, seat: onGround(features, frame, local) };
  }
  const inward = shore.local.clone().setY(0).normalize().negate();
  const side = new T.Vector3(-inward.z, 0, inward.x);
  const centreHeight = features.heightAt(dir);
  const deckY = Math.max(shore.seat.pos.y + 0.34, features.seaLevel - centreHeight + 0.28);
  const yaw = Math.atan2(inward.x, inward.z);
  const wood = {
    lit: mix(pal.wood, pal.litWarm, 0.42), shade: mix(pal.wood, pal.shadeCool, 0.5),
    sky: mix(pal.litWarm, pal.paper, 0.34),
  };
  const dark = {
    lit: mix(pal.sepia, pal.shadeCool, 0.34), shade: mix(pal.shadeCool, pal.ink, 0.58),
    sky: mix(pal.wood, pal.paper, 0.22),
  };
  const plankGeo = new T.BoxGeometry(1.35, 0.13, 0.38);
  for (let i = 0; i < 7; i++) {
    const p = shore.local.clone().addScaledVector(inward, i * 0.4 + 0.12);
    const plank = paintedMesh(T, uniforms, pal, plankGeo, wood, 20 + i * 1.9);
    plank.position.set(p.x, deckY + (i % 3 - 1) * 0.012, p.z);
    plank.rotation.y = yaw;
    g.add(plank);
  }
  const postPoints = [
    shore.local.clone().addScaledVector(inward, 0.18).addScaledVector(side, -0.55),
    shore.local.clone().addScaledVector(inward, 0.18).addScaledVector(side, 0.55),
    shore.local.clone().addScaledVector(inward, 2.45).addScaledVector(side, -0.55),
    shore.local.clone().addScaledVector(inward, 2.45).addScaledVector(side, 0.55),
  ];
  for (let i = 0; i < postPoints.length; i++) {
    const p = postPoints[i];
    const ground = onGround(features, frame, p);
    const bottom = ground.pos.y - 0.08;
    const top = deckY + (i < 2 ? 0.55 : 0.78);
    const geo = new T.CylinderGeometry(0.09, 0.12, Math.max(0.4, top - bottom), 6);
    const post = paintedMesh(T, uniforms, pal, geo, dark, 34 + i * 2.3);
    post.position.set(p.x, (bottom + top) * 0.5, p.z);
    g.add(post);
  }
  const shadow = castShadow(T, features, frame, dir, uniforms, pal, {
    len: 3.1, wide: 0.8, seed: 44.2,
    origin: shore.local.clone().addScaledVector(inward, 1.15),
  });
  if (shadow) g.add(shadow);
  return g;
}

function cairn(T, ctx) {
  const { feature, features, uniforms, palette: pal, rng } = ctx;
  const stats = feature.stats || {};
  const activeS = statNumber(stats.activeS);
  const load = statNumber(stats.trainingLoad);
  const scale = clamp(1.0 + activeS / P['kinds.cairn.timeDiv'] + Math.sqrt(load) / P['kinds.cairn.loadDiv'], 1.05, P['kinds.cairn.scaleMax']);
  const levels = clamp(4 + Math.round(activeS / 3600 + load / 100), 4, 7);
  const football = String(stats.sport || '').toLowerCase().includes('football');
  const dir = feature.dir;
  const frame = featureFrame(T, features, dir);
  const g = new T.Group();
  const rig = new T.Group();
  const seat = onGround(features, frame, new T.Vector3());
  rig.position.copy(seat.pos);
  rig.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), groundNormal(T, features, frame, 0.7));
  const sunL = sunOf(T, uniforms).value.clone().applyQuaternion(frame.qi);
  rig.rotateY(Math.atan2(sunL.x, sunL.z));
  g.add(rig);

  const ochre = {
    lit: mix(pal.stone, pal.litWarm, 0.38), shade: mix(pal.sepia, pal.shadeCool, 0.55),
    sky: mix(pal.stone, pal.paper, 0.36),
  };
  const slate = {
    lit: mix(pal.landHigh, pal.farGlaze, 0.22), shade: mix(pal.shadeCool, pal.ink, 0.45),
    sky: mix(pal.skyHigh, pal.paper, 0.28),
  };
  let y = 0;
  let top = null;
  for (let i = 0; i < levels; i++) {
    const t = i / Math.max(1, levels - 1);
    const r = scale * (0.68 - 0.38 * t) * (0.9 + rng() * 0.16);
    const isTopBall = football && i === levels - 1;
    const rx = r * (isTopBall ? 1.48 : 1.08 + rng() * 0.18);
    const ry = r * (isTopBall ? 0.58 : 0.48 + rng() * 0.13);
    const rz = r * (isTopBall ? 0.74 : 0.88 + rng() * 0.16);
    const geo = roughen(new T.IcosahedronGeometry(1, 0), 55 + i * 4.7, 0.13);
    geo.scale(rx, ry, rz);
    const rock = paintedMesh(T, uniforms, pal, geo, i % 2 ? slate : ochre, 51 + i * 3.3);
    y += ry * 0.55;
    rock.position.set((rng() - 0.5) * r * 0.2, y, (rng() - 0.5) * r * 0.15);
    rock.rotation.set((rng() - 0.5) * 0.1, rng() * TAU, (rng() - 0.5) * 0.12);
    if (isTopBall) rock.rotation.z = -0.16;
    rig.add(rock);
    y += ry * 0.45;
    if (isTopBall) top = { rock, rx, ry, rz };
  }
  if (top) {
    const laceGeo = new T.BoxGeometry(0.045, top.ry * 0.48, 0.035);
    const laceMat = washMaterial(T, uniforms, pal, laceGeo, {
      lit: mix(pal.paper, pal.stone, 0.2), shade: mix(pal.stone, pal.shadeCool, 0.35),
      seed: 78.1, rag: 0.05, grain: 0.5, inkLine: 0.2, top: 0.1, base: 0,
    });
    for (let i = -1; i <= 1; i++) {
      const lace = new T.Mesh(laceGeo, laceMat);
      lace.position.set(i * top.rx * 0.22, top.ry * 0.2, top.rz * 0.83);
      lace.rotation.z = Math.PI / 2;
      top.rock.add(lace);
    }
  }
  const shadow = castShadow(T, features, frame, dir, uniforms, pal, {
    len: Math.max(2.8, y * 0.95), wide: scale * 0.72, seed: 82.6, origin: seat.pos,
  });
  if (shadow) g.add(shadow);
  return g;
}

/* ------------------------------------------------------------- the pitch ---- */

// One point of the feature's own tangent frame laid on a height field: the
// offsets (x, z) taken out onto the sphere, the field read under them, and the
// answer brought back into the frame with `lift` units of paint on top. Turf,
// chalk, the goals and the orbit mark are all seated through it: a pitch is a
// fifth of the planet's radius across, so one flat plane hung off its centre
// would bury one end in the swale and float the other clear of the ground.
function seatPoint(h, frame, x, z, lift, out) {
  const d = out.set(x, 0, z).applyQuaternion(frame.q).add(frame.P).normalize();
  return d.multiplyScalar(R + h(d) + lift).sub(frame.P).applyQuaternion(frame.qi);
}

// The mown field: a grid of quads seated on the ground in `bands` stripes across
// the length, the two greens alternating band by band. The cells are gathered
// into one group per band, so a whole pitch is one geometry and two washes — and
// the stripes stay straight while the ground under them does not.
function turfMesh(T, at, { span, wide, lift, bands, cell }) {
  const perBand = Math.max(1, Math.round(span / bands / cell));
  const cols = bands * perBand;
  const rows = Math.max(2, Math.round(wide / cell));
  const dx = span / cols;
  const dz = wide / rows;
  const pos = new Float32Array((cols + 1) * (rows + 1) * 3);
  const p = new T.Vector3();
  let k = 0;
  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j <= rows; j++) {
      at(-span / 2 + i * dx, -wide / 2 + j * dz, lift, p);
      pos[k++] = p.x; pos[k++] = p.y; pos[k++] = p.z;
    }
  }
  const idx = [];
  const runs = [];
  for (let b = 0; b < bands; b++) {
    const start = idx.length;
    for (let i = b * perBand; i < (b + 1) * perBand; i++) {
      for (let j = 0; j < rows; j++) {
        const a = i * (rows + 1) + j;
        idx.push(a, a + 1, a + rows + 1, a + 1, a + rows + 2, a + rows + 1);
      }
    }
    runs.push({ start, count: idx.length - start, material: b % 2 });
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  for (const run of runs) geo.addGroup(run.start, run.count, run.material);
  geo.computeVertexNormals();
  return geo;
}

// One chalk mark: a polyline of frame points (x0, z0, x1, z1, …) laid on the
// ground as a strip `wide` across, so a touchline runs over the swale instead of
// through it. Every mark of a field goes into one accumulator — positions and
// indices — and so into one geometry and one wash.
function chalkStrip(at, pts, wide, lift, acc, p) {
  const half = wide * 0.5;
  const base = acc.pos.length / 3;
  const last = pts.length / 2 - 1;
  for (let i = 0; i <= last; i++) {
    const ax = pts[Math.max(0, i - 1) * 2], az = pts[Math.max(0, i - 1) * 2 + 1];
    const bx = pts[Math.min(last, i + 1) * 2], bz = pts[Math.min(last, i + 1) * 2 + 1];
    let tx = bx - ax, tz = bz - az;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len; tz /= len;
    const x = pts[i * 2], z = pts[i * 2 + 1];
    const s = at(x - tz * half, z + tx * half, lift, p);
    acc.pos.push(s.x, s.y, s.z);
    const e = at(x + tz * half, z - tx * half, lift, p);
    acc.pos.push(e.x, e.y, e.z);
  }
  for (let i = 1; i <= last; i++) {
    const a = base + (i - 1) * 2;
    acc.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
}

// A football pitch, painted on the ground the way everything else the hand lays
// there is: a mown rectangle in two alternating greens, the chalk ruled over it
// — touchlines and goal lines, the halfway line, the centre circle and both
// boxes — two small goals with their nets, a flag at every corner, and the ball
// waiting on the spot. A session's length sets the field's (readWeek sizes the
// footprint and sites it; the kinds.pitch dials cap it), width follows a real
// pitch's ratio, the bearing is the flattest of twelve measured under its own
// corners — a little against turning the length out of the sun's own, so the
// light rakes along the field — and every mark of it is seated on the relief it
// was sited on. The mown field and the chalk are ground the feature stands on
// (base.js's bounding sphere), the goals and the flags are the thing itself.
function pitch(T, ctx) {
  const { feature, features, uniforms, palette: pal, rng } = ctx;
  const frame = featureFrame(T, features, feature.dir);
  const span = Number.isFinite(feature.span) ? feature.span : P['kinds.pitch.spanBase'];
  const wide = Number.isFinite(feature.width) ? feature.width : span * 0.62;
  const up = new T.Vector3(0, 1, 0);
  const p = new T.Vector3();
  const sunL = sunOf(T, uniforms).value.clone().applyQuaternion(frame.qi);

  // The bearing the field lies on: the flattest of twelve, read under its own
  // corners and its halfway posts, a little against turning the length out of
  // the sun's own so the light rakes along the field rather than across it.
  const toSun = Math.atan2(-sunL.z, sunL.x);
  const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0, -0.5], [0, 0.5], [0.5, 0]];
  let yaw = toSun, flattest = Infinity;
  for (let k = 0; k < 12; k++) {
    const a = toSun + (k * TAU) / 12;
    const c = Math.cos(a), s = Math.sin(a);
    let hi = -Infinity, lo = Infinity;
    for (const [ox, oz] of corners) {
      const x = ox * span, z = oz * wide;
      const d = p.set(x * c + z * s, 0, -x * s + z * c).applyQuaternion(frame.q).add(frame.P).normalize();
      const h = features.heightAt(d);
      if (h > hi) hi = h;
      if (h < lo) lo = h;
    }
    const cost = hi - lo + 0.08 * span * (1 - Math.cos(a - toSun));
    if (cost < flattest) { flattest = cost; yaw = a; }
  }
  // the orbit mark is laid on the same bearing, so the pale rectangle from space
  // covers the field the visitor stands on
  feature.pitchYaw = yaw;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  // pitch-local (x along the length, z across it) → the frame → the ground
  const at = (x, z, lift, out = p) => seatPoint(
    features.heightAt, frame, x * cy + z * sy, -x * sy + z * cy, lift, out,
  );
  // the ground's own normal over the few units one small thing stands on
  const tiltAt = (x, z, r) => {
    const hx = at(x + r, z, 0, p).y - at(x - r, z, 0, p).y;
    const hz = at(x, z + r, 0, p).y - at(x, z - r, 0, p).y;
    return new T.Vector3(-hx / (2 * r), 1, -hz / (2 * r)).normalize();
  };
  const g = new T.Group();

  // The field and its chalk sit just above the ground, and both carry more
  // polygon offset than the ground patch they are painted over, so neither is
  // ever lost to it: a painted layer deep enough to win on its own (a hand's
  // width) would bury the runner's own shoes when they stand on the field.
  const turfLift = 0.04;
  const chalkLift = 0.1;

  // the mown field
  const turfGeo = turfMesh(T, at, {
    span, wide, lift: turfLift, bands: clamp(Math.round(span / 2.4), 6, 12), cell: 0.7,
  });
  const grass = (c, seed) => {
    const mat = washMaterial(T, uniforms, pal, turfGeo, {
      lit: c, shade: c, sky: c, seed, rag: 0, grain: 1.15, inkLine: 0.16,
      top: 0, skyTop: 0, dry: 0, margin: 0, base: 0,
    });
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -4; // the ground patch's own bias is -2/-2
    return mat;
  };
  // Two greens, and both are mostly the palette's own low ground: the mown
  // field is the week's grass note greyed and lifted toward the land wash it
  // stands in, so two stripes read as one field cut twice rather than two
  // pigments. (The ink pass draws the palette to the sheet as it is mixed, so a
  // stripe tinted toward the warm light would read olive, not green.)
  const turf = mix(pal.landLow, pal.veg, 0.5);
  const field = new T.Mesh(turfGeo, [
    grass(mix(turf, pal.paper, 0.3), 3.3),
    grass(mix(turf, pal.shadeCool, 0.26), 4.7),
  ]);
  field.name = 'pitch-turf';
  field.userData.groundWash = true;
  g.add(field);

  // the chalk: a real pitch's own proportions, at whatever size the week drew it
  const acc = { pos: [], idx: [] };
  const cx = span / 2, cz = wide / 2;
  const chalkW = clamp(span * 0.0075, 0.12, 0.22);
  const boxD = clamp(span * 0.157, 1.6, 6); // the penalty area: 16.5 m on a real 105 m field
  const boxW = clamp(wide * 0.62, 3, 12); // …and 40.3 m across
  const areaD = clamp(span * 0.052, 0.7, 2.2); // the goal area: 5.5 m
  const areaW = clamp(wide * 0.28, 1.6, 6.5); // …and 18.3 m
  const line = (x0, z0, x1, z1) => {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.8) + 1);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      pts.push(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
    }
    return pts;
  };
  const ringPts = (r, n) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    return pts;
  };
  chalkStrip(at, line(-cx, -cz, cx, -cz), chalkW, chalkLift, acc, p);
  chalkStrip(at, line(-cx, cz, cx, cz), chalkW, chalkLift, acc, p);
  chalkStrip(at, line(-cx, -cz, -cx, cz), chalkW, chalkLift, acc, p);
  chalkStrip(at, line(cx, -cz, cx, cz), chalkW, chalkLift, acc, p);
  chalkStrip(at, line(0, -cz, 0, cz), chalkW, chalkLift, acc, p);
  const circle = clamp(span * 0.105, 1.5, 4); // the centre circle: 9.15 m of 105
  chalkStrip(at, ringPts(circle, Math.max(20, Math.round(circle * 10))), chalkW, chalkLift, acc, p);
  for (const s of [-1, 1]) {
    const x = s * cx;
    chalkStrip(at, line(x, -boxW / 2, x - s * boxD, -boxW / 2), chalkW, chalkLift, acc, p);
    chalkStrip(at, line(x, boxW / 2, x - s * boxD, boxW / 2), chalkW, chalkLift, acc, p);
    chalkStrip(at, line(x - s * boxD, -boxW / 2, x - s * boxD, boxW / 2), chalkW, chalkLift, acc, p);
    chalkStrip(at, line(x, -areaW / 2, x - s * areaD, -areaW / 2), chalkW, chalkLift, acc, p);
    chalkStrip(at, line(x, areaW / 2, x - s * areaD, areaW / 2), chalkW, chalkLift, acc, p);
    chalkStrip(at, line(x - s * areaD, -areaW / 2, x - s * areaD, areaW / 2), chalkW, chalkLift, acc, p);
  }
  const chalkGeo = new T.BufferGeometry();
  chalkGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(acc.pos), 3));
  chalkGeo.setIndex(acc.idx);
  chalkGeo.computeVertexNormals();
  const chalkMat = washMaterial(T, uniforms, pal, chalkGeo, {
    lit: mix(pal.paper, pal.litWarm, 0.06), shade: mix(pal.stone, pal.shadeCool, 0.3),
    sky: mix(pal.paper, pal.skyHigh, 0.2), seed: 6.1,
    rag: 0.04, grain: 0.35, inkLine: 0.2, top: 0, skyTop: 0, dry: 0, margin: 0, base: 0,
  });
  chalkMat.polygonOffset = true;
  chalkMat.polygonOffsetFactor = -2;
  chalkMat.polygonOffsetUnits = -8;
  const chalk = new T.Mesh(chalkGeo, chalkMat);
  chalk.name = 'pitch-chalk';
  chalk.userData.groundWash = true;
  g.add(chalk);

  // the goals: small ones, the size a training week plays with — posts square to
  // the ground under them, crossbar, and the net as the sheet a real one hangs
  // in, a quad leaning back off the bar in dry strokes, so it reads as a mesh
  // from either side of it
  const mouth = clamp(span * 0.11, 1.7, 3.1);
  const high = mouth * 0.74; // a small goal: a touch over the runner's own height
  const back = mouth * 0.42;
  const white = {
    lit: mix(pal.paper, pal.litWarm, 0.06), shade: mix(pal.stone, pal.shadeCool, 0.38),
    sky: mix(pal.paper, pal.skyHigh, 0.3),
  };
  for (const s of [-1, 1]) {
    const goal = new T.Group();
    goal.position.copy(at(s * cx, 0, 0, new T.Vector3()));
    goal.quaternion.setFromUnitVectors(up, tiltAt(s * cx, 0, 0.8));
    goal.rotateY(yaw);
    const postGeo = new T.CylinderGeometry(0.045, 0.055, high, 5);
    const postMat = washMaterial(T, uniforms, pal, postGeo, {
      ...white, seed: 7.7 + s * 2.9, rag: 0.06, grain: 0.8, inkLine: 0.5,
      top: 0.12, skyTop: 0.15, dry: 0.08, margin: 0.012, base: 0.25,
    });
    for (const z of [-mouth / 2, mouth / 2]) {
      const post = new T.Mesh(postGeo, postMat);
      post.position.set(0, high / 2 - 0.06, z);
      goal.add(post);
    }
    const barGeo = new T.CylinderGeometry(0.045, 0.045, mouth, 5);
    const bar = new T.Mesh(barGeo, washMaterial(T, uniforms, pal, barGeo, {
      ...white, seed: 8.3 + s * 2.9, rag: 0.06, grain: 0.8, inkLine: 0.5,
      top: 0.2, skyTop: 0, dry: 0.05, margin: 0.012, base: 0.15,
    }));
    bar.rotation.x = Math.PI / 2;
    bar.position.set(0, high, 0);
    goal.add(bar);
    const netGeo = new T.BufferGeometry();
    netGeo.setAttribute('position', new T.BufferAttribute(new Float32Array([
      0, high, -mouth / 2, 0, high, mouth / 2, s * back, 0.05, -mouth / 2,
      0, high, mouth / 2, s * back, 0.05, mouth / 2, s * back, 0.05, -mouth / 2,
    ]), 3));
    netGeo.computeVertexNormals();
    const netMat = washMaterial(T, uniforms, pal, netGeo, {
      lit: mix(pal.paper, pal.litWarm, 0.12), shade: mix(pal.stone, pal.shadeCool, 0.5),
      sky: mix(pal.paper, pal.skyHigh, 0.4), seed: 9.1 + s * 2.9,
      rag: 0.05, grain: 0.5, inkLine: 0.3, top: 0, skyTop: 0.22, dry: 0.55, margin: 0.014, base: 0.08,
    });
    netMat.side = T.DoubleSide;
    goal.add(new T.Mesh(netGeo, netMat));
    goal.name = 'pitch-goal';
    g.add(goal);
    // a goal's shadow, laid on the mown field: short and light, because a full
    // sheet of ink on dark turf reads as a thing dropped there, not as shade
    const shadow = castShadow(T, features, frame, feature.dir, uniforms, pal, {
      len: high * 0.6, wide: 0.34, flare: 0.4, alpha: 0.2,
      seed: 11.3 + s * 1.7, origin: goal.position, lift: chalkLift,
    });
    if (shadow) {
      shadow.name = 'pitch-shadow';
      g.add(shadow);
    }
  }

  // a flag at every corner: a thin pole with the sport's own pennant on it, all
  // four streaming the same way, because the wind does not care about corners
  const flagH = clamp(wide * 0.14, 0.9, 1.35);
  const poleGeo = new T.CylinderGeometry(0.028, 0.038, flagH, 5);
  const poleMat = washMaterial(T, uniforms, pal, poleGeo, {
    lit: mix(pal.paper, pal.litWarm, 0.2), shade: mix(pal.stone, pal.shadeCool, 0.4),
    sky: mix(pal.paper, pal.skyHigh, 0.3), seed: 12.3,
    rag: 0.05, grain: 0.7, inkLine: 0.5, top: 0.15, skyTop: 0.1, dry: 0.05, margin: 0.012, base: 0.2,
  });
  const pennantGeo = new T.BufferGeometry();
  pennantGeo.setAttribute('position', new T.BufferAttribute(new Float32Array([
    0, flagH * 0.98, 0, 0, flagH * 0.62, 0, flagH * 0.42, flagH * 0.8, 0,
  ]), 3));
  pennantGeo.computeVertexNormals();
  const pennant = mix(new T.Color(P['pal.accentSport']), pal.ink, 0.12);
  const pennantMat = washMaterial(T, uniforms, pal, pennantGeo, {
    lit: pennant, shade: mix(pennant, pal.shadeCool, 0.45), sky: mix(pennant, pal.paper, 0.3),
    seed: 13.7, rag: 0.08, grain: 0.7, inkLine: 0.55, top: 0.15, skyTop: 0, dry: 0, margin: 0.02, base: 0.15,
  });
  pennantMat.side = T.DoubleSide;
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      const corner = new T.Group();
      corner.position.copy(at(s * cx, t * cz, 0, new T.Vector3()));
      corner.quaternion.setFromUnitVectors(up, tiltAt(s * cx, t * cz, 0.5));
      corner.rotateY(yaw);
      const pole = new T.Mesh(poleGeo, poleMat);
      pole.position.y = flagH / 2;
      corner.name = 'pitch-flag';
      corner.add(pole, new T.Mesh(pennantGeo, pennantMat));
      g.add(corner);
    }
  }

  // the ball, waiting on the spot: the cairn's own football, laid down
  const ballR = clamp(span * 0.021, 0.24, 0.42);
  const ballGeo = roughen(new T.IcosahedronGeometry(1, 0), 137.4, 0.09);
  ballGeo.scale(ballR, ballR * 0.94, ballR);
  const ball = paintedMesh(T, uniforms, pal, ballGeo, {
    lit: mix(pal.paper, pal.litWarm, 0.14), shade: mix(pal.stone, pal.shadeCool, 0.5),
    sky: mix(pal.paper, pal.skyHigh, 0.3),
  }, 141.2);
  ball.position.copy(at(0, 0, turfLift + ballR * 0.96, new T.Vector3()));
  ball.rotation.y = rng() * TAU;
  ball.name = 'pitch-ball';
  g.add(ball);
  const laceGeo = new T.BoxGeometry(0.032, ballR * 0.5, 0.026);
  const laceMat = washMaterial(T, uniforms, pal, laceGeo, {
    lit: pal.ink, shade: pal.ink, sky: pal.ink, seed: 145.7,
    rag: 0.05, grain: 0.4, inkLine: 0.2, top: 0, skyTop: 0, dry: 0, margin: 0, base: 0,
  });
  for (let i = -1; i <= 1; i++) {
    const lace = new T.Mesh(laceGeo, laceMat);
    lace.position.set(i * ballR * 0.36, ballR * 0.78, 0);
    lace.rotation.z = Math.PI / 2;
    ball.add(lace);
  }
  return g;
}

/**
 * Blend a detailed surface object into a smaller orbit silhouette without an
 * LOD pop. Representation size follows camera distance; both forms separately
 * follow base.js's capped-globe/full-patch ground handover. `always` is for a
 * form that is ground rather than an activity standing on it (the field of a
 * football week): it is carried into the orbit view whether or not
 * living.orbitMarks asks for the week's silhouettes.
 */
export function livingObjectLod(T, ctx, near, far, { always = false } = {}) {
  if ((!always && P['living.orbitMarks'] <= 0) || !ctx.camera || !far) {
    const lod = new T.LOD();
    lod.addLevel(near, 0);
    lod.addLevel(new T.Object3D(), 180);
    return lod;
  }
  const root = new T.Group();
  const dir = ctx.feature.dir;
  const patch = ctx.uniforms?.patchMask;
  const drop = ctx.features.orbitHeightAt(dir) - ctx.features.heightAt(dir);
  far.position.y = drop;
  far.scale.setScalar(0);
  far.visible = false;
  root.add(near, far);
  const updateMatrixWorld = root.updateMatrixWorld;
  root.updateMatrixWorld = function updateLivingLod(force) {
    const raw = clamp((ctx.camera.position.distanceTo(this.position) - 145) / 70, 0, 1);
    const orbit = raw * raw * (3 - 2 * raw);
    let capped = 1;
    if (patch?.on?.value > 0.5) {
      const centre = patch.centre.value;
      const theta = Math.acos(clamp(dir.dot(centre), -1, 1));
      const span = Math.max(Math.abs(dir.dot(patch.east.value)), Math.abs(dir.dot(patch.north.value)));
      const mask = theta * span / (Math.max(Math.sin(theta), 1e-6) * patch.half.value);
      const edge = clamp((mask - patch.fade.value) / Math.max(1e-6, 1 - patch.fade.value), 0, 1);
      capped = edge * edge * (3 - 2 * edge);
    }
    const groundDrop = drop * capped;
    near.position.y = groundDrop;
    far.position.y = groundDrop;
    near.scale.setScalar(1 - orbit);
    near.visible = orbit < 1;
    far.scale.setScalar(orbit);
    far.visible = orbit > 0;
    return updateMatrixWorld.call(this, force);
  };
  return root;
}

function orbitKindMark(T, ctx) {
  const { feature, features, uniforms, palette: pal } = ctx;
  const g = new T.Group();
  const ochre = {
    lit: mix(pal.stone, pal.litWarm, 0.35), shade: mix(pal.sepia, pal.shadeCool, 0.58),
    sky: mix(pal.stone, pal.paper, 0.32),
  };
  const slate = {
    lit: mix(pal.landHigh, pal.shadeCool, 0.18), shade: mix(pal.shadeCool, pal.ink, 0.55),
    sky: mix(pal.skyHigh, pal.paper, 0.24),
  };

  if (feature.kind === 'spires') {
    const stats = feature.stats || {};
    const sets = statNumber(stats.strength?.sets);
    const activeS = statNumber(stats.activeS);
    const load = statNumber(stats.strength?.volumeKg, stats.trainingLoad);
    const count = clamp(Math.round(sets || (activeS ? activeS / P['kinds.spires.countSeconds'] : 4)), 3, 12);
    const tallest = stats.strength?.volumeKg
      ? clamp(4.2 + Math.log1p(load / 900) * P['kinds.spires.heightK'], 4.2, 10.5)
      : clamp(4 + Math.sqrt(load) * P['kinds.spires.loadK'] + activeS / 3600, 4.2, 9.2);
    const shown = clamp(Math.ceil(count / 3), 2, 4);
    for (let i = 0; i < shown; i++) {
      const h = clamp(tallest * (i ? 0.5 + i * 0.08 : 0.62), 2.8, 5.4);
      const geo = roughen(new T.ConeGeometry(0.42 + h * 0.065, h, 4 + (i % 2)), 91 + i * 3.7, 0.08);
      const mark = paintedMesh(T, uniforms, pal, geo, i % 2 ? slate : ochre, 94 + i * 2.3, {
        rag: 0.04, grain: 0.7, inkLine: 0.85, skyTop: 0.18,
      });
      const a = i * 2.399963;
      const r = i ? 0.55 + i * 0.32 : 0;
      mark.position.set(Math.cos(a) * r, h * 0.5, Math.sin(a) * r);
      mark.rotation.y = a * 0.37;
      g.add(mark);
    }
  } else if (feature.kind === 'wheel') {
    const { radius: rawRadius, spinRps } = wheelMeasures(feature);
    const radius = clamp(rawRadius, 1.7, 2.7);
    const centreY = radius;
    const ringGeo = new T.TorusGeometry(radius, 0.25, 4, 20).toNonIndexed();
    const ring = paintedMesh(T, uniforms, pal, ringGeo, ochre, 104.2, {
      rag: 0, grain: 0.5, inkLine: 0.82, top: 0, skyTop: 0, dry: 0, margin: 0, base: 0,
    });
    ring.position.y = centreY;
    g.add(ring);
    const spokeGeo = new T.CylinderGeometry(0.09, 0.11, radius * 0.91, 5);
    const spokeMat = washMaterial(T, uniforms, pal, spokeGeo, {
      ...slate, seed: 108.4, rag: 0.04, grain: 0.7, inkLine: 0.65, top: 0.1, base: 0.25,
    });
    addWheelSpokes(T, g, spokeGeo, spokeMat, radius, centreY, 4, uniforms, spinRps);
    const hubGeo = new T.CylinderGeometry(0.3, 0.3, 0.42, 7);
    const hub = paintedMesh(T, uniforms, pal, hubGeo, slate, 111.1);
    hub.position.y = centreY;
    hub.rotation.x = Math.PI / 2;
    g.add(hub);
  } else if (feature.kind === 'lagoon') {
    const orbitH = features.orbitHeightAt(feature.dir);
    const y = Math.max(0.12, features.seaLevel - orbitH + 0.15);
    const wood = {
      lit: mix(pal.wood, pal.litWarm, 0.42), shade: mix(pal.wood, pal.shadeCool, 0.52),
      sky: mix(pal.litWarm, pal.paper, 0.3),
    };
    const plankGeo = new T.BoxGeometry(2, 0.18, 0.58);
    for (let i = 0; i < 5; i++) {
      const plank = paintedMesh(T, uniforms, pal, plankGeo, wood, 115 + i * 1.7);
      plank.position.set(0, y + (i % 2) * 0.025, -1.4 + i * 0.7);
      g.add(plank);
    }
    for (const x of [-0.62, 0.62]) {
      const postGeo = new T.CylinderGeometry(0.1, 0.13, 1.25, 5);
      const post = paintedMesh(T, uniforms, pal, postGeo, slate, 124 + x);
      post.position.set(x, y + 0.42, 0.78);
      g.add(post);
    }
  } else if (feature.kind === 'cairn') {
    const stats = feature.stats || {};
    const activeS = statNumber(stats.activeS);
    const load = statNumber(stats.trainingLoad);
    const scale = clamp(1 + activeS / P['kinds.cairn.timeDiv'] + Math.sqrt(load) / P['kinds.cairn.loadDiv'], 1.05, 1.7);
    const football = String(stats.sport || '').toLowerCase().includes('football');
    let y = 0;
    for (let i = 0; i < 3; i++) {
      const topBall = football && i === 2;
      const r = scale * (0.72 - i * 0.17);
      const geo = roughen(new T.IcosahedronGeometry(1, 0), 131 + i * 3.1, 0.1);
      geo.scale(r * (topBall ? 1.45 : 1.12), r * (topBall ? 0.58 : 0.55), r * (topBall ? 0.72 : 0.92));
      const stone = paintedMesh(T, uniforms, pal, geo, i % 2 ? slate : ochre, 134 + i * 2.1);
      const half = r * (topBall ? 0.58 : 0.55);
      y += half;
      stone.position.y = y;
      stone.rotation.set(0.03 * i, i * 0.8, topBall ? -0.16 : -0.025 * i);
      g.add(stone);
      y += half;
    }
  } else if (feature.kind === 'pitch') {
    // the field as it reads from space: the mown rectangle in the palest of the
    // two greens, on the same bearing and the same ground as the field itself,
    // so the pale block covers the pitch the visitor lands on
    const span = Number.isFinite(feature.span) ? feature.span : P['kinds.pitch.spanBase'];
    const wide = Number.isFinite(feature.width) ? feature.width : span * 0.62;
    const yaw = Number.isFinite(feature.pitchYaw) ? feature.pitchYaw : 0;
    const frame = featureFrame(T, features, feature.dir);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    // The mark is seated on the capped field the orbit mesh is drawn from; the
    // lod wrapper lifts the whole object onto that field as well, so the same
    // difference is taken back out here — otherwise a pitch that found its level
    // ground on a capped plateau would sink out of sight from orbit.
    const lift = 0.06 - (features.orbitHeightAt(feature.dir) - features.heightAt(feature.dir));
    const at = (x, z, l, out) => seatPoint(
      features.orbitHeightAt, frame, x * cy + z * sy, -x * sy + z * cy, l, out,
    );
    const geo = turfMesh(T, at, { span, wide, lift, bands: 5, cell: span / 5 });
    const pale = (c, seed) => {
      const mat = washMaterial(T, uniforms, pal, geo, {
        lit: c, shade: c, sky: c, seed, rag: 0, grain: 0.9, inkLine: 0,
        top: 0, skyTop: 0, dry: 0, margin: 0, base: 0,
      });
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -1;
      mat.polygonOffsetUnits = -2;
      return mat;
    };
    const mark = new T.Mesh(geo, [pale(mix(pal.veg, pal.paper, 0.56), 21.3), pale(mix(pal.veg, pal.paper, 0.36), 22.9)]);
    mark.name = 'pitch-mark';
    g.add(mark);
  }
  return g.children.length ? g : null;
}

function fallbackRng(text) {
  let a = 2166136261;
  for (let i = 0; i < text.length; i++) a = Math.imul(a ^ text.charCodeAt(i), 16777619);
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build one of the phase-two painted feature objects in its tangent frame. */
export function inkKindObject({ THREE: T, feature, features, uniforms, palette, camera = null }) {
  if (!T || !feature || !features || !palette || !feature.dir) return null;
  if (feature.kind === 'valley') return null;
  const rng = features.makeRng
    ? features.makeRng(`ink-kinds-${feature.id}`)
    : fallbackRng(String(feature.id || feature.kind));
  const ctx = { feature, features, uniforms, palette, camera, rng };
  let g = null;
  if (feature.kind === 'spires') g = spires(T, ctx);
  else if (feature.kind === 'wheel') g = wheel(T, ctx);
  else if (feature.kind === 'lagoon') g = lagoon(T, ctx);
  else if (feature.kind === 'cairn') g = cairn(T, ctx);
  else if (feature.kind === 'pitch') g = pitch(T, ctx);
  if (!g) return null;
  // A field is the week's ground, not an activity standing on it: its pale
  // rectangle belongs in the orbit view with the pitch dial itself, so it is not
  // left to living.orbitMarks (see livingObjectLod).
  const laid = feature.kind === 'pitch';
  const mark = laid || P['living.orbitMarks'] > 0 ? orbitKindMark(T, ctx) : null;
  const object = livingObjectLod(T, ctx, g, mark, { always: laid });
  object.userData.dir = feature.dir.clone();
  object.userData.feature = feature;
  return object;
}
