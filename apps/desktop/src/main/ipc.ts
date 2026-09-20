import { join } from 'node:path';
import type { AsyncOp, ProxySettings, SkillManager, UpdateCheckResult } from '@skillcat/core';
import { z } from 'zod';
import { CH, type OpStart, type SkillRefLite, type Snapshot } from '../shared/contract';

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => unknown,
  ): void;
}

export interface IpcDeps {
  ipc: IpcMainLike;
  broadcast: (channel: string, payload: unknown) => void;
  openSkill: (path: string) => Promise<void>;
  revealSkill: (path: string) => void;
  openConfig: (path: string) => Promise<void>;
  revealConfig: (path: string) => void;
  pickDirectory: () => Promise<string | null>;
  /** Applies the proxy to the Electron session used by the in-process fetch. */
  applyProxy: (proxy: ProxySettings) => Promise<void>;
  /** The packaged app version, surfaced in the snapshot for the updates view. */
  appVersion: string;
  checkUpdate: () => Promise<UpdateCheckResult>;
  openExternal: (url: string) => Promise<void>;
}

const ScopeSchema = z.enum(['global', 'project']);
const LlmSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum([
    'anthropic',
    'openai',
    'gemini',
    'deepseek',
    'qwen',
    'glm',
    'kimi',
    'minimax',
    'mimo',
    'ollama',
    'custom',
  ]),
  apiKey: z.string(),
  baseUrl: z.string(),
  model: z.string(),
});
const RefSchema = z.object({
  scope: ScopeSchema,
  projectPath: z.string().optional(),
  name: z.string().min(1),
});
const RefreshSchema = z
  .object({
    deep: z.boolean().optional(),
    projectPaths: z.array(z.string()).optional(),
  })
  .optional();
const OpSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('add'),
    source: z.string().min(1),
    targets: z
      .array(z.object({ scope: ScopeSchema, cwd: z.string().optional() }))
      .min(1),
    title: z.string(),
  }),
  z.object({
    kind: z.literal('remove'),
    name: z.string().min(1),
    scope: ScopeSchema,
    cwd: z.string().optional(),
    title: z.string(),
  }),
  z.object({
    kind: z.literal('update'),
    names: z.array(z.string()),
    scope: ScopeSchema,
    cwd: z.string().optional(),
    title: z.string(),
  }),
]);
const SettingsSchema = z.object({
  skillsCommand: z.array(z.string()).nullable().optional(),
  proxy: z
    .object({
      url: z.string(),
      bypass: z.string(),
    })
    .optional(),
  thresholds: z
    .object({
      overlap: z.number().min(0).max(1).optional(),
      duplicate: z.number().min(0).max(1).optional(),
    })
    .optional(),
  showInternal: z.boolean().optional(),
  customSkillDirs: z.array(z.string()).optional(),
  llm: LlmSchema.optional(),
});

export function toSnapshot(manager: SkillManager, version: string): Snapshot {
  const resolved = manager.cliInfo;
  return {
    loading: manager.state.loading,
    version,
    scannedAt: manager.state.scannedAt,
    global: manager.state.global,
    projects: [...manager.state.projects.entries()].map(([path, records]) => ({ path, records })),
    orphans: manager.state.orphans,
    findings: manager.state.findings,
    projectErrors: [...manager.state.projectErrors.entries()].map(([path, error]) => ({
      path,
      error,
    })),
    config: manager.config,
    configPath: manager.configStore.filePath,
    cliAvailable: manager.cliAvailable,
    cliSource: resolved?.source ?? 'none',
    cliError: resolved?.error,
    evaluation: manager.state.evaluation,
    evaluationStale: manager.evaluationStale(),
    verdictsAt: manager.state.verdictsAt,
    verdictsStale: manager.verdictsStale(),
    evaluating: manager.state.evaluating,
    reviewing: manager.state.reviewing,
    evaluationProgress: manager.state.evaluationProgress,
    evaluationError: manager.state.evaluationError,
  };
}

