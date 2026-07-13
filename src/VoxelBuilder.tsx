// Reusable true-3D voxel builder (Three.js). Renders the 3D canvas + a color
// palette + eraser. Parent supplies the theme, a save key, and gets a live
// block count for goal tracking. Lazy-loaded, so Three.js never bloats the
// main bundle.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type VoxColor = { name: string; hex: number };
const BASE = 8;
const k = (x: number, y: number, z: number) => `${x},${y},${z}`;

export default function VoxelBuilder({
  colors, sky = 0x87b7e8, baseHex = 0x6abe30, saveKey, onCount,
}: {
  colors: VoxColor[]; sky?: number; baseHex?: number; saveKey: string; onCount?: (n: number) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const colorRef = useRef(colors[0].hex);
  const eraseRef = useRef(false);
  const countRef = useRef(onCount);
  const [sel, setSel] = useState(0);
  const [erase, setErase] = useState(false);
  const clearRef = useRef<() => void>(() => {});

  useEffect(() => { colorRef.current = colors[sel].hex; }, [sel, colors]);
  useEffect(() => { eraseRef.current = erase; }, [erase]);
  useEffect(() => { countRef.current = onCount; }, [onCount]);

  useEffect(() => {
    const el = mount.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(sky);
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
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.minDistance = 5;
    controls.maxDistance = 40;
    controls.target.set(0.5, 1, 0.5);

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 });
    const matCache = new Map<number, THREE.Material>();
    const mat = (hex: number) => {
      let m = matCache.get(hex);
      if (!m) { m = new THREE.MeshLambertMaterial({ color: hex }); matCache.set(hex, m); }
      return m;
    };
    const blocks = new Map<string, THREE.Mesh>();
    const report = () => countRef.current?.(blocks.size);

    const add = (x: number, y: number, z: number, color: number) => {
      const key = k(x, y, z);
      if (blocks.has(key)) return;
      const mesh = new THREE.Mesh(geo, mat(color));
      mesh.position.set(x, y, z);
      mesh.add(new THREE.LineSegments(edgeGeo, edgeMat));
      scene.add(mesh);
      blocks.set(key, mesh);
    };
    const del = (key: string) => { const m = blocks.get(key); if (m) { scene.remove(m); blocks.delete(key); } };
    const buildBase = () => { const o = Math.floor(BASE / 2); for (let x = -o; x < BASE - o; x++) for (let z = -o; z < BASE - o; z++) add(x, 0, z, baseHex); };
    const persist = () => { try { localStorage.setItem(saveKey, JSON.stringify([...blocks.entries()].map(([key, m]) => ({ p: key, c: (m.material as any).color.getHex() })))); } catch {} };

    let loaded = false;
    try {
      const raw = JSON.parse(localStorage.getItem(saveKey) || "null");
      if (Array.isArray(raw) && raw.length) { raw.forEach((b: any) => { const [x, y, z] = b.p.split(",").map(Number); add(x, y, z, b.c); }); loaded = true; }
    } catch {}
    if (!loaded) buildBase();
    report();

    clearRef.current = () => { [...blocks.keys()].forEach(del); buildBase(); persist(); report(); };

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let dx = 0, dy = 0, dt = 0;
    const onDown = (e: PointerEvent) => { dx = e.clientX; dy = e.clientY; dt = Date.now(); };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - dx, e.clientY - dy) > 8 || Date.now() - dt > 350) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects([...blocks.values()], false);
      if (!hits.length) return;
      const p = hits[0].object.position;
      if (eraseRef.current) { if (blocks.size > 1) del(k(p.x, p.y, p.z)); }
      else { const n = hits[0].face!.normal; const nx = Math.round(p.x + n.x), ny = Math.round(p.y + n.y), nz = Math.round(p.z + n.z); if (ny >= 0) add(nx, ny, nz, colorRef.current); }
      persist(); report();
      try { navigator.vibrate?.(8); } catch {}
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    const onResize = () => { camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(el.clientWidth, el.clientHeight); };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf); window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose(); renderer.dispose();
      try { el.removeChild(renderer.domElement); } catch {}
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div ref={mount} style={{ flex: 1, minHeight: 0, touchAction: "none" }} />
      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "8px 10px", background: "rgba(13,42,74,.9)", scrollbarWidth: "none" }}>
        <button onClick={() => setErase((v) => !v)} title="Eraser" style={{ flexShrink: 0, height: 46, padding: "0 12px", borderRadius: 12, fontSize: 20, cursor: "pointer", border: `2px solid ${erase ? "#fca5a5" : "rgba(255,255,255,.2)"}`, background: erase ? "rgba(239,68,68,.3)" : "rgba(255,255,255,.08)" }}>🧨</button>
        {colors.map((c, i) => (
          <button key={c.name} onClick={() => { setSel(i); setErase(false); }} title={c.name}
            style={{ flexShrink: 0, width: 46, height: 46, borderRadius: 12, cursor: "pointer", background: `#${c.hex.toString(16).padStart(6, "0")}`, border: `3px solid ${sel === i && !erase ? "#fff" : "rgba(255,255,255,.25)"}`, boxShadow: sel === i && !erase ? "0 0 12px rgba(255,255,255,.6)" : "none" }} />
        ))}
        <button onClick={() => clearRef.current()} title="Reset" style={{ flexShrink: 0, height: 46, padding: "0 12px", borderRadius: 12, fontSize: 18, cursor: "pointer", border: "2px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.08)" }}>🧺</button>
      </div>
    </div>
  );
}
