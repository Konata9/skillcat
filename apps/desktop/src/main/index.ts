import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, nativeImage, net, session, shell } from 'electron';
import {
  APP_NAME,
  getConfigDir,
  isValidProxyUrl,
  logsDir,
  normalizeProxyUrl,
  SkillManager,
  type ProxySettings,
} from '@skillcat/core';
import pkg from '../../package.json';
import { bootstrap } from './bootstrap';
import { registerIpc } from './ipc';
import { applyLogging, clearLogs, installCoreLogger, setupLogging } from './logger';

app.setName('SkillCat');

/**
 * `owner/repo` for the in-app update check, parsed from this package's
 * `repository` field so the release source has a single source of truth.
 */
function githubSlug(): string {
  const field = (pkg as { repository?: unknown }).repository;
  const url =
    typeof field === 'string'
      ? field
      : field && typeof field === 'object' && 'url' in field
        ? String((field as { url: unknown }).url ?? '')
        : '';
  const match = /github\.com[/:]([^/]+)\/([^/#?]+)/i.exec(url);
  return match ? `${match[1]}/${match[2]!.replace(/\.git$/, '')}` : '';
}

const UPDATE_REPO = githubSlug();

/**
 * Config directory for this build.
 *
 * Packaged builds use the default per-user location (`~/Library/Application
 * Support/skillcat`, `%APPDATA%\skillcat`, …) so app updates never touch a
 * user's settings. Development builds get a sibling `skillcat-dev` directory
 * so they can never read or overwrite the packaged config. An explicit
 * SKILLCAT_CONFIG_DIR always takes precedence.
 */
function resolveConfigDir(): string | undefined {
  if (process.env.SKILLCAT_CONFIG_DIR) return undefined;
  if (app.isPackaged) return undefined;
  return join(dirname(getConfigDir()), `${APP_NAME}-dev`);
}

/**
 * The `skills` CLI staged by `scripts/bundle-skills-cli.mjs` and shipped as an
 * extra resource. It is run with the app's own binary acting as Node
 * (`ELECTRON_RUN_AS_NODE=1`), so the packaged app needs no system Node install.
 *
 * macOS only for now — Windows builds use the system Node/npx fallback.
 */
function resolveBundledCli(): { node: string; cli: string } | undefined {
  if (process.platform === 'win32') return undefined;
  const cli = app.isPackaged
    ? join(process.resourcesPath, 'skills-cli', 'node_modules', 'skills', 'bin', 'cli.mjs')
    : join(
        __dirname,
        '..',
        '..',
        'resources',
        'skills-cli',
        'node_modules',
        'skills',
        'bin',
        'cli.mjs',
      );
  return existsSync(cli) ? { node: process.execPath, cli } : undefined;
}

/**
 * Skills shipped with the app (`resources/internal-skills`, staged as an extra
 * resource). They are app assets, not user installs, and back SkillCat's own AI
 * features. Returns undefined when the directory is missing (e.g. a bare dev
 * checkout without the resources).
 */
function resolveBuiltinSkillsDir(): string | undefined {
  const dir = app.isPackaged
    ? join(process.resourcesPath, 'internal-skills')
    : join(__dirname, '..', '..', 'resources', 'internal-skills');
  return existsSync(dir) ? dir : undefined;
}

const manager = new SkillManager({
  configDir: resolveConfigDir(),
  bundledCli: resolveBundledCli(),
  builtinSkillsDir: resolveBuiltinSkillsDir(),
});

/**
 * Node's global fetch ignores proxy env vars set after process start, so the
 * in-process search request goes through Electron's session instead: configure
 * the proxy here and hand `net.fetch` to the manager.
 */
async function applyProxy(proxy: ProxySettings): Promise<void> {
  const url = isValidProxyUrl(proxy.url) ? normalizeProxyUrl(proxy.url) : null;
  if (url) {
    await session.defaultSession.setProxy({
      proxyRules: url,
      proxyBypassRules: proxy.bypass.trim() || undefined,
    });
  } else {
    await session.defaultSession.setProxy({ mode: 'direct' });
  }
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

function isSafeExternalUrl(url: string): boolean {
  return /^https:\/\//i.test(url);
}

/**
 * Locks the window to its own document: in-app navigations away from the loaded
 * page are cancelled, and any https target is handed to the OS browser instead.
 * Only a same-URL reload (dev full reload) is allowed through.
 */
function hardenWebContents(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (url === window.webContents.getURL()) return;
    event.preventDefault();
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
  });
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    title: 'SkillCat',
    backgroundColor: '#f7f8fa',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());
  hardenWebContents(window);

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  // Packaged macOS builds read the icon from the app bundle; in dev the dock
  // would otherwise fall back to the default Electron icon.
  if (process.platform === 'darwin' && process.env.ELECTRON_RENDERER_URL) {
    const icon = nativeImage.createFromPath(join(__dirname, '../../build/icon.png'));
    if (!icon.isEmpty()) app.dock?.setIcon(icon);
  }

  setupLogging(manager.configStore.dir);
  installCoreLogger();
  await bootstrap(manager);
  applyLogging(manager.config.logging);
  await applyProxy(manager.config.proxy);
  manager.setRemoteFetch((url, init) => net.fetch(url, init));

  // The app needs no optional permission (media, geolocation, notifications,
  // …); deny them explicitly instead of relying on Electron's default.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);

  registerIpc(manager, {
    ipc: ipcMain,
    broadcast,
    applyProxy,
    applyLogging,
    revealLogs: async () => {
      const error = await shell.openPath(logsDir(manager.configStore.dir));
      if (error) throw new Error(error);
    },
    clearLogs,
    openSkill: async (path) => {
      const error = await shell.openPath(path);
      if (error) throw new Error(error);
    },
    revealSkill: (path) => shell.showItemInFolder(path),
    openConfig: async (path) => {
      const error = await shell.openPath(path);
      if (error) throw new Error(error);
    },
    revealConfig: (path) => shell.showItemInFolder(path),
    pickDirectory: async () => {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    // `app.getVersion()` reads `version` from package.json, the same value
    // electron-builder uses for the artifact names — one source of truth.
    appVersion: app.getVersion(),
    checkUpdate: () => manager.checkUpdate(UPDATE_REPO, app.getVersion()),
    openExternal: async (url) => {
      // Defense in depth: IPC validates too, but the OS boundary must hold even
      // if a future non-IPC caller reaches this function directly.
      if (!isSafeExternalUrl(url)) throw new Error('only https URLs can be opened');
      await shell.openExternal(url);
    },
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
