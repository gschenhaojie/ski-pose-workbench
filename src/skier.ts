import * as T from 'three';
import { RIG_PARENTS } from './vendor/poseify/rig/RigContract';
import { PosableSkeleton } from './vendor/poseify/posing/PosableSkeleton';
import { DEFAULT_LOAD_CONFIG } from './vendor/poseify/models/ModelLoadConfig';

export type Point = [number, number, number];
export const SIDES = ['Left', 'Right'] as const;
export const BOOT_HEIGHT = 0.15;
export const THIGH = 0.43;
export const SHIN = 0.41;

const white = new T.MeshStandardMaterial({ color: 0xd8d6d3, roughness: 0.66 });
const trim = new T.MeshStandardMaterial({ color: 0xc5cdd1, roughness: 0.56 });
const black = new T.MeshStandardMaterial({ color: 0x191a1c, roughness: 0.52 });
const cloth = new T.MeshStandardMaterial({ color: 0x202022, roughness: 0.87 });
const blue = new T.MeshStandardMaterial({ color: 0x04bfea, roughness: 0.43 });
const rubber = new T.MeshStandardMaterial({ color: 0x101113, roughness: 0.77 });
const skiTop = new T.MeshStandardMaterial({ color: 0x1c2024, roughness: 0.56 });
const sphere = new T.SphereGeometry(1, 32, 20);

function mesh(parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material, position: Point = [0, 0, 0]) {
  const part = new T.Mesh(geometry, material);
  part.position.set(...position);
  parent.add(part);
  return part;
}

function oval(parent: T.Object3D, position: Point, scale: Point, material = white) {
  const part = mesh(parent, sphere, material, position);
  part.scale.set(...scale);
  return part;
}

function shell(parent: T.Object3D, profile: number[][], depth: number, material = white) {
  const curve = new T.SplineCurve(profile.map(([x, y]) => new T.Vector2(x, y)));
  const geometry = new T.LatheGeometry(curve.getPoints(48), 64);
  geometry.scale(1, 1, depth);
  return mesh(parent, geometry, material);
}

function muscle(parent: T.Object3D, length: number, width: number, end: number, bulge: number, depth: number) {
  return shell(parent, [
    [0, -length - end * 0.65], [end, -length * 0.98],
    [end * 1.07, -length * 0.76], [width, -length * bulge],
    [width * 0.96, -length * 0.13], [width * 0.69, width * 0.48],
    [0, width * 0.73],
  ], depth);
}

function torsoMesh(parent: T.Object3D) {
  const torso = shell(parent, [[0,-0.108],[.132,-.086],[.139,-.015],[.15,.045],[.178,.113],
    [.219,.19],[.226,.246],[.203,.285],[.133,.314],[.068,.366],[0,.374]], 0.61);
  const positions = torso.geometry.attributes.position;
  const bump = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) =>
    Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const side = Math.abs(x);
    const front = z > 0;
    const weight = Math.min(Math.abs(z) / 0.105, 1) ** 2;
    const relief = front
      ? 0.055 * bump(side, y, .105, .216, .076, .057)
        + [0.002, .055, .110].reduce((sum, row) => sum + .026 * bump(side, y, .052, row, .046, .024), 0)
        + .014 * bump(side, y, .106, .115, .037, .058)
      : .046 * bump(side, y, .119, .19, .087, .092)
        + .024 * bump(side, y, .041, .129, .034, .13);
    positions.setZ(i, z + Math.sign(z) * relief * weight);
  }
  torso.geometry.computeVertexNormals();
}

function makePole(scene: T.Scene) {
  const pole = new T.Group();
  scene.add(pole);
  mesh(pole, new T.CylinderGeometry(.008, .005, .98, 12), black, [0, -.50, 0]);
  mesh(pole, new T.CylinderGeometry(.018, .014, .14, 18), rubber, [0, -.015, 0]);
  oval(pole, [0, .064, 0], [.025, .013, .025], black);
  mesh(pole, new T.CylinderGeometry(.009, .008, .07, 12), blue, [0, -.37, 0]);
  mesh(pole, new T.CylinderGeometry(.032, .028, .008, 24), black, [0, -.935, 0]);
  mesh(pole, new T.ConeGeometry(.005, .027, 10), trim, [0, -.993, 0]).rotation.z = Math.PI;
  return pole;
}

function makeRig() {
  const positions: Record<string, Point> = {
    Hips: [0, 0.96, 0], Spine: [0, 0.095, 0], Spine1: [0, 0.10, 0],
    Spine2: [0, 0.11, 0], Neck: [0, 0.14, 0], Head: [0, 0.065, 0],
  };
  for (const side of SIDES) {
    const sign = side === 'Left' ? 1 : -1;
    Object.assign(positions, {
      [side + 'UpLeg']: [sign * 0.115, -0.02, 0],
      [side + 'Leg']: [0, -THIGH, 0],
      [side + 'Foot']: [0, -SHIN, 0],
      [side + 'ToeBase']: [0, -0.08, 0.11],
      [side + 'Shoulder']: [sign * 0.093, 0.075, 0],
      [side + 'Arm']: [sign * 0.119, 0, 0],
      [side + 'ForeArm']: [0, -0.295, 0],
      [side + 'Hand']: [0, -0.26, 0],
    });
  }
  const root = new T.Group();
  const bones = new Map<string, T.Bone>();
  for (const [name, position] of Object.entries(positions)) {
    const bone = new T.Bone();
    bone.name = name;
    bone.position.set(...position);
    bones.set(name, bone);
  }
  for (const [name, bone] of bones) {
    const parent = RIG_PARENTS[name];
    (parent ? bones.get(parent)! : root).add(bone);
  }
  // Poseify's CCD solver addresses bones through this mesh. The visible
  // articulated surfaces below follow the same bones directly.
  const driver = new T.SkinnedMesh(new T.BufferGeometry(), white);
  driver.visible = false;
  root.add(driver);
  root.updateMatrixWorld(true);
  driver.bind(new T.Skeleton([...bones.values()]));
  return { root, bone: (name: string) => bones.get(name)! };
}

