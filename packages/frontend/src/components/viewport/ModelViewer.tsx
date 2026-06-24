import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useViewportStore } from "@/stores/viewportStore";
import { useParameterStore } from "@/stores/parameterStore";
import { loadStepFromUrl, type StepLoadResult } from "@/services/stepLoader";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const MODEL_MATERIAL_PROPS = {
  color: "#5C7C5E",
  roughness: 0.35,
  metalness: 0.1,
};

export function ModelViewer() {
  const modelUrl = useViewportStore((s) => s.modelUrl);
  const modelFormat = useViewportStore((s) => s.modelFormat);
  const previewModelId = useViewportStore((s) => s.previewModelId);

  if (modelUrl) {
    if (modelFormat === "step") {
      return <StepModel url={modelUrl} />;
    }
    return <LoadedModel url={modelUrl} />;
  }

  if (previewModelId) {
    return <PreviewModel modelId={previewModelId} />;
  }

  return <DefaultCube />;
}

function PreviewModel({ modelId }: { modelId: string }) {
  const parameters = useParameterStore((s) => s.parameters);

  const paramValues = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of parameters) {
      if (typeof p.current_value === "number") {
        map[p.name] = p.current_value;
      }
    }
    return map;
  }, [parameters]);

  switch (modelId) {
    case "1":
      return <BoxPreview params={paramValues} />;
    case "2":
      return <BracketPreview params={paramValues} />;
    case "3":
      return <GearPreview params={paramValues} />;
    case "4":
      return <EnclosurePreview params={paramValues} />;
    default:
      return <DefaultCube />;
  }
}

