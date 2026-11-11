import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { SpaceLoungeParticipant } from '../../types/space-lounge';
import { getSpaceAvatarPose, participantToWorldPosition } from './spaceSceneMath';

const MAX_RENDERED_PARTICIPANTS = 24;
const FRAME_INTERVAL_MS = 1000 / 30;
const ACTION_TITLES: Record<string, string> = {
  DANCE: 'رقص',
  FLIP: 'شقلبة',
  RUN: 'جري',
  CHAOS: 'فوضى',
  ZERO_GRAVITY: 'انعدام الجاذبية',
};
const ENTRY_POSITION = new THREE.Vector3(-4.45, 0, -5.5);
const EXIT_POSITION = new THREE.Vector3(4.45, 0, -5.5);

interface ThreeSpaceSceneProps {
  participants: SpaceLoungeParticipant[];
  sponsorLabel?: string;
  onFallback: () => void;
}

interface AvatarRig {
  root: THREE.Group;
  body: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  groundShadow: THREE.Mesh;
  materials: THREE.Material[];
  lastX: number;
  lastZ: number;
  seed: number;
}

function colorFromId(id: string): number {
  let hash = 17;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const palette = [0x57ded5, 0x9b8cff, 0xff8bb7, 0xffc765, 0x83d8ff];
  return palette[hash % palette.length];
}

function makeMesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, y = 0, x = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function addPortal(scene: THREE.Scene, x: number, z: number, color: number, materials: THREE.Material[]): void {
  const portal = new THREE.Group();
  portal.position.set(x, 0, z);
  scene.add(portal);
  const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.65, roughness: 0.45 });
  materials.push(glow);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.94, 0.105, 7, 24), glow);
  arch.position.y = 1.22;
  portal.add(arch);
  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(0.8, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
  );
  materials.push(inner.material);
  inner.position.set(0, 1.2, -0.035);
  portal.add(inner);
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x263a56, roughness: 0.7 });
  materials.push(postMaterial);
  const postGeometry = new THREE.CylinderGeometry(0.14, 0.18, 1.2, 6);
  makeMesh(postGeometry, postMaterial, portal, 0.58, -0.96, 0);
  makeMesh(postGeometry, postMaterial, portal, 0.58, 0.96, 0);
  const stepMaterial = new THREE.MeshStandardMaterial({ color: 0x1c3149, roughness: 0.8 });
  materials.push(stepMaterial);
  makeMesh(new THREE.BoxGeometry(2.6, 0.12, 0.7), stepMaterial, portal, 0.07, 0, 0.4);
}

function addSeat(scene: THREE.Scene, x: number, z: number, materials: THREE.Material[]): void {
  const seat = new THREE.Group();
  seat.position.set(x, 0, z);
  scene.add(seat);
  const cushion = new THREE.MeshStandardMaterial({ color: 0x45517a, roughness: 0.82 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x6f7bad, roughness: 0.72 });
  const legs = new THREE.MeshStandardMaterial({ color: 0x26324d, roughness: 0.9 });
  materials.push(cushion, accent, legs);
  makeMesh(new THREE.BoxGeometry(1.42, 0.24, 0.72), cushion, seat, 0.58);
  makeMesh(new THREE.BoxGeometry(1.42, 0.72, 0.2), accent, seat, 0.96, 0, -0.25);
  const legGeometry = new THREE.CylinderGeometry(0.055, 0.055, 0.52, 5);
  for (const legX of [-0.54, 0.54]) {
    makeMesh(legGeometry, legs, seat, 0.25, legX, 0.22);
    makeMesh(legGeometry, legs, seat, 0.25, legX, -0.22);
  }
}

