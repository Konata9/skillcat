import { join } from 'node:path';
import type { AsyncOp, ProxySettings, SkillManager, UpdateCheckResult } from '@skillcat/core';
import { z } from 'zod';
import {
  CH,
  EVENTS,
  type Channel,
  type OpStart,
  type SkillRefLite,
  type Snapshot,
} from '../shared/contract';

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => unknown,
  ): void;
}

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown;

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
  activity: z
    .object({
      enabled: z.boolean(),
      storePhrase: z.boolean(),
      retentionDays: z.number().int().min(30).max(360),
      maxPhraseChars: z.number().int().min(40).max(4000),
    })
    .optional(),
});

function toSnapshot(manager: SkillManager, version: string): Snapshot {
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
    activityCounts: manager.activityCounts(),
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
  const ops = new Map<string, AsyncOp>();

  // One handler per request channel. Typing this as `Record<Channel, …>` makes a
  // missing or unknown channel a compile error, so `CH` and the handlers can
  // never drift apart.
  const handlers: Record<Channel, IpcHandler> = {
    [CH.snapshot]: () => toSnapshot(manager, deps.appVersion),

    [CH.refresh]: async (_event, rawOptions) => {
      const options = RefreshSchema.parse(rawOptions);
      await manager.refresh(options ?? {});
    },

    [CH.projectsList]: () => manager.listProjectInfos(),
    [CH.projectsAdd]: async (_event, rawPath, rawOptions) => {
      const path = z.string().min(1).parse(rawPath);
      const options = z
        .object({ alias: z.string().optional(), pinned: z.boolean().optional() })
        .optional()
        .parse(rawOptions);
      await manager.addProject(path, options ?? {});
      await manager.refresh();
    },
    [CH.projectsRemove]: async (_event, rawPath) => {
      const path = z.string().min(1).parse(rawPath);
      await manager.removeProject(path);
    },
    [CH.projectsPin]: async (_event, rawPath, rawPinned) => {
      const path = z.string().min(1).parse(rawPath);
      const pinned = z.boolean().parse(rawPinned);
      await manager.setProjectPinned(path, pinned);
    },
    [CH.rootsSet]: async (_event, rawRoots) => {
      const roots = z.array(z.string()).parse(rawRoots);
      await manager.setRoots(roots);
      await manager.refresh();
    },
    [CH.settingsSet]: async (_event, rawPatch) => {
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
      if (patch.activity !== undefined) await manager.setActivity(patch.activity);
      await manager.refresh();
    },

    [CH.annotationGet]: async (_event, rawRef) => {
      const ref = RefSchema.parse(rawRef) as SkillRefLite;
      const record = manager.findRecord(ref.scope, ref.projectPath, ref.name);
      if (!record) return null;
      return manager.loadAnnotation(record);
    },
    [CH.annotationSave]: async (_event, rawRef, rawAnnotation) => {
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
    },

    [CH.searchRemote]: async (_event, rawQuery) => {
      const query = z.string().min(1).parse(rawQuery);
      return manager.searchRemote(query);
    },
    [CH.leaderboard]: async (_event, rawKind, rawPage) => {
      const kind = z.enum(['all-time', 'trending', 'hot']).parse(rawKind);
      const page = z.number().int().min(0).optional().parse(rawPage);
      return manager.fetchLeaderboard(kind, page ?? 0);
    },
    [CH.remoteSkillDetail]: async (_event, rawSlug) => {
      const slug = z.string().min(1).parse(rawSlug);
      return manager.getRemoteSkillDetail(slug);
    },
    [CH.evaluate]: async (_event, rawLocale) => {
      const locale = z.enum(['zh', 'en']).parse(rawLocale);
      await manager.runEvaluation(locale);
    },
    [CH.reviewCandidates]: async (_event, rawLocale) => {
      const locale = z.enum(['zh', 'en']).parse(rawLocale);
      await manager.runCandidateReview(locale);
    },
    [CH.testLlm]: async (_event, rawSettings) => {
      return manager.testLlm(LlmSchema.parse(rawSettings));
    },
    [CH.checkUpdate]: () => deps.checkUpdate(),
    [CH.openExternal]: async (_event, rawUrl) => {
      const url = z.string().url().parse(rawUrl);
      if (!/^https:\/\//i.test(url)) throw new Error('only https URLs can be opened');
      await deps.openExternal(url);
    },

    [CH.opStart]: async (_event, rawRequest) => {
      const request = OpSchema.parse(rawRequest) as OpStart;
      const op = createOp(manager, request);
      ops.set(op.id, op);
      void (async () => {
        let ok = false;
        try {
          try {
            for await (const line of op.lines) {
              broadcast(EVENTS.opEvent, { opId: op.id, line });
            }
          } catch {
            // stream failures are reflected in the final result
          }
          const result = await op.result;
          ok = result.ok;
          broadcast(EVENTS.opEvent, { opId: op.id, done: true, ok });
          await manager.refresh();
        } catch {
          // Always emit a terminal event and release the op, otherwise the
          // renderer's drawer would hang waiting for `done`.
          broadcast(EVENTS.opEvent, { opId: op.id, done: true, ok });
        } finally {
          ops.delete(op.id);
        }
      })();
      return { opId: op.id };
    },
    [CH.opCancel]: (_event, rawOpId) => {
      const opId = z.string().parse(rawOpId);
      ops.get(opId)?.cancel();
    },

    [CH.openSkill]: async (_event, rawRef) => {
      const ref = RefSchema.parse(rawRef) as SkillRefLite;
      const path = skillFilePath(manager, ref);
      if (!path) throw new Error(`skill not found: ${ref.name}`);
      await deps.openSkill(path);
    },
    [CH.revealSkill]: (_event, rawRef) => {
      const ref = RefSchema.parse(rawRef) as SkillRefLite;
      const record = manager.findRecord(ref.scope, ref.projectPath, ref.name);
      if (!record) throw new Error(`skill not found: ${ref.name}`);
      deps.revealSkill(record.path);
    },
    [CH.pickDirectory]: () => deps.pickDirectory(),
    [CH.configOpen]: async () => {
      await deps.openConfig(await manager.ensureConfigFile());
    },
    [CH.configReveal]: async () => {
      deps.revealConfig(await manager.ensureConfigFile());
    },
    [CH.configReload]: () => manager.reloadConfig(),
    [CH.doctor]: () => manager.doctor(),

    [CH.bridgesList]: () => manager.listBridges(),
    [CH.bridgesInstall]: async (_event, rawId) => {
      const id = z.string().min(1).parse(rawId);
      await manager.installBridge(id);
    },
    [CH.bridgesUninstall]: async (_event, rawId) => {
      const id = z.string().min(1).parse(rawId);
      await manager.uninstallBridge(id);
    },
    [CH.activityStats]: () => manager.activityStats(),
    [CH.activityEvents]: () => manager.activityEvents(),
    [CH.activityClear]: () => manager.clearActivity(),
  };

  for (const [channel, handler] of Object.entries(handlers)) {
    ipc.handle(channel, handler);
  }

  manager.onChange(() => broadcast(EVENTS.stateChanged, toSnapshot(manager, deps.appVersion)));
  manager.onEvaluationEvent((event) => broadcast(EVENTS.evaluationEvent, event));
  manager.onActivityEvent((events) => broadcast(EVENTS.activityEvent, events));
}
