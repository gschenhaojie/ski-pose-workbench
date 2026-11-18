import { BOOT_HEIGHT, type Point } from './skier';

type Pair<T> = [T, T];
export type PoseGroup = '基础' | '转弯' | '点杖' | '跳跃';

export interface Pose {
  label: string;
  group: PoseGroup;
  hips: Point;
  lean: number;
  twist: number;
  bank: number;
  hands: Pair<Point>;
  feet: Pair<Point>;
  yaw: Pair<number>;
  edge: Pair<number>;
  poleSweep: Pair<number>;
  plant: Pair<boolean>;
}

const base: Pose = {
  label: '平行滑行', group: '基础', hips: [0,.855,-.095], lean: 17, twist: 0, bank: 0,
  hands: [[.34,.94,.30],[-.34,.94,.30]],
  feet: [[.162,BOOT_HEIGHT,.015],[-.162,BOOT_HEIGHT,-.015]],
  yaw: [0,0], edge: [0,0], poleSweep: [14,14], plant: [false,false],
};

function pose(label: string, group: PoseGroup, settings: Partial<Omit<Pose, 'label' | 'group'>>): Pose {
  return { ...base, ...settings, label, group };
}

function mirror(original: Pose, label: string): Pose {
  const flip = ([x,y,z]: Point): Point => [-x,y,z];
  return {
    ...original, label, hips: flip(original.hips),
    lean: original.lean, twist: -original.twist, bank: -original.bank,
    hands: [flip(original.hands[1]), flip(original.hands[0])],
    feet: [flip(original.feet[1]), flip(original.feet[0])],
    yaw: [-original.yaw[1], -original.yaw[0]], edge: [-original.edge[1], -original.edge[0]],
    poleSweep: [original.poleSweep[1], original.poleSweep[0]], plant: [original.plant[1], original.plant[0]],
  };
}

const enter = pose('左入弯', '转弯', {
  hips:[.104,.80,-.13], lean:24, twist:10, bank:-10,
  feet:[[.17,.16,.07],[-.17,.16,-.055]], hands:[[.42,1.00,.29],[-.31,1.01,.35]],
  edge:[-13,-13], poleSweep:[26,20],
});
const carve = pose('左刻滑', '转弯', {
  hips:[.26,.70,-.135], lean:28, bank:-23, twist:16,
  feet:[[.16,.172,.115],[-.20,.177,-.06]], hands:[[.52,.86,.27],[-.25,.99,.35]],
  yaw:[7,7], edge:[-29,-33], poleSweep:[38,29],
});
const traverse = pose('左横滑', '转弯', {
  hips:[.08,.85,-.09], lean:14, bank:-11, twist:-14,
  hands:[[.37,1.07,.27],[-.37,1.04,.34]], yaw:[12,12], edge:[-15,-15],
  feet:[[.16,.16,.09],[-.17,.16,-.08]], poleSweep:[30,22],
});
const plant = pose('左手点杖', '点杖', {
  hips:[.08,.79,-.14], lean:24, twist:12, bank:-7,
  hands:[[.38,.94,.49],[-.36,1.04,.13]],
  feet:[[.17,.155,.07],[-.17,.155,-.02]], poleSweep:[-10,36], plant:[true,false],
});

export const groups: PoseGroup[] = ['基础', '转弯', '点杖', '跳跃'];
export const presets: Pose[] = [
  pose('持杖站姿','基础', { hips:[0,.985,0], lean:3, hands:[[.31,1.05,.225],[-.31,1.05,.225]], poleSweep:[0,0], plant:[true,true] }),
  base,
  pose('低姿滑行','基础', { hips:[0,.675,-.20], lean:43, hands:[[.29,.92,.49],[-.29,.92,.49]], poleSweep:[59,59] }),
  pose('犁式减速','基础', {
    hips:[0,.795,-.13], lean:21,
    hands:[[.41,1.04,.31],[-.41,1.04,.31]],
    feet:[[.245,.155,0],[-.245,.155,0]], yaw:[-11,11], edge:[7,-7], poleSweep:[25,25],
  }),
  enter, mirror(enter,'右入弯'), carve, mirror(carve,'右刻滑'), traverse, mirror(traverse,'右横滑'),
  plant, mirror(plant,'右手点杖'),
  pose('双杖撑推','点杖',{
    hips:[0,.87,.06], lean:36, hands:[[.33,.94,-.19],[-.33,.94,-.19]], poleSweep:[47,47],
  }),
  pose('起跳伸展','跳跃', {
    hips:[0,1.15,-.035], feet:[[.173,.34,.025],[-.173,.34,-.025]],
    lean:8, hands:[[.47,1.45,.23],[-.47,1.45,.23]], poleSweep:[41,41],
  }),
  pose('空中收腿','跳跃', {
    hips:[0,1.03,-.23], feet:[[.186,.54,.10],[-.186,.54,.065]],
    lean:35, hands:[[.43,1.28,.42],[-.43,1.28,.42]], poleSweep:[53,53],
  }),
  pose('落地缓冲','跳跃',{
    hips:[0,.695,-.16], lean:35, hands:[[.52,.91,.34],[-.52,.91,.34]],
    feet:[[.197,.15,.055],[-.197,.15,-.055]], poleSweep:[23,23],
  }),
];
