// True-3D voxel builder PROTOTYPE ("feel it" slice, Minecraft-style).
// Drag to spin, pinch to zoom, tap a block to add one on top; eraser removes.
// Raw Three.js (lazy-loaded so it never bloats the main app). Reachable at
// /?build3d with no login. Saves to localStorage.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const COLORS = [
  { name: "Grass", hex: 0x6abe30 },
  { name: "Dirt", hex: 0x8a5a2b },
  { name: "Stone", hex: 0x9aa0a6 },
  { name: "Wood", hex: 0xb5834b },
  { name: "Brick", hex: 0xc0392b },
  { name: "Water", hex: 0x3aa0dd },
  { name: "Sand", hex: 0xe8d18a },
  { name: "Snow", hex: 0xf4f7fb },
  { name: "Gold", hex: 0xf4c430 },
  { name: "Purple", hex: 0x8b5cf6 },
];
const BASE = 8;            // 8×8 grass platform
const SAVE = "toybox:build3d:v1";
const k = (x: number, y: number, z: number) => `${x},${y},${z}`;

export default function Build3D() {
  const mount = useRef<HTMLDivElement>(null);
  const colorRef = useRef(COLORS[0].hex);
  const eraseRef = useRef(false);
  const [sel, setSel] = useState(0);
  const [erase, setErase] = useState(false);
  const clearRef = useRef<() => void>(() => {});

  useEffect(() => { colorRef.current = COLORS[sel].hex; }, [sel]);
  useEffect(() => { eraseRef.current = erase; }, [erase]);

  useEffect(() => {
    const el = mount.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87b7e8); // sky
    const camera = new THREE.PerspectiveCamera(55, el.clientWidth / el.clientHeight, 0.1, 100);
    camera.position.set(9, 9, 12);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x556677, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(8, 15, 6);
    scene.add(sun);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.maxPolarAngle = Math.PI / 2.15;   // don't dip under the ground
    controls.minDistance = 5;
    controls.maxDistance = 40;
    controls.target.set(0.5, 1, 0.5);

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const edge = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 });
    const edgeGeo = new THREE.EdgesGeometry(geo);
    const matCache = new Map<number, THREE.Material>();
    const mat = (hex: number) => {
      let m = matCache.get(hex);
      if (!m) { m = new THREE.MeshLambertMaterial({ color: hex }); matCache.set(hex, m); }
      return m;
    };
    const blocks = new Map<string, { mesh: THREE.Mesh; color: number }>();

    const addBlock = (x: number, y: number, z: number, color: number) => {
      const key = k(x, y, z);
      if (blocks.has(key)) return;
      const mesh = new THREE.Mesh(geo, mat(color));
      mesh.position.set(x, y, z);
      mesh.add(new THREE.LineSegments(edgeGeo, edge));
      scene.add(mesh);
      blocks.set(key, { mesh, color });
    };
    const removeBlock = (key: string) => {
      const b = blocks.get(key);
      if (!b) return;
      scene.remove(b.mesh);
      blocks.delete(key);
    };
    const buildBase = () => {
      const o = Math.floor(BASE / 2);
      for (let x = -o; x < BASE - o; x++) for (let z = -o; z < BASE - o; z++) addBlock(x, 0, z, COLORS[0].hex);
    };
    const persist = () => {
      try {
        const arr = [...blocks.entries()].map(([key, b]) => ({ p: key, c: b.color }));
        localStorage.setItem(SAVE, JSON.stringify(arr));
      } catch {}
    };
    // load or seed
    let loaded = false;
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE) || "null");
      if (Array.isArray(raw) && raw.length) {
        raw.forEach((b: any) => { const [x, y, z] = b.p.split(",").map(Number); addBlock(x, y, z, b.c); });
        loaded = true;
      }
    } catch {}
    if (!loaded) buildBase();

    clearRef.current = () => { [...blocks.keys()].forEach(removeBlock); buildBase(); persist(); };

    // tap vs orbit
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downX = 0, downY = 0, downT = 0;
    const onDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; downT = Date.now(); };
    const onUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved > 8 || Date.now() - downT > 350) return; // it was a drag/zoom, not a tap
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects([...blocks.values()].map((b) => b.mesh), false);
      if (!hits.length) return;
      const hit = hits[0];
      const p = hit.object.position;
      if (eraseRef.current) {
        if (blocks.size > 1) removeBlock(k(p.x, p.y, p.z));
      } else {
        const n = hit.face!.normal;
        const nx = Math.round(p.x + n.x), ny = Math.round(p.y + n.y), nz = Math.round(p.z + n.z);
        if (ny >= 0) addBlock(nx, ny, nz, colorRef.current);
      }
      persist();
      try { navigator.vibrate?.(8); } catch {}
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();

    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "#87b7e8", fontFamily: "'Nunito',system-ui,sans-serif" }}>
      <div style={{ padding: "12px 14px 6px", textAlign: "center", color: "#0d2a4a" }}>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 20 }}>🧊 Build in 3D!</div>
        <div style={{ fontSize: 12, fontWeight: 800, marginTop: 3 }}>Drag to spin • pinch to zoom • tap a block to stack one on top</div>
      </div>
      <div ref={mount} style={{ flex: 1, touchAction: "none" }} />
      <div style={{ padding: "8px 10px calc(12px + env(safe-area-inset-bottom,0px))", background: "rgba(13,42,74,.9)" }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "4px 2px", scrollbarWidth: "none" }}>
          <button onClick={() => setErase((v) => !v)} style={{ flexShrink: 0, height: 46, padding: "0 12px", borderRadius: 12, fontSize: 20, cursor: "pointer", border: `2px solid ${erase ? "#fca5a5" : "rgba(255,255,255,.2)"}`, background: erase ? "rgba(239,68,68,.3)" : "rgba(255,255,255,.08)" }}>🧨</button>
          {COLORS.map((c, i) => (
            <button key={c.name} onClick={() => { setSel(i); setErase(false); }} title={c.name}
              style={{ flexShrink: 0, width: 46, height: 46, borderRadius: 12, cursor: "pointer", background: `#${c.hex.toString(16).padStart(6, "0")}`, border: `3px solid ${sel === i && !erase ? "#fff" : "rgba(255,255,255,.25)"}`, boxShadow: sel === i && !erase ? "0 0 12px rgba(255,255,255,.6)" : "none" }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={() => clearRef.current()} style={{ flex: 1, padding: 11, borderRadius: 12, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.1)", color: "#fff", fontFamily: "'Fredoka One',cursive", fontSize: 13, cursor: "pointer" }}>🧺 Reset</button>
          <a href="/" style={{ flex: 1, padding: 11, borderRadius: 12, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.1)", color: "#fff", fontFamily: "'Fredoka One',cursive", fontSize: 13, textAlign: "center", textDecoration: "none" }}>← Back to app</a>
        </div>
        <div style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.45)", marginTop: 7 }}>Prototype — true 3D. Heavier on the battery than the isometric one.</div>
      </div>
    </div>
  );
}
