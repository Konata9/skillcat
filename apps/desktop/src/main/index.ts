import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, nativeImage, net, session, shell } from 'electron';
import {
  APP_NAME,
  getConfigDir,
  isValidProxyUrl,
  normalizeProxyUrl,
  SkillManager,
  type ProxySettings,
} from '@skillcat/core';
import pkg from '../../package.json';
import { bootstrap } from './bootstrap';
import { registerIpc } from './ipc';

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
 * SKILLCAT_CONFIG_DIR / SKILLMAN_CONFIG_DIR always takes precedence.
 */
function resolveConfigDir(): string | undefined {
  if (process.env.SKILLCAT_CONFIG_DIR || process.env.SKILLMAN_CONFIG_DIR) return undefined;
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

const manager = new SkillManager({
  configDir: resolveConfigDir(),
  bundledCli: resolveBundledCli(),
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
      sandbox: false,
    },
  });

  window.once('ready-to-show', () => window.show());

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

  await bootstrap(manager);
  await applyProxy(manager.config.proxy);
  manager.setRemoteFetch((url, init) => net.fetch(url, init));

  registerIpc(manager, {
    ipc: ipcMain,
    broadcast,
    applyProxy,
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
