import { contextBridge, ipcRenderer } from 'electron';
import { CH, type OpEvent, type SkillmanApi, type Snapshot } from '../shared/contract';

const api: SkillmanApi = {
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
  startOp: (op) => ipcRenderer.invoke(CH.opStart, op),
  cancelOp: (opId) => ipcRenderer.invoke(CH.opCancel, opId),
  openSkill: (ref) => ipcRenderer.invoke(CH.openSkill, ref),
  revealSkill: (ref) => ipcRenderer.invoke(CH.revealSkill, ref),
  pickDirectory: () => ipcRenderer.invoke(CH.pickDirectory),
  doctor: () => ipcRenderer.invoke(CH.doctor),
  onStateChanged: (callback) => {
    const listener = (_event: unknown, snapshot: Snapshot) => callback(snapshot);
    ipcRenderer.on(CH.stateChanged, listener);
    return () => {
      ipcRenderer.removeListener(CH.stateChanged, listener);
    };
  },
  onOpEvent: (callback) => {
    const listener = (_event: unknown, payload: OpEvent) => callback(payload);
    ipcRenderer.on(CH.opEvent, listener);
    return () => {
      ipcRenderer.removeListener(CH.opEvent, listener);
    };
  },
};

contextBridge.exposeInMainWorld('skillman', api);
