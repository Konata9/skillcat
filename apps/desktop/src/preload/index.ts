import { contextBridge, ipcRenderer } from 'electron';
import 'electron-log/preload';
import type { EvaluationEvent, RuntimeSkillEvent } from '@skillcat/core';
import { CH, EVENTS, type OpEvent, type SkillCatApi, type Snapshot } from '../shared/contract';

const api: SkillCatApi = {
  getSnapshot: () => ipcRenderer.invoke(CH.snapshot),
  refresh: (options) => ipcRenderer.invoke(CH.refresh, options),
  listProjects: () => ipcRenderer.invoke(CH.projectsList),
  addProject: (path, options) => ipcRenderer.invoke(CH.projectsAdd, path, options),
  removeProject: (path) => ipcRenderer.invoke(CH.projectsRemove, path),
  setProjectPinned: (path, pinned) => ipcRenderer.invoke(CH.projectsPin, path, pinned),
  setRoots: (roots) => ipcRenderer.invoke(CH.rootsSet, roots),
  setSettings: (patch) => ipcRenderer.invoke(CH.settingsSet, patch),
  getAnnotation: (ref) => ipcRenderer.invoke(CH.annotationGet, ref),
  saveAnnotation: (ref, annotation) => ipcRenderer.invoke(CH.annotationSave, ref, annotation),
  searchRemote: (query) => ipcRenderer.invoke(CH.searchRemote, query),
  leaderboard: (kind, page) => ipcRenderer.invoke(CH.leaderboard, kind, page),
  remoteSkillDetail: (slug) => ipcRenderer.invoke(CH.remoteSkillDetail, slug),
  evaluate: (locale) => ipcRenderer.invoke(CH.evaluate, locale),
  reviewCandidates: (locale) => ipcRenderer.invoke(CH.reviewCandidates, locale),
  testLlm: (settings) => ipcRenderer.invoke(CH.testLlm, settings),
  checkUpdate: () => ipcRenderer.invoke(CH.checkUpdate),
  openExternal: (url) => ipcRenderer.invoke(CH.openExternal, url),
  startOp: (op) => ipcRenderer.invoke(CH.opStart, op),
  cancelOp: (opId) => ipcRenderer.invoke(CH.opCancel, opId),
  openSkill: (ref) => ipcRenderer.invoke(CH.openSkill, ref),
  revealSkill: (ref) => ipcRenderer.invoke(CH.revealSkill, ref),
  pickDirectory: () => ipcRenderer.invoke(CH.pickDirectory),
  openConfig: () => ipcRenderer.invoke(CH.configOpen),
  revealConfig: () => ipcRenderer.invoke(CH.configReveal),
  reloadConfig: () => ipcRenderer.invoke(CH.configReload),
  doctor: () => ipcRenderer.invoke(CH.doctor),
  listBridges: () => ipcRenderer.invoke(CH.bridgesList),
  installBridge: (id) => ipcRenderer.invoke(CH.bridgesInstall, id),
  uninstallBridge: (id) => ipcRenderer.invoke(CH.bridgesUninstall, id),
  activityStats: () => ipcRenderer.invoke(CH.activityStats),
  activityEvents: () => ipcRenderer.invoke(CH.activityEvents),
  clearActivity: () => ipcRenderer.invoke(CH.activityClear),
  revealLogs: () => ipcRenderer.invoke(CH.logsReveal),
  clearLogs: () => ipcRenderer.invoke(CH.logsClear),
  onStateChanged: (callback) => {
    const listener = (_event: unknown, snapshot: Snapshot) => callback(snapshot);
    ipcRenderer.on(EVENTS.stateChanged, listener);
    return () => {
      ipcRenderer.removeListener(EVENTS.stateChanged, listener);
    };
  },
  onOpEvent: (callback) => {
    const listener = (_event: unknown, payload: OpEvent) => callback(payload);
    ipcRenderer.on(EVENTS.opEvent, listener);
    return () => {
      ipcRenderer.removeListener(EVENTS.opEvent, listener);
    };
  },
  onEvaluationEvent: (callback) => {
    const listener = (_event: unknown, payload: EvaluationEvent) => callback(payload);
    ipcRenderer.on(EVENTS.evaluationEvent, listener);
    return () => {
      ipcRenderer.removeListener(EVENTS.evaluationEvent, listener);
    };
  },
  onActivity: (callback) => {
    const listener = (_event: unknown, payload: RuntimeSkillEvent[]) => callback(payload);
    ipcRenderer.on(EVENTS.activityEvent, listener);
    return () => {
      ipcRenderer.removeListener(EVENTS.activityEvent, listener);
    };
  },
};

contextBridge.exposeInMainWorld('skillcat', api);
