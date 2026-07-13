// Standalone true-3D voxel prototype at /?build3d — now just a thin frame
// around the reusable VoxelBuilder.
import VoxelBuilder from "./VoxelBuilder";

const COLORS = [
  { name: "Grass", hex: 0x6abe30 }, { name: "Dirt", hex: 0x8a5a2b }, { name: "Stone", hex: 0x9aa0a6 },
  { name: "Wood", hex: 0xb5834b }, { name: "Brick", hex: 0xc0392b }, { name: "Water", hex: 0x3aa0dd },
  { name: "Sand", hex: 0xe8d18a }, { name: "Snow", hex: 0xf4f7fb }, { name: "Gold", hex: 0xf4c430 }, { name: "Purple", hex: 0x8b5cf6 },
];

export default function Build3D() {
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "#87b7e8", fontFamily: "'Nunito',system-ui,sans-serif" }}>
      <div style={{ padding: "12px 14px 6px", textAlign: "center", color: "#0d2a4a" }}>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 20 }}>🧊 Build in 3D!</div>
        <div style={{ fontSize: 12, fontWeight: 800, marginTop: 3 }}>Drag to spin • pinch to zoom • tap a block to stack one on top</div>
      </div>
      <VoxelBuilder colors={COLORS} saveKey="toybox:build3d:v1" />
      <div style={{ padding: "6px 12px calc(12px + env(safe-area-inset-bottom,0px))", background: "rgba(13,42,74,.9)", textAlign: "center" }}>
        <a href="/" style={{ color: "#fff", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>← Back to app</a>
      </div>
    </div>
  );
}
