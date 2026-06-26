import { useCallback, useEffect, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { ModelViewer } from "./ModelViewer";
import { useViewportStore } from "@/stores/viewportStore";
import { frameCamera } from "@/utils/cameraFraming";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const VIEW_DIRECTIONS = {
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
  left: new THREE.Vector3(-1, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
  top: new THREE.Vector3(0, 1, 0.001),
  bottom: new THREE.Vector3(0, -1, 0.001),
  iso: new THREE.Vector3(0.7, 0.5, 0.7),
} as const;

function isBoundsExcluded(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData?.excludeFromBounds) return true;
    current = current.parent;
  }
  return false;
}

function getRenderableBounds(scene: THREE.Scene) {
  const box = new THREE.Box3();
  const objectBox = new THREE.Box3();
  scene.updateMatrixWorld(true);

  scene.traverse((object) => {
    if (!object.visible || isBoundsExcluded(object)) return;
    const mesh = object as THREE.Mesh;
    const geometry = mesh.geometry;
    if (!geometry) return;

    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return;

    objectBox.copy(geometry.boundingBox).applyMatrix4(object.matrixWorld);
    if (!objectBox.isEmpty()) box.union(objectBox);
  });

  return box;
}

function SceneActions() {
  const { gl, scene, camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);

  const frameScene = useCallback(
    (direction: keyof typeof VIEW_DIRECTIONS) => {
      const box = getRenderableBounds(scene);
      if (box.isEmpty()) {
        frameCamera(
          camera,
          controlsRef.current,
          new THREE.Vector3(),
          new THREE.Vector3(100, 100, 100),
          VIEW_DIRECTIONS[direction]
        );
        return;
      }

      frameCamera(
        camera,
        controlsRef.current,
        box.getCenter(new THREE.Vector3()),
        box.getSize(new THREE.Vector3()),
        VIEW_DIRECTIONS[direction]
      );
    },
    [camera, scene]
  );

  useEffect(() => {
    useViewportStore.getState().setActions({
      resetView: () => frameScene("iso"),
      fitModel: () => frameScene("iso"),
      screenshot: () => {
        gl.render(scene, camera);
        const dataUrl = gl.domElement.toDataURL("image/png");
        const link = document.createElement("a");
        link.download = "cad-model.png";
        link.href = dataUrl;
        link.click();
      },
      setViewAngle: (direction) => frameScene(direction),
    });
  }, [gl, scene, camera, frameScene]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.05}
      minDistance={1e-7}
      maxDistance={1e9}
    />
  );
}

export function Canvas3D() {
  return (
    <Canvas
      camera={{ position: [80, 60, 80], fov: 50 }}
      className="bg-cream"
      gl={{ preserveDrawingBuffer: true }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[10, 10, 5]} intensity={1.1} castShadow />
      <directionalLight position={[-5, 5, -5]} intensity={0.5} />

      <ModelViewer />

      <Grid
        userData={{ excludeFromBounds: true }}
        args={[200, 200]}
        cellSize={10}
        cellThickness={0.5}
        cellColor="#E5E0DB"
        sectionSize={50}
        sectionThickness={1}
        sectionColor="#C8C0B8"
        fadeDistance={400}
        fadeStrength={1}
        infiniteGrid
      />

      <SceneActions />
    </Canvas>
  );
}
