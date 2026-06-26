import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const MIN_DIMENSION = 1e-6;
const MIN_CAMERA_DISTANCE = 1e-5;

export function safeMaxDimension(size: THREE.Vector3) {
  const maxDim = Math.max(size.x, size.y, size.z);
  return Number.isFinite(maxDim) && maxDim > 0 ? maxDim : 100;
}

export function fitDistance(camera: THREE.Camera, maxDim: number) {
  const safeDim = Math.max(maxDim, MIN_DIMENSION);
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const perspective = camera as THREE.PerspectiveCamera;
    const fov = THREE.MathUtils.degToRad(perspective.fov);
    return Math.max(safeDim / (2 * Math.tan(fov / 2)) * 1.7, MIN_CAMERA_DISTANCE);
  }
  return Math.max(safeDim * 2.5, MIN_CAMERA_DISTANCE);
}

export function configureCameraClip(
  camera: THREE.Camera,
  maxDim: number,
  distance: number
) {
  if (!(camera as THREE.PerspectiveCamera).isPerspectiveCamera) return;
  const perspective = camera as THREE.PerspectiveCamera;
  const safeDim = Math.max(maxDim, MIN_DIMENSION);

  perspective.near = Math.max(Math.min(safeDim, distance) / 10000, 1e-7);
  perspective.far = Math.max(safeDim * 100, distance * 20, 1000);
  perspective.updateProjectionMatrix();
}

export function configureOrbitBounds(
  controls: OrbitControlsImpl | undefined | null,
  maxDim: number
) {
  if (!controls) return;
  const safeDim = Math.max(maxDim, MIN_DIMENSION);

  controls.minDistance = Math.max(safeDim * 0.001, 1e-7);
  controls.maxDistance = Math.max(safeDim * 100, 1000);
}

export function frameCamera(
  camera: THREE.Camera,
  controls: OrbitControlsImpl | undefined | null,
  center: THREE.Vector3,
  size: THREE.Vector3,
  direction: THREE.Vector3
) {
  const maxDim = safeMaxDimension(size);
  const distance = fitDistance(camera, maxDim);
  const offset = direction.clone().normalize().multiplyScalar(distance);

  camera.position.copy(center).add(offset);
  configureCameraClip(camera, maxDim, distance);
  camera.lookAt(center);
  configureOrbitBounds(controls, maxDim);
  if (controls) {
    controls.target.copy(center);
    controls.update();
  }
}
