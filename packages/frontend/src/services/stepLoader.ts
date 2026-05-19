import * as THREE from "three";

let occtInitPromise: Promise<OcctModule> | null = null;

interface OcctMesh {
  name: string;
  color?: [number, number, number];
  brep_faces?: { first: number; last: number; color?: [number, number, number] }[];
  attributes: {
    position: { array: number[] };
    normal?: { array: number[] };
  };
  index: { array: number[] };
}

interface OcctResult {
  success: boolean;
  root: { meshes: number[] };
  meshes: OcctMesh[];
}

interface OcctModule {
  ReadStepFile: (
    buffer: Uint8Array,
    params: object | null
  ) => OcctResult;
}

function initOcct(): Promise<OcctModule> {
  if (occtInitPromise) return occtInitPromise;

  occtInitPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/occt-import-js.js";
    script.onload = () => {
      const factory = (window as unknown as Record<string, unknown>)[
        "occtimportjs"
      ] as (options: { locateFile: (name: string) => string }) => Promise<OcctModule>;

      if (!factory) {
        reject(new Error("occt-import-js failed to load"));
        return;
      }

      factory({
        locateFile: (name: string) => `/${name}`,
      }).then(resolve).catch(reject);
    };
    script.onerror = () => reject(new Error("Failed to load occt-import-js script"));
    document.head.appendChild(script);
  });

  return occtInitPromise;
}

export interface BRepFace {
  id: number;
  meshIndex: number;
}

export interface StepLoadResult {
  geometries: THREE.BufferGeometry[];
  materials: THREE.MeshStandardMaterial[];
  faces: BRepFace[];
  triangleFaceMap: Int32Array[];
}

export async function loadStepFile(buffer: ArrayBuffer): Promise<StepLoadResult> {
  const occt = await initOcct();

  const result = occt.ReadStepFile(new Uint8Array(buffer), {
    linearDeflection: 0.1,
    angularDeflection: 0.5,
  });

  if (!result.success) {
    throw new Error("Failed to parse STEP file");
  }

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];
  const faces: BRepFace[] = [];
  const triangleFaceMap: Int32Array[] = [];
  let globalFaceId = 0;

  for (const mesh of result.meshes) {
    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(mesh.attributes.position.array);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    if (mesh.attributes.normal) {
      const normals = new Float32Array(mesh.attributes.normal.array);
      geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    } else {
      geometry.computeVertexNormals();
    }

    const indices = new Uint32Array(mesh.index.array);
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    const totalTriangles = Math.floor(indices.length / 3);
    const triMap = new Int32Array(totalTriangles).fill(-1);

    const meshIndex = geometries.length;
    if (mesh.brep_faces && mesh.brep_faces.length > 0) {
      const bfs = mesh.brep_faces;
      const totalCoverage = bfs.reduce((sum, f) => sum + (f.last - f.first + 1), 0);

      const isIndexPositions = totalCoverage === indices.length;

      for (let fi = 0; fi < bfs.length; fi++) {
        const bf = bfs[fi]!;
        const faceId = globalFaceId++;
        faces.push({ id: faceId, meshIndex });

        if (isIndexPositions) {
          const startTri = Math.floor(bf.first / 3);
          const endTri = Math.floor(bf.last / 3);
          for (let t = startTri; t <= endTri; t++) {
            if (t < totalTriangles) triMap[t] = faceId;
          }
        } else {
          const startTri = bf.first;
          const endTri = bf.last;
          for (let t = startTri; t <= endTri; t++) {
            if (t < totalTriangles) triMap[t] = faceId;
          }
        }
      }
    }

    triangleFaceMap.push(triMap);
    geometry.computeBoundingBox();
    geometries.push(geometry);

    const color = mesh.color
      ? new THREE.Color(mesh.color[0] / 255, mesh.color[1] / 255, mesh.color[2] / 255)
      : new THREE.Color(0x5c7c5e);

    materials.push(
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.1,
        side: THREE.DoubleSide,
      })
    );
  }

  return { geometries, materials, faces, triangleFaceMap };
}

export async function loadStepFromUrl(url: string): Promise<StepLoadResult> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch STEP file: ${response.status}`);
  const buffer = await response.arrayBuffer();
  return loadStepFile(buffer);
}