function skillFilePath(manager: SkillManager, ref: SkillRefLite): string | null {
  const record = manager.findRecord(ref.scope, ref.projectPath, ref.name);
  if (!record) return null;
  const skillMd = record.files.find((file) => file.kind === 'skill-md')?.relativePath;
  return join(record.path, skillMd ?? 'SKILL.md');
}

function createOp(manager: SkillManager, request: OpStart): AsyncOp {
  switch (request.kind) {
    case 'add':
      return manager.runAdd(request.source, request.targets);
    case 'remove':
      return manager.runRemove(request.name, { scope: request.scope, cwd: request.cwd });
    case 'update':
      return manager.runUpdate(request.names, { scope: request.scope, cwd: request.cwd });
  }
}

export function registerIpc(manager: SkillManager, deps: IpcDeps): void {
  const { ipc, broadcast } = deps;

  ipc.handle(CH.snapshot, () => toSnapshot(manager, deps.appVersion));

  ipc.handle(CH.refresh, async (_event, rawOptions) => {
    const options = RefreshSchema.parse(rawOptions);
    await manager.refresh(options ?? {});
  });

  ipc.handle(CH.projectsList, () => manager.listProjectInfos());
  ipc.handle(CH.projectsAdd, async (_event, rawPath, rawOptions) => {
    const path = z.string().min(1).parse(rawPath);
    const options = z
      .object({ alias: z.string().optional(), pinned: z.boolean().optional() })
      .optional()
      .parse(rawOptions);
    await manager.addProject(path, options ?? {});
    await manager.refresh();
  });
  ipc.handle(CH.projectsRemove, async (_event, rawPath) => {
    const path = z.string().min(1).parse(rawPath);
    await manager.removeProject(path);
  });
  ipc.handle(CH.projectsPin, async (_event, rawPath, rawPinned) => {
    const path = z.string().min(1).parse(rawPath);
    const pinned = z.boolean().parse(rawPinned);
    await manager.setProjectPinned(path, pinned);
  });
  ipc.handle(CH.rootsSet, async (_event, rawRoots) => {
    const roots = z.array(z.string()).parse(rawRoots);
    await manager.setRoots(roots);
    await manager.refresh();
  });
  ipc.handle(CH.settingsSet, async (_event, rawPatch) => {
    const patch = SettingsSchema.parse(rawPatch);
    if (patch.skillsCommand !== undefined) await manager.setSkillsCommand(patch.skillsCommand);
    if (patch.proxy) {
      await manager.setProxy(patch.proxy);
      await deps.applyProxy(patch.proxy);
    }
    if (patch.thresholds) await manager.setThresholds(patch.thresholds);
    if (patch.showInternal !== undefined) await manager.setShowInternal(patch.showInternal);
    if (patch.customSkillDirs !== undefined) await manager.setCustomSkillDirs(patch.customSkillDirs);
    if (patch.llm !== undefined) await manager.setLlm(patch.llm);
    await manager.refresh();
  });

  ipc.handle(CH.annotationGet, async (_event, rawRef) => {
    const ref = RefSchema.parse(rawRef) as SkillRefLite;
    const record = manager.findRecord(ref.scope, ref.projectPath, ref.name);
    if (!record) return null;
    return manager.loadAnnotation(record);
  });
  ipc.handle(CH.annotationSave, async (_event, rawRef, rawAnnotation) => {
    const ref = RefSchema.parse(rawRef) as SkillRefLite;
    const annotation = z
      .object({
        added: z.array(
          z.object({ text: z.string(), kind: z.enum(['positive', 'negative']) }),
        ),
        removed: z.array(z.string()),
        note: z.string().optional(),
      })
      .nullable()
      .parse(rawAnnotation);
    const record = manager.findRecord(ref.scope, ref.projectPath, ref.name);
    if (!record) throw new Error(`skill not found: ${ref.name}`);
    await manager.saveAnnotation(record, annotation);
  });

  ipc.handle(CH.searchRemote, async (_event, rawQuery) => {
    const query = z.string().min(1).parse(rawQuery);
    return manager.searchRemote(query);
  });
  ipc.handle(CH.leaderboard, async (_event, rawKind, rawPage) => {
    const kind = z.enum(['all-time', 'trending', 'hot']).parse(rawKind);
    const page = z.number().int().min(0).optional().parse(rawPage);
    return manager.fetchLeaderboard(kind, page ?? 0);
  });
  ipc.handle(CH.remoteSkillDetail, async (_event, rawSlug) => {
    const slug = z.string().min(1).parse(rawSlug);
    return manager.getRemoteSkillDetail(slug);
  });
  ipc.handle(CH.evaluate, async (_event, rawLocale) => {
    const locale = z.enum(['zh', 'en']).parse(rawLocale);
    await manager.runEvaluation(locale);
  });
  ipc.handle(CH.reviewCandidates, async (_event, rawLocale) => {
    const locale = z.enum(['zh', 'en']).parse(rawLocale);
    await manager.runCandidateReview(locale);
  });
  ipc.handle(CH.testLlm, async (_event, rawSettings) => {
    return manager.testLlm(LlmSchema.parse(rawSettings));
  });
  ipc.handle(CH.checkUpdate, () => deps.checkUpdate());
  ipc.handle(CH.openExternal, async (_event, rawUrl) => {
    const url = z.string().url().parse(rawUrl);
    if (!/^https:\/\//i.test(url)) throw new Error('only https URLs can be opened');
    await deps.openExternal(url);
  });

  const ops = new Map<string, AsyncOp>();
  ipc.handle(CH.opStart, async (_event, rawRequest) => {
    const request = OpSchema.parse(rawRequest) as OpStart;
    const op = createOp(manager, request);
    ops.set(op.id, op);
    void (async () => {
      try {
        for await (const line of op.lines) {
          broadcast(CH.opEvent, { opId: op.id, line });
        }
      } catch {
        // stream failures are reflected in the final result
      }
      const result = await op.result;
      ops.delete(op.id);
      broadcast(CH.opEvent, { opId: op.id, done: true, ok: result.ok });
      await manager.refresh();
    })();
    return { opId: op.id };
  });
  ipc.handle(CH.opCancel, (_event, rawOpId) => {
    const opId = z.string().parse(rawOpId);
    ops.get(opId)?.cancel();
  });

  ipc.handle(CH.openSkill, async (_event, rawRef) => {
    const ref = RefSchema.parse(rawRef) as SkillRefLite;
    const path = skillFilePath(manager, ref);
    if (!path) throw new Error(`skill not found: ${ref.name}`);
    await deps.openSkill(path);
  });
  ipc.handle(CH.revealSkill, (_event, rawRef) => {
    const ref = RefSchema.parse(rawRef) as SkillRefLite;
    const record = manager.findRecord(ref.scope, ref.projectPath, ref.name);
    if (!record) throw new Error(`skill not found: ${ref.name}`);
    deps.revealSkill(record.path);
  });
  ipc.handle(CH.pickDirectory, () => deps.pickDirectory());
  ipc.handle(CH.configOpen, async () => {
    await deps.openConfig(await manager.ensureConfigFile());
  });
  ipc.handle(CH.configReveal, async () => {
    deps.revealConfig(await manager.ensureConfigFile());
  });
  ipc.handle(CH.configReload, () => manager.reloadConfig());
  ipc.handle(CH.doctor, () => manager.doctor());

  manager.onChange(() => broadcast(CH.stateChanged, toSnapshot(manager, deps.appVersion)));
  manager.onEvaluationEvent((event) => broadcast(CH.evaluationEvent, event));
}
