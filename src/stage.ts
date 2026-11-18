import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BOOT_HEIGHT, createSkier, SHIN, SIDES, THIGH, type Point } from './skier';

import { presets, type Pose } from './presets';

export const views = [
  { id: 'front', label: '正前', azimuth: 0, elevation: 12 },
  { id: 'three-quarter', label: '左前', azimuth: 42, elevation: 16 },
  { id: 'side', label: '左侧', azimuth: 90, elevation: 8 },
  { id: 'rear', label: '右后', azimuth: -140, elevation: 17 },
  { id: 'back', label: '正后', azimuth: 180, elevation: 12 },
  { id: 'right-side', label: '右侧', azimuth: -90, elevation: 8 },
] as const;

const markers = [
  { bone: 'Hips', label: '髋部' },
  { bone: 'LeftHand', label: '左手' },
  { bone: 'RightHand', label: '右手' },
  { bone: 'LeftFoot', label: '左脚' },
  { bone: 'RightFoot', label: '右脚' },
] as const;

const DOWN = new T.Vector3(0, -1, 0);
const FORWARD = new T.Vector3(0, 0, 1);
const RAD = Math.PI / 180;
const HANDLE_OFFSETS = [[0, 0], [24, 0], [-24, 0], [0, -24], [0, 24], [24, -24], [-24, -24], [24, 24], [-24, 24], [0, -48], [0, 48]];
const clamp = T.MathUtils.clamp;

function reachLeg(hip: T.Vector3, foot: T.Vector3, forwards: T.Vector3) {
  const delta = foot.clone().sub(hip);
  const length = delta.length();
  const direction = delta.divideScalar(length);
  const pole = forwards.clone().addScaledVector(direction, -forwards.dot(direction)).normalize();
  const along = (THIGH ** 2 + length ** 2 - SHIN ** 2) / (2 * length);
  return hip.clone().addScaledVector(direction, along).addScaledVector(pole, Math.sqrt(Math.max(0, THIGH ** 2 - along ** 2)));
}

function orient(from: T.Vector3, to: T.Vector3, parentWorld = new T.Quaternion()) {
  return parentWorld.invert().multiply(new T.Quaternion().setFromUnitVectors(DOWN, to.clone().sub(from).normalize()));
}

function fits(pose: Pose) {
  return pose.feet.every((foot, index) => {
    const hip = new T.Vector3(pose.hips[0] + (index ? -0.115 : 0.115), pose.hips[1] - 0.02, pose.hips[2]);
    return hip.distanceTo(new T.Vector3(...foot)) < THIGH + SHIN - 0.01;
  });
}