function createAvatarRig(
  participant: SpaceLoungeParticipant,
  scene: THREE.Scene,
  geometries: Map<string, THREE.BufferGeometry>,
  materials: THREE.Material[],
  labels: Map<string, HTMLDivElement>,
): AvatarRig {
  const root = new THREE.Group();
  root.userData.participantId = participant.participantId;

  const accentColor = colorFromId(participant.participantId);
  const suitMaterial = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.66, metalness: 0.08 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xf2f5f6, roughness: 0.78 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x15394d, emissive: 0x0b2638, roughness: 0.28, metalness: 0.12 });
  const packMaterial = new THREE.MeshStandardMaterial({ color: 0x34475d, roughness: 0.82 });
  const badgeMaterial = new THREE.MeshStandardMaterial({ color: 0xffcf6b, emissive: 0x5a3912, emissiveIntensity: 0.28, roughness: 0.5 });
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x030814, transparent: true, opacity: 0.32, depthWrite: false });
  const avatarMaterials = [suitMaterial, trimMaterial, glassMaterial, packMaterial, badgeMaterial, shadowMaterial];
  materials.push(...avatarMaterials);

  const capsule = geometries.get('capsule')!;
  const helmet = geometries.get('helmet')!;
  const visor = geometries.get('visor')!;
  const box = geometries.get('box')!;
  const sphere = geometries.get('smallSphere')!;
  const rootWorld = participantToWorldPosition(participant);
  root.position.set(rootWorld.x, 0, rootWorld.z);
  scene.add(root);

  const shadow = new THREE.Mesh(geometries.get('shadow')!, shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  root.add(shadow);

  const body = new THREE.Group();
  root.add(body);
  makeMesh(box, packMaterial, body, 1.14, 0, -0.34).scale.set(0.58, 0.82, 0.52);
  makeMesh(capsule, suitMaterial, body, 1.08).scale.set(0.78, 0.76, 0.68);
  makeMesh(helmet, trimMaterial, body, 1.92).scale.set(0.72, 0.72, 0.72);
  makeMesh(visor, glassMaterial, body, 1.94, 0, 0.345).scale.set(1, 0.9, 0.55);
  makeMesh(box, badgeMaterial, body, 1.15, 0, 0.455).scale.set(0.3, 0.21, 0.12);
  makeMesh(sphere, badgeMaterial, body, 1.15, 0, 0.55).scale.set(0.08, 0.08, 0.08);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.38, 1.38, 0);
  body.add(leftArm);
  const rightArm = new THREE.Group();
  rightArm.position.set(0.38, 1.38, 0);
  body.add(rightArm);
  makeMesh(capsule, trimMaterial, leftArm, -0.28).scale.set(0.3, 0.56, 0.34);
  makeMesh(capsule, trimMaterial, rightArm, -0.28).scale.set(0.3, 0.56, 0.34);
  makeMesh(sphere, suitMaterial, leftArm, -0.54).scale.set(0.28, 0.24, 0.28);
  makeMesh(sphere, suitMaterial, rightArm, -0.54).scale.set(0.28, 0.24, 0.28);

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.18, 0.55, 0);
  body.add(leftLeg);
  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.18, 0.55, 0);
  body.add(rightLeg);
  makeMesh(capsule, trimMaterial, leftLeg, -0.18).scale.set(0.31, 0.52, 0.34);
  makeMesh(capsule, trimMaterial, rightLeg, -0.18).scale.set(0.31, 0.52, 0.34);
  makeMesh(box, packMaterial, leftLeg, -0.42, 0, 0.07).scale.set(0.42, 0.2, 0.58);
  makeMesh(box, packMaterial, rightLeg, -0.42, 0, 0.07).scale.set(0.42, 0.2, 0.58);

  const label = labels.get(participant.participantId);
  if (label) label.dataset.ready = 'true';
  return { root, body, leftArm, rightArm, leftLeg, rightLeg, groundShadow: shadow, materials: avatarMaterials, lastX: rootWorld.x, lastZ: rootWorld.z, seed: participant.participantId.length * 0.73 };
}

