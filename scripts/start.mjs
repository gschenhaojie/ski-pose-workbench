import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const windows = process.platform === 'win32';
const [major, minor] = process.versions.node.split('.').map(Number);

function runNpm(args) {
  const result = windows
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'npm', ...args], { cwd: root, stdio: 'inherit' })
    : spawnSync('npm', args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.signal) process.exit(130);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function installIfNeeded() {
  const stampPath = new URL('../node_modules/.ski-pose-install', import.meta.url);
  const lockfile = readFileSync(new URL('../package-lock.json', import.meta.url));
  const stamp = createHash('sha256')
    .update(lockfile)
    .update(`${process.platform}-${process.arch}-${process.versions.node}`)
    .digest('hex');
  const packagesPresent = ['three', 'vite', 'typescript'].every((name) =>
    existsSync(new URL(`../node_modules/${name}/package.json`, import.meta.url)),
  );
  if (packagesPresent && existsSync(stampPath) && readFileSync(stampPath, 'utf8') === stamp) return;
  console.log('正在安装滑雪镜头台的依赖，首次启动需要联网。');
  runNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--include=dev']);
  writeFileSync(stampPath, stamp);
}

try {
  const supported = (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22;
  if (!supported) throw new Error('请安装 Node.js 22.12 或更高版本。');
  installIfNeeded();
  runNpm(['run', 'build']);
  const { preview } = await import('vite');
  const server = await preview({
    root,
    preview: {
      host: '127.0.0.1',
      port: 5187,
      open: !process.argv.includes('--no-open'),
    },
  });
  console.log('滑雪镜头台已启动。使用期间请保留此窗口。');
  server.printUrls();
} catch (error) {
  console.error('滑雪镜头台启动失败。' + error.message);
  process.exitCode = 1;
}
