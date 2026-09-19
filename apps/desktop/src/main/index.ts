import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, net, session, shell } from 'electron';
import { isValidProxyUrl, normalizeProxyUrl, SkillManager, type ProxySettings } from '@skillcat/core';
import { bootstrap } from './bootstrap';
import { registerIpc } from './ipc';

app.setName('SkillCat');

const manager = new SkillManager();

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
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