function buildScene(scene: THREE.Scene, materials: THREE.Material[]): Map<string, THREE.BufferGeometry> {
  scene.background = new THREE.Color(0x080d1c);
  scene.fog = new THREE.Fog(0x080d1c, 19, 36);
  scene.add(new THREE.HemisphereLight(0xd8eeff, 0x101a2e, 1.8));
  const keyLight = new THREE.DirectionalLight(0xfff3d8, 2.2);
  keyLight.position.set(-4, 11, 8);
  scene.add(keyLight);
  const fillLight = new THREE.PointLight(0x48d9db, 22, 20, 2);
  fillLight.position.set(5, 6, -2);
  scene.add(fillLight);

  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x101a2a, roughness: 0.9, metalness: 0.05 });
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x111a31, roughness: 0.92, side: THREE.DoubleSide });
  const stageMaterial = new THREE.MeshStandardMaterial({ color: 0x203d54, roughness: 0.7, metalness: 0.13 });
  const ringMaterial = new THREE.MeshStandardMaterial({ color: 0x50d9d3, emissive: 0x167b80, emissiveIntensity: 0.55, roughness: 0.42, metalness: 0.18 });
  const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x17263d, emissive: 0x071221, roughness: 0.78 });
  const moonMaterial = new THREE.MeshStandardMaterial({ color: 0x786fb0, emissive: 0x191741, roughness: 0.8 });
  materials.push(floorMaterial, wallMaterial, stageMaterial, ringMaterial, panelMaterial, moonMaterial);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 19), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.19;
  scene.add(floor);
  const grid = new THREE.GridHelper(12.5, 20, 0x356070, 0x203448);
  grid.position.y = -0.17;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.18;
  scene.add(grid);

  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(13, 7.4), wallMaterial);
  backWall.position.set(0, 3.55, -8.8);
  scene.add(backWall);
  const wallPlaque = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.76, 0.18), panelMaterial);
  wallPlaque.position.set(0, 5.55, -8.52);
  scene.add(wallPlaque);

  const platform = new THREE.Mesh(new THREE.CylinderGeometry(3.25, 3.5, 0.2, 40), stageMaterial);
  platform.position.set(0, -0.04, 1.1);
  scene.add(platform);
  const ringGeometry = new THREE.TorusGeometry(2.78, 0.035, 4, 48);
  const stageRing = new THREE.Mesh(ringGeometry, ringMaterial);
  stageRing.rotation.x = Math.PI / 2;
  stageRing.position.set(0, 0.08, 1.1);
  scene.add(stageRing);
  const centerRing = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.022, 4, 40), ringMaterial);
  centerRing.rotation.x = Math.PI / 2;
  centerRing.position.set(0, 0.085, 1.1);
  scene.add(centerRing);

  addPortal(scene, ENTRY_POSITION.x, ENTRY_POSITION.z, 0x58ddd5, materials);
  addPortal(scene, EXIT_POSITION.x, EXIT_POSITION.z, 0xff95bd, materials);
  addSeat(scene, -4.1, -0.7, materials);
  addSeat(scene, 4.1, -0.7, materials);
  addSeat(scene, -3.8, 3.6, materials);
  addSeat(scene, 3.8, 3.6, materials);

  const planet = new THREE.Mesh(new THREE.SphereGeometry(0.82, 14, 10), moonMaterial);
  planet.position.set(-4.55, 4.3, -8.3);
  planet.scale.set(1.25, 0.9, 0.55);
  scene.add(planet);
  const satelliteMaterial = new THREE.MeshStandardMaterial({ color: 0x69d5cf, emissive: 0x155e62, emissiveIntensity: 0.4, roughness: 0.6 });
  materials.push(satelliteMaterial);
  const satellite = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), satelliteMaterial);
  satellite.position.set(4.4, 5.2, -8.2);
  scene.add(satellite);

  const starPositions: number[] = [];
  let random = 812;
  const nextRandom = () => { random = (random * 16807) % 2147483647; return random / 2147483647; };
  for (let i = 0; i < 72; i++) starPositions.push((nextRandom() - 0.5) * 12, 1.8 + nextRandom() * 5.5, -8.68);
  const starsGeometry = new THREE.BufferGeometry();
  starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: 0xbde9f8, size: 0.045, sizeAttenuation: true, transparent: true, opacity: 0.72 }));
  scene.add(stars);

  const shadowGeometry = new THREE.CircleGeometry(0.48, 12);
  const geometries = new Map<string, THREE.BufferGeometry>([
    ['capsule', new THREE.CapsuleGeometry(0.22, 0.42, 3, 6)],
    ['helmet', new THREE.SphereGeometry(0.46, 10, 8)],
    ['visor', new THREE.SphereGeometry(0.34, 10, 8)],
    ['box', new THREE.BoxGeometry(0.5, 0.5, 0.5)],
    ['smallSphere', new THREE.SphereGeometry(0.16, 8, 6)],
    ['shadow', shadowGeometry],
  ]);
  return geometries;
}