export function createStage(viewport: HTMLElement, onPose: () => void, onCamera: () => void) {
  const scene = new T.Scene();
  scene.background = new T.Color(0xd9e7ee);
  scene.fog = new T.FogExp2(0xd9e7ee, 0.095);
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  const pixelRatio = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  viewport.prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '双板滑雪白模三维视图');

  const camera = new T.PerspectiveCamera(33, 1, 0.05, 80);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.84, 0.08);
  controls.enablePan = false;
  controls.minDistance = 2.65;
  controls.maxDistance = 7;
  controls.minPolarAngle = 0.29;
  controls.maxPolarAngle = Math.PI / 2 - 0.034;
  controls.rotateSpeed = 0.78;
  controls.zoomSpeed = 0.75;
  controls.mouseButtons.RIGHT = T.MOUSE.ROTATE;

  scene.add(new T.HemisphereLight(0xf4faff, 0x9f9fa4, 1.42));
  const key = new T.DirectionalLight(0xfff7e8, 2.35);
  key.position.set(-3, 6, 4);
  scene.add(key);
  const rim = new T.DirectionalLight(0xdce9ff, 1.18);
  rim.position.set(4, 3, -3);
  scene.add(rim);

  const snow = new T.Mesh(new T.PlaneGeometry(150, 150), new T.MeshBasicMaterial({ color: 0xe0eaf0 }));
  snow.rotation.x = -Math.PI / 2;
  scene.add(snow);
  const guides = new T.GridHelper(16, 32, 0x8ea7b6, 0xaabec9);
  guides.position.y = 0.002;
  guides.material.transparent = true;
  guides.material.opacity = 0.28;
  scene.add(guides);

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 96;
  const context = shadowCanvas.getContext('2d')!;
  const gradient = context.createRadialGradient(48, 48, 5, 48, 48, 48);
  gradient.addColorStop(0, 'rgba(53,78,96,.29)');
  gradient.addColorStop(0.53, 'rgba(53,78,96,.13)');
  gradient.addColorStop(1, 'rgba(53,78,96,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 96, 96);
  const shadowMaterial = new T.MeshBasicMaterial({ map: new T.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false });
  const shadows = SIDES.map(() => {
    const shadow = new T.Mesh(new T.PlaneGeometry(0.57, 2.55), shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow);
    return shadow;
  });

  const { rig, bone, skis, poles } = createSkier(scene);
  let pose = structuredClone(presets[1]);
  let locked = false;
  let currentView: string = '';
  let drag: { pointer: number; button: HTMLButtonElement; plane: T.Plane; offset: T.Vector3; marker: typeof markers[number] } | undefined;
  const markerButtons = markers.map((marker) => {
    const line = document.createElement('span');
    line.className = 'joint-leader';
    line.setAttribute('aria-hidden', 'true');
    viewport.append(line);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'joint';
    button.setAttribute('aria-label', '拖动' + marker.label);
    button.title = marker.label;
    button.tabIndex = -1;
    button.addEventListener('pointerdown', (event) => beginDrag(event, marker, button));
    button.addEventListener('pointermove', moveDrag);
    button.addEventListener('lostpointercapture', finishDrag);
    viewport.append(button);
    return { button, line };
  });

  function paint() {
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
    const rect = viewport.getBoundingClientRect();
    const placed: [number, number][] = [];
    for (const [index, marker] of markers.entries()) {
      const { button, line } = markerButtons[index];
      const position = bone(marker.bone).getWorldPosition(new T.Vector3()).project(camera);
      const visible = !locked && Math.abs(position.x) < 1 && Math.abs(position.y) < 1;
      button.hidden = !visible;
      line.hidden = true;
      if (!visible) continue;
      const x = (position.x * 0.5 + 0.5) * rect.width;
      const y = (0.5 - position.y * 0.5) * rect.height;
      const [dx, dy] = HANDLE_OFFSETS.find(([dx, dy]) => {
        const px = x + dx;
        const py = y + dy;
        return px > 12 && px < rect.width - 12 && py > 12 && py < rect.height - 12
          && placed.every(([bx, by]) => Math.hypot(px - bx, py - by) >= 23);
      }) ?? HANDLE_OFFSETS[0];
      placed.push([x + dx, y + dy]);
      button.style.left = `${x + dx}px`;
      button.style.top = `${y + dy}px`;
      line.hidden = dx === 0 && dy === 0;
      line.style.left = `${x}px`;
      line.style.top = `${y}px`;
      line.style.width = `${Math.hypot(dx, dy)}px`;
      line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    }
  }

  function applyPose() {
    bone('Hips').position.set(...pose.hips);
    rig.root.updateMatrixWorld(true);
    rig.setBoneRotationEuler('Spine', new T.Euler(pose.lean * RAD, pose.twist * RAD, pose.bank * RAD, 'YXZ'));

    for (const [index, side] of SIDES.entries()) {
      const foot = new T.Vector3(...pose.feet[index]);
      const hip = bone(side + 'UpLeg').getWorldPosition(new T.Vector3());
      const forwards = FORWARD.clone().applyAxisAngle(T.Object3D.DEFAULT_UP, pose.yaw[index] * RAD);
      const knee = reachLeg(hip, foot, forwards);
      const thighRotation = orient(hip, knee);
      rig.setBoneRotation(side + 'UpLeg', thighRotation);
      rig.setBoneRotation(side + 'Leg', orient(knee, foot, thighRotation.clone()));
      const ski = skis[index];
      ski.rotation.set(0, pose.yaw[index] * RAD, pose.edge[index] * RAD, 'YXZ');
      ski.position.copy(foot).sub(new T.Vector3(0, BOOT_HEIGHT, 0).applyQuaternion(ski.quaternion));
      shadows[index].position.set(foot.x + 0.055, 0.004, foot.z);
      shadows[index].rotation.set(-Math.PI / 2, 0, pose.yaw[index] * RAD);
      rig.setBoneRotationEuler(side + 'Shoulder', new T.Euler());
      rig.setBoneRotationEuler(side + 'Arm', new T.Euler(-0.25, 0, index ? -0.37 : 0.37));
      rig.setBoneRotationEuler(side + 'ForeArm', new T.Euler(-0.73, 0, 0));
      const handName = side + 'Hand';
      rig.solveIK(handName, new T.Vector3(...pose.hands[index]));
      const wrist = bone(handName).getWorldPosition(new T.Vector3());
      const sign = index ? -1 : 1;
      const sweep = pose.poleSweep[index] * RAD;
      const direction = new T.Vector3(sign * .11, -Math.cos(sweep), -Math.sin(sweep)).normalize();
      // Keep the shaft length fixed and rotate it away from the floor when
      // the wrist drops. For a planted pose, put the tip near the snow.
      const verticalLimit = clamp((wrist.y - .04) / 1.04, 0.25, 1);
      if (pose.plant[index] || -direction.y > verticalLimit) {
        const horizontal = Math.sqrt(1 - verticalLimit ** 2);
        direction.setY(0).normalize().multiplyScalar(horizontal).setY(-verticalLimit);
      }
      const forearm = bone(side + 'ForeArm').getWorldQuaternion(new T.Quaternion());
      rig.setBoneRotation(handName, orient(wrist, wrist.clone().add(direction), forearm));
      poles[index].position.copy(wrist).addScaledVector(direction, .032);
      poles[index].quaternion.setFromUnitVectors(DOWN, direction);
    }
    paint();
  }

  function resize() {
    const { clientWidth, clientHeight } = viewport;
    if (!clientWidth || !clientHeight) return;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight);
    paint();
  }

  function pointOnPlane(event: PointerEvent, plane: T.Plane) {
    const rect = viewport.getBoundingClientRect();
    const pointer = new T.Vector2(
      (event.clientX - rect.left) * 2 / rect.width - 1,
      1 - (event.clientY - rect.top) * 2 / rect.height,
    );
    const ray = new T.Raycaster();
    ray.setFromCamera(pointer, camera);
    return ray.ray.intersectPlane(plane, new T.Vector3());
  }

  function beginDrag(event: PointerEvent, marker: typeof markers[number], button: HTMLButtonElement) {
    if (locked || drag || event.button !== 0) return;
    event.preventDefault();
    const world = bone(marker.bone).getWorldPosition(new T.Vector3());
    const normal = marker.bone.endsWith('Foot') ? new T.Vector3(0, 1, 0) : camera.getWorldDirection(new T.Vector3());
    const plane = new T.Plane().setFromNormalAndCoplanarPoint(normal, world);
    const point = pointOnPlane(event, plane);
    if (!point) return;
    drag = { pointer: event.pointerId, button, plane, offset: world.sub(point), marker };
    button.setPointerCapture(event.pointerId);
    button.classList.add('dragging');
  }

  function finishDrag() {
    drag?.button.classList.remove('dragging');
    drag = undefined;
  }

  function moveDrag(event: PointerEvent) {
    if (locked || !drag || drag.pointer !== event.pointerId) return;
    const point = pointOnPlane(event, drag.plane)?.add(drag.offset);
    if (!point) return;
    const candidate = structuredClone(pose);
    const name = drag.marker.bone;
    const index = name.startsWith('Left') ? 0 : 1;
    if (name === 'Hips') {
      candidate.hips = [clamp(point.x, -0.31, 0.31), clamp(point.y, 0.57, 1.33), clamp(point.z, -0.46, 0.3)];
    } else if (name.endsWith('Foot')) {
      const x = index === 0 ? clamp(point.x, 0.08, 0.42) : clamp(point.x, -0.42, -0.08);
      candidate.feet[index] = [x, pose.feet[index][1], clamp(point.z, -0.39, 0.39)];
    } else {
      candidate.hands[index] = [clamp(point.x, -0.85, 0.85), clamp(point.y, 0.45, 1.58), clamp(point.z, -0.32, 0.73)];
    }
    if (!fits(candidate)) return;
    pose = candidate;
    applyPose();
    onPose();
  }

  controls.addEventListener('change', () => {
    currentView = '';
    paint();
    onCamera();
  });
  new ResizeObserver(resize).observe(viewport);

  return {
    resize,
    get pose() { return pose; },
    setPreset(index: number) {
      if (locked) return;
      pose = structuredClone(presets[index]);
      applyPose();
      onPose();
    },
    setAngle(part: 'lean' | 'twist' | 'bank', angle: number) {
      if (locked) return;
      pose[part] = angle;
      applyPose();
      onPose();
    },
    setLocked(value: boolean) {
      locked = value;
      if (drag?.button.hasPointerCapture(drag.pointer)) drag.button.releasePointerCapture(drag.pointer);
      finishDrag();
      paint();
    },
    setView(id: string) {
      const view = views.find((option) => option.id === id);
      if (!view) return;
      const distance = 4.35;
      camera.position.copy(controls.target).add(new T.Vector3().setFromSphericalCoords(
        distance, (90 - view.elevation) * RAD, view.azimuth * RAD,
      ));
      controls.update();
      currentView = id;
      paint();
      onCamera();
    },
    getCamera() {
      const azimuth = Math.round(controls.getAzimuthalAngle() / RAD);
      const elevation = Math.round(90 - controls.getPolarAngle() / RAD);
      return { id: currentView, azimuth, elevation, distance: controls.getDistance() };
    },
    exportPng(): Promise<Blob> {
      const { clientWidth, clientHeight } = viewport;
      const scale = 1800 / Math.max(clientWidth, clientHeight);
      guides.visible = false;
      renderer.setPixelRatio(1);
      renderer.setSize(Math.round(clientWidth * scale), Math.round(clientHeight * scale), false);
      renderer.render(scene, camera);
      return new Promise<Blob>((resolve, reject) => {
        renderer.domElement.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('无法导出 PNG'));
        }, 'image/png');
      }).finally(() => {
        guides.visible = true;
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(clientWidth, clientHeight, false);
        paint();
      });
    },
  };
}
