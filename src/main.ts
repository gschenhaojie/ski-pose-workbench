import { createStage, views } from './stage';
import { groups, presets, type PoseGroup } from './presets';
import { BOOT_HEIGHT } from './skier';
import './style.css';

const select = <T extends HTMLElement = HTMLElement>(id: string) => document.querySelector<T>('#' + id)!;
const viewport = select('viewport');
const lockButton = select<HTMLButtonElement>('lock');
const downloadImage = select<HTMLButtonElement>('download-image');
const prompt = select<HTMLTextAreaElement>('prompt');
const lean = select<HTMLInputElement>('lean');
const twist = select<HTMLInputElement>('twist');
const bank = select<HTMLInputElement>('bank');
const angles = { lean, twist, bank } as const;
const angleParts = ['lean', 'twist', 'bank'] as const;
let locked = false;
let activePreset = 1;
let noticeTimer: ReturnType<typeof setTimeout>;

function notify(message: string) {
  const notice = select('notice');
  notice.textContent = message;
  notice.classList.add('visible');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.classList.remove('visible'), 2700);
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function button(container: HTMLElement, label: string, action: () => void) {
  const item = document.createElement('button');
  item.type = 'button';
  item.textContent = label;
  item.addEventListener('click', action);
  container.append(item);
  return item;
}

function relativeView(azimuth: number) {
  const angle = Math.abs(azimuth);
  const side = azimuth >= 0 ? '左' : '右';
  if (angle < 15) return '正前方';
  if (angle < 69) return side + '前方';
  if (angle < 111) return side + '侧';
  if (angle < 165) return side + '后方';
  return '正后方';
}

function setup() {
  const stage = createStage(viewport, updatePose, updateCamera);
  const groupButtons = groups.map((group) => button(select('pose-groups'), group, () => showGroup(group)));
  const presetButtons = presets.map((preset, index) => button(select('presets'), preset.label, () => {
    activePreset = index;
    stage.setPreset(index);
  }));
  function showGroup(group: PoseGroup) {
    groupButtons.forEach((item, index) => item.setAttribute('aria-pressed', String(groups[index] === group)));
    presetButtons.forEach((item, index) => { item.hidden = presets[index].group !== group; });
  }
  showGroup(presets[activePreset].group);
  const viewButtons = views.map((view) => button(select('views'), view.label, () => stage.setView(view.id)));

  function updatePrompt() {
    const { pose } = stage;
    const camera = stage.getCamera();
    const direction = relativeView(camera.azimuth);
    const angle = camera.elevation < 8 ? '接近平视' : `俯视约 ${camera.elevation}°`;
    const stance = pose.feet[0][2] - pose.feet[1][2];
    const skiPosition = Math.abs(stance) < 0.045 ? '两块雪板齐平' : (stance > 0 ? '左板略在前' : '右板略在前');
    const stanceHeight = pose.hips[1] - (pose.feet[0][1] + pose.feet[1][1]) * 0.5;
    const knees = stanceHeight < 0.60 ? '双膝深屈' : stanceHeight < 0.73 ? '双膝屈曲' : '双腿接近伸直';
    const rotation = Math.abs(pose.twist) < 3 ? '' : `，上身向${pose.twist > 0 ? '左' : '右'}转约 ${Math.abs(pose.twist)}°`;
    const sideLean = Math.abs(pose.bank) < 3 ? '' : `，躯干向${pose.bank < 0 ? '左' : '右'}侧倾`;
    const size = camera.distance < 3.65 ? '沿用参考图的近距离构图' : camera.distance > 4.95 ? '采用较远的全身构图' : '全身入镜并保留双板和雪杖';
    const boardShape = Math.abs(pose.yaw[0] - pose.yaw[1]) > 6 ? '两板呈犁式，板头收拢、板尾分开' : `两板平行，${skiPosition}`;
    const contact = pose.feet.every((foot) => foot[1] > BOOT_HEIGHT + 0.07) ? '双板离开雪面'
      : pose.edge.some((edge) => Math.abs(edge) >= 12) ? '雪板以参考图中的角度立刃' : '双板贴近雪面';
    prompt.value = `以人物原图保留无五官的哑光肌肉白模、黑色短裤、蓝色露指手套和黑蓝雪具。以姿势图确定姿态与取景。${knees}，躯干前倾约 ${pose.lean}°${rotation}${sideLean}。双手各握一根雪杖，杖杆方向以姿势图为准。双靴扣在双板固定器上，${boardShape}，${contact}。镜头位于滑雪者${direction}（以板头为正前，偏角约 ${Math.abs(camera.azimuth)}°），${angle}，${size}。保留双腿、雪板和雪杖的遮挡关系。浅色雪面，柔和自然光，静态首帧。`;
  }

  function updatePose() {
    for (const key of angleParts) {
      const input = angles[key];
      input.value = String(stage.pose[key]);
      select(key + '-value').textContent = input.value + '°';
    }
    presetButtons.forEach((item, index) => item.setAttribute(
      'aria-pressed', String(index === activePreset && JSON.stringify(stage.pose) === JSON.stringify(presets[index])),
    ));
    updatePrompt();
  }

  function updateCamera() {
    const camera = stage.getCamera();
    viewButtons.forEach((item, index) => item.setAttribute('aria-pressed', String(camera.id === views[index].id)));
    select('camera-readout').textContent = `${relativeView(camera.azimuth)}  /  俯角 ${camera.elevation}°`;
    updatePrompt();
  }

  lockButton.addEventListener('click', () => {
    locked = !locked;
    stage.setLocked(locked);
    [...Object.values(angles), ...presetButtons].forEach((item) => { item.disabled = locked; });
    lockButton.setAttribute('aria-pressed', String(locked));
    lockButton.textContent = locked ? '解锁姿势' : '锁住姿势';
    select('scene-status').textContent = locked ? '姿势已锁定' : '可编辑姿势';
    select('stage-hint').textContent = locked ? '拖动视窗或选择机位，查看同一个动作。' : '拖动标记调姿势，拖动空白处转机位。';
  });

  for (const key of angleParts) {
    const input = angles[key];
    input.addEventListener('input', () => stage.setAngle(key, Number(input.value)));
  }

  select('view-character').addEventListener('click', () => select<HTMLDialogElement>('character').showModal());

  downloadImage.addEventListener('click', async () => {
    downloadImage.disabled = true;
    try {
      save(await stage.exportPng(), '滑雪参考图.png');
      notify('已下载参考图');
    } catch {
      notify('参考图导出失败，请重试');
    } finally {
      downloadImage.disabled = false;
    }
  });

  select('download-prompt').addEventListener('click', () => {
    save(new Blob([prompt.value + '\n'], { type: 'text/plain;charset=utf-8' }), '滑雪镜头提示词.txt');
    notify('已下载提示词');
  });
  select('copy-prompt').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(prompt.value);
      notify('已复制提示词');
    } catch {
      prompt.select();
      notify('已选中提示词，可手动复制');
    }
  });

  stage.setView('three-quarter');
  stage.resize();
  stage.setPreset(activePreset);
}

try {
  setup();
} catch (error) {
  console.error(error);
  viewport.textContent = '三维视图启动失败。请使用支持 WebGL 的浏览器打开。';
  viewport.classList.add('unavailable');
  document.querySelectorAll<HTMLButtonElement>('button').forEach((item) => { item.disabled = true; });
}