function disposeScene(scene: THREE.Scene, geometries: Map<string, THREE.BufferGeometry>, materials: THREE.Material[]): void {
  const ownedGeometries = new Set(geometries.values());
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  const uniqueMaterials = new Set<THREE.Material>(materials);
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
      if (!ownedGeometries.has(object.geometry) && !disposedGeometries.has(object.geometry)) {
        disposedGeometries.add(object.geometry);
        object.geometry.dispose();
      }
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      objectMaterials.forEach((material) => uniqueMaterials.add(material));
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  uniqueMaterials.forEach((material) => material.dispose());
}

export default function ThreeSpaceScene({ participants, sponsorLabel, onFallback }: ThreeSpaceSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef(new Map<string, HTMLDivElement>());
  const portalsRef = useRef<{ entry: HTMLDivElement | null; exit: HTMLDivElement | null }>({ entry: null, exit: null });
  const participantsRef = useRef(participants);
  const fallbackRef = useRef(onFallback);

  participantsRef.current = participants;
  fallbackRef.current = onFallback;

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return undefined;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power', stencil: false, depth: true });
    } catch {
      fallbackRef.current();
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;

    const scene = new THREE.Scene();
    const materials: THREE.Material[] = [];
    const geometries = buildScene(scene, materials);
    const camera = new THREE.OrthographicCamera(-6, 6, 10, -10, 0.1, 60);
    camera.zoom = 1.18;
    const cameraOffset = new THREE.Vector3(0, 18, 16);
    const baseTarget = new THREE.Vector3(0, 0.5, 0);
    camera.position.copy(baseTarget).add(cameraOffset);
    camera.lookAt(baseTarget);

    const rigs = new Map<string, AvatarRig>();
    const projected = new THREE.Vector3();
    const cameraTarget = baseTarget.clone();
    let frameId = 0;
    let lastFrameAt = 0;
    let previousFrameAt = performance.now();
    let previousFocusId = '';
    let stopped = false;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const updateSize = () => {
      const width = Math.max(1, stage.clientWidth);
      const height = Math.max(1, stage.clientHeight);
      const aspect = width / height;
      const verticalSpan = aspect < 0.72 ? 22.5 : aspect > 1.45 ? 14.8 : 18.2;
      camera.left = -(verticalSpan * aspect) / 2;
      camera.right = (verticalSpan * aspect) / 2;
      camera.top = verticalSpan / 2;
      camera.bottom = -verticalSpan / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateSize) : null;
    if (resizeObserver) resizeObserver.observe(stage);
    else window.addEventListener('resize', updateSize);
    updateSize();

    const projectLabel = (element: HTMLDivElement | null, point: THREE.Vector3) => {
      if (!element) return;
      projected.copy(point).project(camera);
      const visible = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1.08 && Math.abs(projected.y) < 1.08;
      element.style.visibility = visible ? 'visible' : 'hidden';
      if (!visible) return;
      const x = (projected.x * 0.5 + 0.5) * stage.clientWidth;
      const y = (0.5 - projected.y * 0.5) * stage.clientHeight;
      element.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-100%)`;
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(frameId);
        lastFrameAt = 0;
      } else if (!stopped) {
        previousFrameAt = performance.now();
        frameId = requestAnimationFrame(renderFrame);
      }
    };

    const onContextLost = (event: Event) => {
      event.preventDefault();
      stopped = true;
      cancelAnimationFrame(frameId);
      fallbackRef.current();
    };

    const renderFrame = (timestamp: number) => {
      if (stopped || document.hidden) return;
      if (timestamp - lastFrameAt < FRAME_INTERVAL_MS) {
        frameId = requestAnimationFrame(renderFrame);
        return;
      }
      lastFrameAt = timestamp;
      const delta = Math.min(0.05, Math.max(0.001, (timestamp - previousFrameAt) / 1000));
      previousFrameAt = timestamp;
      const elapsed = timestamp / 1000;
      const currentParticipants = participantsRef.current.slice(0, MAX_RENDERED_PARTICIPANTS);
      const visibleIds = new Set(currentParticipants.map((participant) => participant.participantId));

      for (const [id, rig] of rigs) {
        if (!visibleIds.has(id)) {
          scene.remove(rig.root);
          rig.materials.forEach((material) => {
            material.dispose();
            const index = materials.indexOf(material);
            if (index >= 0) materials.splice(index, 1);
          });
          labelsRef.current.delete(id);
          rigs.delete(id);
        }
      }

      const activeActions = prefersReducedMotion ? [] : currentParticipants.filter((participant) => participant.action && (participant.actionUntil ?? Date.now() + 1) > Date.now());
      const activeActionParticipant = activeActions.length === 1 ? activeActions[0] : undefined;
      const focusId = activeActionParticipant?.participantId ?? '';
      const focusedRig = focusId ? rigs.get(focusId) : undefined;
      if (focusId !== previousFocusId) previousFocusId = focusId;
      const desiredTarget = focusedRig ? focusedRig.root.position.clone().setY(0.35) : baseTarget;
      cameraTarget.lerp(desiredTarget, 1 - Math.exp(-delta * 1.7));
      const targetZoom = focusedRig ? 1.3 : 1.18;
      camera.zoom += (targetZoom - camera.zoom) * (1 - Math.exp(-delta * 1.6));
      camera.position.copy(cameraTarget).add(cameraOffset);
      camera.lookAt(cameraTarget);
      camera.updateProjectionMatrix();

      for (const participant of currentParticipants) {
        let rig = rigs.get(participant.participantId);
        if (!rig) {
          rig = createAvatarRig(participant, scene, geometries, materials, labelsRef.current);
          rigs.set(participant.participantId, rig);
        }
        const position = participantToWorldPosition(participant);
        const targetX = position.x;
        const targetZ = position.z;
        const moving = Math.hypot(targetX - rig.root.position.x, targetZ - rig.root.position.z) > 0.06;
        const positionSmoothing = prefersReducedMotion ? 1 : 1 - Math.exp(-delta * (moving ? 7 : 3.6));
        rig.root.position.x += (targetX - rig.root.position.x) * positionSmoothing;
        rig.root.position.z += (targetZ - rig.root.position.z) * positionSmoothing;
        rig.lastX = targetX;
        rig.lastZ = targetZ;

        const active = Boolean(participant.action && (participant.actionUntil ?? Date.now() + 1) > Date.now());
        const pose = getSpaceAvatarPose(prefersReducedMotion || !active ? undefined : participant.action, prefersReducedMotion ? 0 : elapsed, rig.seed);
        const walkSwing = moving && !prefersReducedMotion ? Math.sin(elapsed * 9 + rig.seed) * 0.42 : 0;
        rig.root.position.y = pose.floatHeight + pose.bounce;
        rig.root.position.x += pose.jitterX;
        rig.body.rotation.z = pose.bodyRoll;
        rig.body.rotation.y = pose.spin;
        rig.leftArm.rotation.z = pose.armSwing + walkSwing;
        rig.rightArm.rotation.z = -pose.armSwing - walkSwing;
        rig.leftLeg.rotation.x = pose.legSwing + walkSwing;
        rig.rightLeg.rotation.x = -pose.legSwing - walkSwing;
        if (moving) rig.root.rotation.y = targetX >= rig.root.position.x ? 0.08 : Math.PI - 0.08;
        if (participant.isExiting) rig.root.scale.setScalar(Math.max(0.08, rig.root.scale.x - delta * 1.2));
        else rig.root.scale.setScalar(1);
        rig.groundShadow.scale.setScalar(Math.max(0.35, 1 - pose.floatHeight * 0.38));
        const nameplate = labelsRef.current.get(participant.participantId);
        projectLabel(nameplate ?? null, new THREE.Vector3(rig.root.position.x, rig.root.position.y + 2.45, rig.root.position.z));
      }

      const entryLabel = portalsRef.current.entry;
      const exitLabel = portalsRef.current.exit;
      projectLabel(entryLabel, new THREE.Vector3(ENTRY_POSITION.x, 2.35, ENTRY_POSITION.z));
      projectLabel(exitLabel, new THREE.Vector3(EXIT_POSITION.x, 2.35, EXIT_POSITION.z));
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(renderFrame);
    };

    canvas.addEventListener('webglcontextlost', onContextLost, false);
    document.addEventListener('visibilitychange', onVisibilityChange);
    frameId = requestAnimationFrame(renderFrame);

    return () => {
      stopped = true;
      cancelAnimationFrame(frameId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', updateSize);
      rigs.forEach((rig) => scene.remove(rig.root));
      disposeScene(scene, geometries, materials);
      renderer.dispose();
    };
  }, []);

  const participantsToRender = participants.slice(0, MAX_RENDERED_PARTICIPANTS);

  return (
    <section className="space-scene space-scene-webgl" aria-label="ساحة استراحة الفضاء ثلاثية الأبعاد">
    <div className="space-scene-stage" ref={stageRef}>
      <canvas ref={canvasRef} className="space-scene-canvas" aria-label="ساحة فضائية ثلاثية الأبعاد متحركة" />
      <div className="space-scene-hud" aria-hidden="true">
        <span className="space-scene-hud-kicker">قدها · الاستراحة المدارية</span>
        <span className="space-scene-hud-count">{participants.length} / {MAX_RENDERED_PARTICIPANTS}</span>
      </div>
      {sponsorLabel ? <div className="space-scene-sponsor">{sponsorLabel.slice(0, 56)}</div> : <div className="space-scene-sponsor">{participants.length ? 'الساحة مفتوحة' : 'استراحة الفضاء'}</div>}
      <div className="space-scene-portal-label space-scene-portal-entry" ref={(element) => { portalsRef.current.entry = element; }}>بوابة الدخول</div>
      <div className="space-scene-portal-label space-scene-portal-exit" ref={(element) => { portalsRef.current.exit = element; }}>باب الخروج</div>
      <div className="space-scene-labels" aria-live="polite">
        {participantsToRender.map((participant) => (
          <div
            key={participant.participantId}
            ref={(element) => {
              if (element) labelsRef.current.set(participant.participantId, element);
              else labelsRef.current.delete(participant.participantId);
            }}
            className="space-character-name"
            title={participant.displayName}
          >
            {participant.displayName.slice(0, 32)}
            {participant.action ? <span>{ACTION_TITLES[participant.action] || 'حركة فضائية'}</span> : null}
          </div>
        ))}
      </div>
      {participants.length === 0 ? <p className="space-scene-empty">تستعد الساحة لاستقبال روّادها</p> : null}
      <span className="space-scene-camera-cue" aria-hidden="true">كاميرا مدارية واسعة</span>
    </div>
    </section>
  );
}
