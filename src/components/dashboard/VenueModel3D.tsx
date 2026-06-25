"use client";

import { useEffect, useRef, useState } from "react";
import type * as THREE_NS from "three";
import { Loader2, Box, Eye, Orbit, ArrowUp, Maximize } from "lucide-react";
import type { EditorZone, EditorSeat } from "@/components/dashboard/MapEditor";

type View = "top" | "iso" | "stage" | "crowd" | "orbit";

/** Modelo 3D WebGL real del recinto (three.js, carga diferida). Múltiples vistas de cámara. */
export function VenueModel3D({ widthM, heightM, wallHeight, zones, seats, columns }: {
  widthM: number; heightM: number; wallHeight: number; zones: EditorZone[]; seats: EditorSeat[]; columns: number;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const setViewRef = useRef<(v: View) => void>(() => {});
  const [view, setView] = useState<View>("iso");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let renderer: THREE_NS.WebGLRenderer | null = null;
    let controls: { update: () => void; dispose: () => void; enabled: boolean } | null = null;

    (async () => {
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
        if (disposed || !mountRef.current) return;
        const mount = mountRef.current;
        const W = Math.max(2, widthM), L = Math.max(2, heightM), H = Math.max(2, wallHeight || 4);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#0b0b12");
        scene.fog = new THREE.Fog("#0b0b12", L * 1.2, L * 3.2);

        const w = mount.clientWidth, h = 460;
        const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000);
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        mount.appendChild(renderer.domElement);

        // Luces (iluminación realista básica + sombras).
        scene.add(new THREE.AmbientLight("#8888aa", 0.6));
        const key = new THREE.DirectionalLight("#ffffff", 1.4);
        key.position.set(W * 0.4, H * 4, L * 0.3); key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024); key.shadow.camera.near = 1; key.shadow.camera.far = H * 10;
        const d = Math.max(W, L); const sc = key.shadow.camera as THREE_NS.OrthographicCamera;
        sc.left = -d; sc.right = d; sc.top = d; sc.bottom = -d;
        scene.add(key);
        const fill = new THREE.PointLight("#a855f7", 0.5, L * 2); fill.position.set(-W / 3, H, -L / 3); scene.add(fill);

        const cx = (x: number) => x - W / 2, cz = (y: number) => y - L / 2;

        // Piso (PBR).
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ color: "#15151f", roughness: 0.95, metalness: 0.05 }));
        floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
        const grid = new THREE.GridHelper(Math.max(W, L), Math.max(W, L), "#2a2a40", "#1c1c2a"); scene.add(grid);

        // Muros perimetrales.
        const wallMat = new THREE.MeshStandardMaterial({ color: "#23233a", roughness: 0.8, transparent: true, opacity: 0.55 });
        const t = 0.25;
        const mkWall = (ww: number, hh: number, dd: number, px: number, py: number, pz: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, dd), wallMat); m.position.set(px, py, pz); m.castShadow = true; scene.add(m); };
        mkWall(W, H, t, 0, H / 2, -L / 2); mkWall(W, H, t, 0, H / 2, L / 2);
        mkWall(t, H, L, -W / 2, H / 2, 0); mkWall(t, H, L, W / 2, H / 2, 0);

        // Escenario (de la zona "Escenario").
        const centroid = (pts: [number, number][]) => pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length] as [number, number], [0, 0] as [number, number]);
        const bbox = (pts: [number, number][]) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys), cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2 }; };
        const stageZone = zones.find((z) => z.name.toLowerCase().includes("escenario"));
        let stageCenter = { x: 0, z: -L / 2 + 2 };
        if (stageZone?.points?.length) {
          const b = bbox(stageZone.points); const sh = 1.0;
          const stage = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1, b.w), sh, Math.max(1, b.d)), new THREE.MeshStandardMaterial({ color: "#d6219b", roughness: 0.5, metalness: 0.2, emissive: "#3a0a2a", emissiveIntensity: 0.4 }));
          stage.position.set(cx(b.cx), sh / 2, cz(b.cy)); stage.castShadow = true; stage.receiveShadow = true; scene.add(stage);
          stageCenter = { x: cx(b.cx), z: cz(b.cy) };
        }

        // Zonas especiales (ga) como losas de color.
        for (const z of zones) {
          if (z.kind === "seated" || z.name.toLowerCase().includes("escenario") || !z.points?.length) continue;
          const b = bbox(z.points);
          const slab = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.5, b.w), 0.15, Math.max(0.5, b.d)), new THREE.MeshStandardMaterial({ color: z.color, roughness: 0.7, transparent: true, opacity: 0.7 }));
          slab.position.set(cx(b.cx), 0.08, cz(b.cy)); slab.receiveShadow = true; scene.add(slab);
        }

        // Columnas (rejilla interior, evitando el frente del escenario).
        if (columns > 0) {
          const colMat = new THREE.MeshStandardMaterial({ color: "#33334a", roughness: 0.7 });
          const cols = Math.min(columns, 24);
          const perSide = Math.ceil(Math.sqrt(cols));
          let placed = 0;
          for (let i = 0; i < perSide && placed < cols; i++) for (let j = 0; j < perSide && placed < cols; j++) {
            const px = -W / 2 + (W * (i + 1)) / (perSide + 1);
            const pz = -L / 2 + (L * (j + 1.4)) / (perSide + 1.5);
            const c = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, H, 12), colMat);
            c.position.set(px, H / 2, pz); c.castShadow = true; scene.add(c); placed++;
          }
        }

        // Sillas (InstancedMesh para rendimiento).
        if (seats.length) {
          const seatGeo = new THREE.BoxGeometry(0.42, 0.5, 0.42);
          const seatMat = new THREE.MeshStandardMaterial({ color: "#7c3aed", roughness: 0.6 });
          const inst = new THREE.InstancedMesh(seatGeo, seatMat, seats.length);
          inst.castShadow = true; inst.receiveShadow = true;
          const dummy = new THREE.Object3D();
          seats.forEach((s, i) => { dummy.position.set(cx(s.x), 0.25, cz(s.y)); dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix); });
          inst.instanceMatrix.needsUpdate = true; scene.add(inst);
        }

        controls = new OrbitControls(camera, renderer.domElement) as unknown as typeof controls;
        if (controls) { (controls as unknown as { target: THREE_NS.Vector3 }).target.set(0, 0, 0); }

        const applyView = (v: View) => {
          if (!controls) return;
          const diag = Math.max(W, L);
          controls.enabled = v === "orbit";
          const t2 = (controls as unknown as { target: THREE_NS.Vector3 }).target;
          if (v === "top") { camera.position.set(0.01, diag * 1.6, 0); t2.set(0, 0, 0); }
          else if (v === "iso") { camera.position.set(diag * 0.9, diag * 0.9, diag * 0.9); t2.set(0, 0, 0); }
          else if (v === "stage") { camera.position.set(stageCenter.x, H * 0.6, stageCenter.z + 1.5); t2.set(0, 1, L / 2); }
          else if (v === "crowd") { camera.position.set(0, H * 0.7, L / 2 - 1); t2.set(stageCenter.x, 1, stageCenter.z); }
          else { camera.position.set(diag * 0.8, diag * 0.7, diag * 0.8); t2.set(0, 0, 0); }
          camera.lookAt(t2); controls.update();
        };
        setViewRef.current = applyView;
        applyView("iso");

        const onResize = () => { if (!renderer || !mount) return; const nw = mount.clientWidth; renderer.setSize(nw, h); camera.aspect = nw / h; camera.updateProjectionMatrix(); };
        window.addEventListener("resize", onResize);

        const loop = () => { if (disposed) return; controls?.update(); renderer!.render(scene, camera); raf = requestAnimationFrame(loop); };
        loop();
        setLoading(false);

        return () => { window.removeEventListener("resize", onResize); };
      } catch (e) { setErr((e as Error).message); setLoading(false); }
    })();

    return () => {
      disposed = true; cancelAnimationFrame(raf);
      controls?.dispose?.();
      if (renderer) { renderer.dispose(); renderer.domElement.remove(); }
    };
  }, [widthM, heightM, wallHeight, zones, seats, columns]);

  const VIEWS: { v: View; label: string; icon: typeof Box }[] = [
    { v: "top", label: "Cenital", icon: ArrowUp }, { v: "iso", label: "Isométrica", icon: Box },
    { v: "stage", label: "Escenario→Público", icon: Eye }, { v: "crowd", label: "Público→Escenario", icon: Eye },
    { v: "orbit", label: "Órbita", icon: Orbit },
  ];

  return (
    <div className="glass rounded-2xl p-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><Maximize className="h-3.5 w-3.5 text-fuchsia" /> Modelo 3D</div>
        <div className="flex flex-wrap gap-1">
          {VIEWS.map((vv) => (
            <button key={vv.v} onClick={() => { setView(vv.v); setViewRef.current(vv.v); }}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition ${view === vv.v ? "brand-gradient text-ink" : "border border-line text-muted hover:text-fg"}`}>
              <vv.icon className="h-3 w-3" /> {vv.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={mountRef} className="relative w-full overflow-hidden rounded-xl bg-[#0b0b12]" style={{ height: 460 }}>
        {loading && <div className="absolute inset-0 grid place-items-center text-muted"><Loader2 className="h-6 w-6 animate-spin" /></div>}
        {err && <div className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-fuchsia">No se pudo cargar el 3D: {err}</div>}
      </div>
      <p className="mt-2 text-[11px] text-muted">Modelo WebGL real. La vista “Órbita” permite rotar/zoom con el mouse.</p>
    </div>
  );
}