function BoxPreview({ params }: { params: Record<string, number> }) {
  const w = params["width"] ?? 50;
  const h = params["height"] ?? 30;
  const d = params["depth"] ?? 40;
  const fillet = params["fillet"] ?? 3;

  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    const hw = w / 2, hd = d / 2;
    const r = Math.min(fillet, hw, hd);

    shape.moveTo(-hw + r, -hd);
    shape.lineTo(hw - r, -hd);
    shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
    shape.lineTo(hw, hd - r);
    shape.quadraticCurveTo(hw, hd, hw - r, hd);
    shape.lineTo(-hw + r, hd);
    shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
    shape.lineTo(-hw, -hd + r);
    shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

    const extrudeSettings = { depth: h, bevelEnabled: false };
    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
  }, [w, h, d, fillet]);

  return (
    <mesh geometry={geometry} position={[0, h / 2, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
      <meshStandardMaterial {...MODEL_MATERIAL_PROPS} />
    </mesh>
  );
}

function BracketPreview({ params }: { params: Record<string, number> }) {
  const length = params["length"] ?? 80;
  const width = params["width"] ?? 40;
  const thickness = params["thickness"] ?? 5;
  const holeDiam = params["hole_diameter"] ?? 8;
  const bendHeight = params["bend_height"] ?? 30;

  const baseGeo = useMemo(() => new THREE.BoxGeometry(length, thickness, width), [length, thickness, width]);
  const wallGeo = useMemo(() => new THREE.BoxGeometry(thickness, bendHeight, width), [thickness, bendHeight, width]);

  return (
    <group position={[0, thickness / 2, 0]}>
      {/* Base plate */}
      <mesh geometry={baseGeo} castShadow>
        <meshStandardMaterial {...MODEL_MATERIAL_PROPS} />
      </mesh>

      {/* Vertical wall */}
      <mesh geometry={wallGeo} position={[-length / 2 + thickness / 2, bendHeight / 2, 0]} castShadow>
        <meshStandardMaterial {...MODEL_MATERIAL_PROPS} />
      </mesh>

      {/* Holes */}
      {([[-1, -1], [-1, 1], [1, -1], [1, 1]] as const).map(([sx, sz], i) => (
        <mesh
          key={i}
          position={[sx * (length / 2 - 10), thickness / 2 + 0.1, sz * (width / 2 - 8)]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[holeDiam / 2 - 1, holeDiam / 2, 24]} />
          <meshStandardMaterial color="#2D3B2D" />
        </mesh>
      ))}
    </group>
  );
}

function GearPreview({ params }: { params: Record<string, number> }) {
  const numTeeth = params["num_teeth"] ?? 20;
  const module_ = params["module"] ?? 2.5;
  const thickness = params["thickness"] ?? 10;
  const boreDiam = params["bore_diameter"] ?? 12;

  const geometry = useMemo(() => {
    const pitchRadius = (numTeeth * module_) / 2;
    const outerRadius = pitchRadius + module_;
    const innerRadius = pitchRadius - module_;

    const shape = new THREE.Shape();
    const toothAngle = (2 * Math.PI) / numTeeth;

    for (let i = 0; i < numTeeth; i++) {
      const angle = i * toothAngle;
      const tipStart = angle + toothAngle * 0.15;
      const tipEnd = angle + toothAngle * 0.45;
      const rootStart = angle + toothAngle * 0.55;
      const rootEnd = angle + toothAngle * 0.95;

      if (i === 0) {
        shape.moveTo(
          Math.cos(angle) * innerRadius,
          Math.sin(angle) * innerRadius
        );
      }

      shape.lineTo(Math.cos(tipStart) * outerRadius, Math.sin(tipStart) * outerRadius);
      shape.lineTo(Math.cos(tipEnd) * outerRadius, Math.sin(tipEnd) * outerRadius);
      shape.lineTo(Math.cos(rootStart) * innerRadius, Math.sin(rootStart) * innerRadius);
      shape.lineTo(Math.cos(rootEnd) * innerRadius, Math.sin(rootEnd) * innerRadius);
    }
    shape.closePath();

    const bore = new THREE.Path();
    bore.absellipse(0, 0, boreDiam / 2, boreDiam / 2, 0, Math.PI * 2, false, 0);
    shape.holes.push(bore);

    return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  }, [numTeeth, module_, thickness, boreDiam]);

  return (
    <mesh geometry={geometry} position={[0, thickness / 2, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
      <meshStandardMaterial {...MODEL_MATERIAL_PROPS} />
    </mesh>
  );
}

function EnclosurePreview({ params }: { params: Record<string, number> }) {
  const width = params["width"] ?? 100;
  const depth = params["depth"] ?? 60;
  const height = params["height"] ?? 30;
  const wallT = params["wall_thickness"] ?? 2.5;
  const cornerR = params["corner_radius"] ?? 4;

  const outerGeo = useMemo(() => {
    const shape = new THREE.Shape();
    const hw = width / 2, hd = depth / 2;
    const r = Math.min(cornerR, hw, hd);

    shape.moveTo(-hw + r, -hd);
    shape.lineTo(hw - r, -hd);
    shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
    shape.lineTo(hw, hd - r);
    shape.quadraticCurveTo(hw, hd, hw - r, hd);
    shape.lineTo(-hw + r, hd);
    shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
    shape.lineTo(-hw, -hd + r);
    shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

    const ihw = hw - wallT, ihd = hd - wallT;
    const ir = Math.max(0, r - wallT);
    const hole = new THREE.Path();
    hole.moveTo(-ihw + ir, -ihd);
    hole.lineTo(ihw - ir, -ihd);
    hole.quadraticCurveTo(ihw, -ihd, ihw, -ihd + ir);
    hole.lineTo(ihw, ihd - ir);
    hole.quadraticCurveTo(ihw, ihd, ihw - ir, ihd);
    hole.lineTo(-ihw + ir, ihd);
    hole.quadraticCurveTo(-ihw, ihd, -ihw, ihd - ir);
    hole.lineTo(-ihw, -ihd + ir);
    hole.quadraticCurveTo(-ihw, -ihd, -ihw + ir, -ihd);
    shape.holes.push(hole);

    return new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  }, [width, depth, height, wallT, cornerR]);

  return (
    <mesh geometry={outerGeo} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
      <meshStandardMaterial {...MODEL_MATERIAL_PROPS} />
    </mesh>
  );
}

interface HoveredFaceInfo {
  faceId: number;
  surfaceId: number;
  meshIndex: number;
  triangles: number[];
}

function buildHighlightGeometry(
  srcGeo: THREE.BufferGeometry,
  triangles: number[]
): THREE.BufferGeometry {
  const index = srcGeo.index;
  const position = srcGeo.getAttribute("position");
  if (!index || !position) return new THREE.BufferGeometry();

  const srcNormal = srcGeo.getAttribute("normal");
  const positions: number[] = [];
  const normals: number[] = [];

  for (const tri of triangles) {
    const base = tri * 3;
    for (let j = 0; j < 3; j++) {
      const vi = index.getX(base + j);
      positions.push(position.getX(vi), position.getY(vi), position.getZ(vi));
      if (srcNormal) {
        normals.push(srcNormal.getX(vi), srcNormal.getY(vi), srcNormal.getZ(vi));
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length > 0) {
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  } else {
    geo.computeVertexNormals();
  }
  return geo;
}

function buildEdgeGeometry(
  srcGeo: THREE.BufferGeometry,
  triangles: number[]
): THREE.BufferGeometry {
  const index = srcGeo.index;
  const position = srcGeo.getAttribute("position");
  if (!index || !position) return new THREE.BufferGeometry();

  const edgeMap = new Map<string, number>();

  for (const tri of triangles) {
    const base = tri * 3;
    const a = index.getX(base);
    const b = index.getX(base + 1);
    const c = index.getX(base + 2);

    for (const [v0, v1] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      const key = v0 < v1 ? `${v0}_${v1}` : `${v1}_${v0}`;
      edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
    }
  }

  const edges: number[] = [];
  for (const [key, count] of edgeMap) {
    if (count === 1) {
      const [v0, v1] = key.split("_").map(Number) as [number, number];
      edges.push(
        position.getX(v0), position.getY(v0), position.getZ(v0),
        position.getX(v1), position.getY(v1), position.getZ(v1)
      );
    }
  }

  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute("position", new THREE.Float32BufferAttribute(edges, 3));
  return edgeGeo;
}

function StepModel({ url }: { url: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const controls = useThree((s) => (s as unknown as { controls?: OrbitControlsImpl }).controls);
  const [stepData, setStepData] = useState<StepLoadResult | null>(null);
  const [error, setError] = useState(false);
  const [hovered, setHovered] = useState<HoveredFaceInfo | null>(null);
  const [hoverPoint, setHoverPoint] = useState<THREE.Vector3 | null>(null);
  const setHoveredFaceStore = useViewportStore((s) => s.setHoveredFace);

  useEffect(() => {
    let cancelled = false;
    setStepData(null);
    setError(false);
    setHovered(null);
    setHoverPoint(null);
    setHoveredFaceStore(null);

    loadStepFromUrl(url)
      .then((data) => {
        if (cancelled) return;
        if (data.geometries.length === 0) {
          useViewportStore.getState().setError("STEP file parsed but contains no geometry");
          setError(true);
        } else {
          setStepData(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          useViewportStore.getState().setError("STEP file could not be rendered");
          setError(true);
        }
      });

    return () => { cancelled = true; };
  }, [url, setHoveredFaceStore]);

  useEffect(() => {
    if (!stepData || !groupRef.current) return;

    const box = new THREE.Box3();
    for (const geo of stepData.geometries) {
      if (!geo.boundingBox) geo.computeBoundingBox();
      if (geo.boundingBox && !geo.boundingBox.isEmpty()) {
        box.union(geo.boundingBox);
      }
    }
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxDim) || maxDim <= 0) return;

    groupRef.current.position.set(-center.x, -center.y, -center.z);

    const distance = Math.max(maxDim * 2.5, 20);
    (camera as THREE.PerspectiveCamera).position.set(
      distance * 0.7,
      distance * 0.5,
      distance * 0.7
    );
    (camera as THREE.PerspectiveCamera).near = Math.max(distance / 1000, 0.1);
    (camera as THREE.PerspectiveCamera).far = distance * 20;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
    controls?.target.set(0, 0, 0);
    controls?.update();
  }, [stepData, camera, controls]);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>, meshIndex: number) => {
    e.stopPropagation();
    if (!stepData || e.faceIndex == null) return;

    const triMap = stepData.triangleFaceMap[meshIndex];
    if (!triMap) return;

    const faceId = triMap[e.faceIndex];
    if (faceId === undefined || faceId < 0) return;

    const surfaceMap = stepData.triangleSurfaceMap[meshIndex];
    const groups = stepData.surfaceGroups[meshIndex];
    const surfaceId = surfaceMap?.[e.faceIndex] ?? -1;
    const group = surfaceId >= 0 ? groups?.[surfaceId] : undefined;
    const triangles = group?.triangles ?? Array.from(triMap.keys()).filter((t) => triMap[t] === faceId);
    if (triangles.length === 0) return;
    const hoverSurfaceId = group?.id ?? -1;

    if (faceId !== hovered?.faceId || hoverSurfaceId !== hovered?.surfaceId) {
      setHovered({ faceId, surfaceId: hoverSurfaceId, meshIndex, triangles });
      setHoverPoint(e.point.clone());
      setHoveredFaceStore(faceId);
    } else {
      setHoverPoint(e.point.clone());
    }
  }, [stepData, hovered, setHoveredFaceStore]);

  const handlePointerLeave = useCallback(() => {
    setHovered(null);
    setHoverPoint(null);
    setHoveredFaceStore(null);
  }, [setHoveredFaceStore]);

  const highlightGeo = useMemo(() => {
    if (!hovered || !stepData) return null;
    const geo = stepData.geometries[hovered.meshIndex];
    if (!geo) return null;
    return buildHighlightGeometry(geo, hovered.triangles);
  }, [hovered, stepData]);

  const edgeGeo = useMemo(() => {
    if (!hovered || !stepData) return null;
    const geo = stepData.geometries[hovered.meshIndex];
    if (!geo) return null;
    return buildEdgeGeometry(geo, hovered.triangles);
  }, [hovered, stepData]);

  if (error) return <DefaultCube />;
  if (!stepData) return null;

  return (
    <group ref={groupRef} onPointerLeave={handlePointerLeave}>
      {stepData.geometries.map((geo, i) => (
        <mesh
          key={i}
          geometry={geo}
          castShadow
          receiveShadow
          onPointerMove={(e) => handlePointerMove(e, i)}
        >
          <meshStandardMaterial
            color={stepData.materials[i]?.color ?? "#5C7C5E"}
            roughness={0.35}
            metalness={0.1}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {highlightGeo && (
        <mesh geometry={highlightGeo} renderOrder={1} raycast={() => null}>
          <meshStandardMaterial
            color="#8BB88E"
            emissive="#3A5C3A"
            emissiveIntensity={0.4}
            roughness={0.3}
            metalness={0.1}
            side={THREE.DoubleSide}
            transparent
            opacity={0.6}
            depthTest={false}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      )}

      {edgeGeo && (
        <lineSegments geometry={edgeGeo} renderOrder={2} raycast={() => null}>
          <lineBasicMaterial color="#FFFFFF" linewidth={2} depthTest={false} />
        </lineSegments>
      )}

      {hovered && hoverPoint && (
        <Html position={hoverPoint} style={{ pointerEvents: "none" }}>
          <div className="bg-white/90 backdrop-blur-sm rounded-md shadow-md px-2.5 py-1.5 text-xs border border-border whitespace-nowrap">
            <span className="font-medium text-text-primary">Face #{hovered.faceId}</span>
            <span className="text-text-secondary ml-2">{hovered.triangles.length} tris</span>
          </div>
        </Html>
      )}
    </group>
  );
}

function LoadedModel({ url }: { url: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  let gltf: { scene: THREE.Group } | null = null;
  try {
    gltf = useLoader(GLTFLoader, url);
  } catch {
    return <DefaultCube />;
  }

  useEffect(() => {
    if (!gltf || !groupRef.current) return;

    const box = new THREE.Box3().setFromObject(gltf.scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    gltf.scene.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 2.5;
    (camera as THREE.PerspectiveCamera).position.set(
      distance * 0.7,
      distance * 0.5,
      distance * 0.7
    );
    camera.lookAt(0, 0, 0);
  }, [gltf, camera]);

  if (!gltf) return null;

  return (
    <group ref={groupRef}>
      <primitive object={gltf.scene}>
        <meshStandardMaterial {...MODEL_MATERIAL_PROPS} />
      </primitive>
    </group>
  );
}

function DefaultCube() {
  return (
    <mesh position={[0, 15, 0]} castShadow>
      <boxGeometry args={[30, 30, 30]} />
      <meshStandardMaterial
        color="#5C7C5E"
        roughness={0.4}
        metalness={0.1}
        transparent
        opacity={0.3}
      />
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(30, 30, 30)]} />
        <lineBasicMaterial color="#5C7C5E" opacity={0.5} transparent />
      </lineSegments>
    </mesh>
  );
}
