import * as THREE from "three";

let occtInitPromise: Promise<OcctModule> | null = null;
const SURFACE_CREASE_COS = Math.cos(THREE.MathUtils.degToRad(60));

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

export interface StepSurfaceGroup {
  id: number;
  faceId: number;
  triangles: number[];
}

export interface StepLoadResult {
  geometries: THREE.BufferGeometry[];
  materials: THREE.MeshStandardMaterial[];
  faces: BRepFace[];
  triangleFaceMap: Int32Array[];
  triangleSurfaceMap: Int32Array[];
  surfaceGroups: StepSurfaceGroup[][];
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
  const triangleSurfaceMap: Int32Array[] = [];
  const surfaceGroups: StepSurfaceGroup[][] = [];
  let globalFaceId = 0;

  for (const mesh of result.meshes) {
    const rawPositions = mesh.attributes.position?.array ?? [];
    const rawIndices = mesh.index?.array ?? [];
    if (rawPositions.length < 9 || rawIndices.length < 3) {
      continue;
    }
    if (!rawPositions.every(Number.isFinite) || !rawIndices.every(Number.isFinite)) {
      continue;
    }

    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(rawPositions);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    if (mesh.attributes.normal) {
      const normals = new Float32Array(mesh.attributes.normal.array);
      geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    } else {
      geometry.computeVertexNormals();
    }

    const indices = new Uint32Array(rawIndices);
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const boundingBox = geometry.boundingBox;
    if (!boundingBox || boundingBox.isEmpty()) {
      continue;
    }
    const bboxSize = boundingBox.getSize(new THREE.Vector3());
    const weldTolerance = Math.max(
      1e-5,
      Math.max(bboxSize.x, bboxSize.y, bboxSize.z) * 1e-7
    );
    const vertexKeys = new Array<string>(Math.floor(positions.length / 3));
    const getVertexKey = (vertexIndex: number) => {
      const cached = vertexKeys[vertexIndex];
      if (cached) return cached;

      const offset = vertexIndex * 3;
      const key = [
        Math.round(positions[offset]! / weldTolerance),
        Math.round(positions[offset + 1]! / weldTolerance),
        Math.round(positions[offset + 2]! / weldTolerance),
      ].join("_");
      vertexKeys[vertexIndex] = key;
      return key;
    };

    const totalTriangles = Math.floor(indices.length / 3);
    const triMap = new Int32Array(totalTriangles).fill(-1);

    const meshIndex = geometries.length;
    if (mesh.brep_faces && mesh.brep_faces.length > 0) {
      for (const bf of mesh.brep_faces) {
        const faceId = globalFaceId++;
        faces.push({ id: faceId, meshIndex });
        for (let t = bf.first; t <= bf.last; t++) {
          if (t >= 0 && t < totalTriangles) {
            triMap[t] = faceId;
          }
        }
      }
    }

    const edgeToTriangles = new Map<string, number[]>();
    const triangleEdges: string[][] = Array.from({ length: totalTriangles }, () => []);
    const triangleNormals = new Float32Array(totalTriangles * 3);
    const normalValid = new Uint8Array(totalTriangles);
    for (let t = 0; t < totalTriangles; t++) {
      const base = t * 3;
      const a = indices[base]!;
      const b = indices[base + 1]!;
      const c = indices[base + 2]!;
      const ak = getVertexKey(a);
      const bk = getVertexKey(b);
      const ck = getVertexKey(c);
      const ai = a * 3;
      const bi = b * 3;
      const ci = c * 3;
      const ax = positions[ai]!;
      const ay = positions[ai + 1]!;
      const az = positions[ai + 2]!;
      const bx = positions[bi]!;
      const by = positions[bi + 1]!;
      const bz = positions[bi + 2]!;
      const cx = positions[ci]!;
      const cy = positions[ci + 1]!;
      const cz = positions[ci + 2]!;
      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;
      const acx = cx - ax;
      const acy = cy - ay;
      const acz = cz - az;
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      const normalLen = Math.hypot(nx, ny, nz);
      if (normalLen > 0) {
        const ni = t * 3;
        triangleNormals[ni] = nx / normalLen;
        triangleNormals[ni + 1] = ny / normalLen;
        triangleNormals[ni + 2] = nz / normalLen;
        normalValid[t] = 1;
      }

      const edges = [
        ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`,
        bk < ck ? `${bk}|${ck}` : `${ck}|${bk}`,
        ck < ak ? `${ck}|${ak}` : `${ak}|${ck}`,
      ];
      triangleEdges[t] = edges;
      for (const edge of edges) {
        const list = edgeToTriangles.get(edge);
        if (list) {
          list.push(t);
        } else {
          edgeToTriangles.set(edge, [t]);
        }
      }
    }

    const surfaceMap = new Int32Array(totalTriangles).fill(-1);
    const groups: StepSurfaceGroup[] = [];
    const visited = new Uint8Array(totalTriangles);
    let surfaceId = 0;
    for (let start = 0; start < totalTriangles; start++) {
      const faceId = triMap[start]!;
      if (faceId < 0 || visited[start]) continue;

      const triangles: number[] = [];
      const stack = [start];
      visited[start] = 1;
      while (stack.length > 0) {
        const tri = stack.pop()!;
        surfaceMap[tri] = surfaceId;
        triangles.push(tri);

        const edges = triangleEdges[tri];
        if (!edges) continue;
        for (const edge of edges) {
          const neighbors = edgeToTriangles.get(edge);
          if (!neighbors) continue;
          for (const next of neighbors) {
            if (visited[next] || triMap[next] !== faceId) continue;

            if (normalValid[tri] && normalValid[next]) {
              const triNormal = tri * 3;
              const nextNormal = next * 3;
              const dot =
                triangleNormals[triNormal]! * triangleNormals[nextNormal]! +
                triangleNormals[triNormal + 1]! * triangleNormals[nextNormal + 1]! +
                triangleNormals[triNormal + 2]! * triangleNormals[nextNormal + 2]!;
              if (dot < SURFACE_CREASE_COS) continue;
            }

            visited[next] = 1;
            stack.push(next);
          }
        }
      }

      groups.push({ id: surfaceId, faceId, triangles });
      surfaceId += 1;
    }

    geometries.push(geometry);
    triangleFaceMap.push(triMap);
    triangleSurfaceMap.push(surfaceMap);
    surfaceGroups.push(groups);

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

  if (geometries.length === 0) {
    throw new Error("STEP file parsed but contains no renderable geometry");
  }

  return { geometries, materials, faces, triangleFaceMap, triangleSurfaceMap, surfaceGroups };
}

export async function loadStepFromUrl(url: string): Promise<StepLoadResult> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch STEP file: ${response.status}`);
  const buffer = await response.arrayBuffer();
  return loadStepFile(buffer);
}
