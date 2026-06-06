import { useEffect, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { ModelViewer } from "./ModelViewer";
import { useViewportStore } from "@/stores/viewportStore";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

function SceneActions() {
  const { gl, scene, camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    useViewportStore.getState().setActions({
      resetView: () => {
        camera.position.set(80, 60, 80);
        camera.lookAt(0, 0, 0);
        controlsRef.current?.reset();
      },
      fitModel: () => {
        const box = new THREE.Box3().setFromObject(scene);
        if (box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const distance = maxDim * 2.5;
        camera.position.set(
          center.x + distance * 0.7,
          center.y + distance * 0.5,
          center.z + distance * 0.7
        );
        camera.lookAt(center);
        controlsRef.current?.target.copy(center);
        controlsRef.current?.update();
      },
      screenshot: () => {
        gl.render(scene, camera);
        const dataUrl = gl.domElement.toDataURL("image/png");
        const link = document.createElement("a");
        link.download = "cad-model.png";
        link.href = dataUrl;
        link.click();
      },
      setViewAngle: (direction) => {
        const box = new THREE.Box3().setFromObject(scene);
        const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
        const size = box.isEmpty() ? new THREE.Vector3(100, 100, 100) : box.getSize(new THREE.Vector3());
        const dist = Math.max(size.x, size.y, size.z) * 2;

        const positions: Record<string, [number, number, number]> = {
          front: [0, 0, dist],
          back: [0, 0, -dist],
          left: [-dist, 0, 0],
          right: [dist, 0, 0],
          top: [0, dist, 0.01],
          bottom: [0, -dist, 0.01],
          iso: [dist * 0.7, dist * 0.5, dist * 0.7],
        };

        const [x, y, z] = positions[direction] ?? positions.iso!;
        camera.position.set(center.x + x, center.y + y, center.z + z);
        camera.lookAt(center);
        controlsRef.current?.target.copy(center);
        controlsRef.current?.update();
      },
    });
  }, [gl, scene, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.05}
      minDistance={20}
      maxDistance={500}
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