export function createSkier(scene: T.Scene) {
  const { root, bone } = makeRig();
  const rig = new PosableSkeleton(root, { ...DEFAULT_LOAD_CONFIG, id: 'ski-white', name: '通用白模' });
  if (!rig.isValid) throw new Error('白模骨骼初始化失败');

  const hips = bone('Hips');
  oval(hips, [0, .009, 0], [.191, .115, .125], cloth);
  shell(hips, [[0,.034],[.158,.037],[.166,.059],[.169,.105],[.161,.112],[0,.112]], .78, black);
  mesh(hips, new T.BoxGeometry(.023,.044,.008), blue, [0,.08,.134]);
  mesh(hips, new T.BoxGeometry(.023,.044,.008), blue, [0,.08,-.134]);
  torsoMesh(bone('Spine'));
  oval(bone('Neck'), [0, -.022, -.005], [.065, .101, .068]);
  const head = shell(bone('Head'), [[0,-.043],[.037,-.044],[.062,-.015],[.075,.039],
    [.086,.094],[.081,.14],[.053,.174],[0,.187]], 1.08);
  head.position.z = .009;
  for (const sign of [1,-1]) oval(bone('Head'), [sign*.08,.065,-.009], [.013,.031,.023]);

  const skis = SIDES.map((side) => {
    const thigh = bone(side + 'UpLeg');
    const shin = bone(side + 'Leg');
    const arm = bone(side + 'Arm');
    const forearm = bone(side + 'ForeArm');
    const hand = bone(side + 'Hand');
    const sign = side === 'Left' ? 1 : -1;
    muscle(thigh, THIGH, .112, .067, .44, 1.02);
    shell(thigh, [[0,-.245],[.112,-.248],[.118,-.226],[.124,-.144],[.123,-.059],[.127,.006],[.102,.077],[0,.093]],1.04,cloth);
    muscle(shin, SHIN, .082, .041, .38, 1.02);
    oval(shin, [0,-.14,-.018], [.072,.122,.066]);
    muscle(arm, .295, .092, .045, .38, 1.02);
    oval(arm, [sign*.018,-.03,.011], [.087,.107,.084]);
    muscle(forearm, .26, .063, .033, .34, .98);
    oval(hand, [0,-.034,0], [.044,.063,.036], blue);
    oval(hand, [-sign*.028,-.032,.017], [.020,.038,.023], blue);
    for (let finger = 0; finger < 4; finger++) {
      oval(hand, [sign*.018,-.014 - finger*.017,.027], [.029,.010,.014]);
    }

    const ski = new T.Group();
    scene.add(ski);
    const outline = new T.Shape();
    outline.moveTo(-0.049, -0.79);
    outline.quadraticCurveTo(0, -0.85, 0.049, -0.79);
    outline.bezierCurveTo(0.062, -0.35, 0.036, 0.25, 0.064, 0.72);
    outline.quadraticCurveTo(0.069, 0.94, 0, 1.035);
    outline.quadraticCurveTo(-0.069, 0.94, -0.064, 0.72);
    outline.bezierCurveTo(-0.036, 0.25, -0.062, -0.35, -0.049, -0.79);
    const deck = new T.ExtrudeGeometry(outline, { depth: 0.015, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003 });
    deck.rotateX(Math.PI / 2);
    const vertices = deck.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const z = vertices.getZ(i);
      const rise = 1.3 * Math.max(0, z - 0.78) ** 2 + 0.8 * Math.max(0, -z - 0.72) ** 2;
      vertices.setY(i, vertices.getY(i) + 0.033 + rise);
    }
    deck.computeVertexNormals();
    mesh(ski, deck, skiTop);
    for (const z of [-.53,.60]) {
      for (const x of [-.035,.035]) mesh(ski, new T.BoxGeometry(.007,.005,.34), blue, [x,.037,z]);
      mesh(ski, new T.BoxGeometry(.07,.005,.008), blue, [0,.037,z + .17]);
    }
    mesh(ski, new T.BoxGeometry(.089,.031,.32), black, [0,.049,.038]);
    oval(ski, [0,.085,-.10], [.058,.044,.063], black);
    oval(ski, [0,.086,.204], [.056,.041,.063], black);
    oval(ski, [0,.116,.064], [.065,.064,.145], black);
    oval(ski, [0,.156,-.018], [.06,.105,.081], black);
    oval(ski, [0,.237,-.019], [.058,.024,.074], blue);
    oval(ski, [0,.24,-.019], [.049,.026,.062], black);
    for (const [y,z] of [[.222,.052],[.183,.069],[.151,.122]]) {
      mesh(ski, new T.BoxGeometry(.116,.016,.026), rubber, [0,y,z]);
      mesh(ski, new T.BoxGeometry(.028,.019,.032), blue, [sign*.042,y,z]);
      mesh(ski, new T.BoxGeometry(.022,.020,.020), trim, [sign*.045,y,z]);
    }
    return ski;
  });
  const poles = SIDES.map(() => makePole(scene));
  scene.add(root);
  return { rig, bone, skis, poles };
}
