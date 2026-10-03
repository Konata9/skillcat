/**
 * Application shell: wires the API-backed hooks to the presentational shell
 * components and views. Business state lives in `hooks/`, rendering lives in
 * `components/` and `views/`; this file only orchestrates them.
 */
import * as React from 'react';
import { useEffect, useState } from 'react';
import type { ProjectInfo, RemoteSkill, SkillRecord, LlmSettings, ActivitySettings } from '@skillcat/core';
import { isLlmConfigured } from '@skillcat/core/llm';
import type { OpStart } from '@shared/contract';
import { useApi, useSnapshot, useStatus } from './api';
import { AppNotices } from './components/AppNotices';
import { AppSidebar } from './components/AppSidebar';
import { AppToolbar } from './components/AppToolbar';
import { ConfirmFlows, type ConfirmState } from './components/ConfirmFlows';
import { GlobalProgress } from './components/GlobalProgress';
import { OperationDrawer } from './components/OperationDrawer';
import { TriggerEditorModal } from './components/TriggerEditorModal';
import { useAnnotationEditor } from './hooks/useAnnotationEditor';
import { useActivity } from './hooks/useActivity';
import { useBridges } from './hooks/useBridges';
import { useEvaluationLog } from './hooks/useEvaluationLog';
import { useOperations } from './hooks/useOperations';
import { useProjects } from './hooks/useProjects';
import { useReportError } from './hooks/useReportError';
import { useScopes } from './hooks/useScopes';
import { errorMessage } from './lib/format';
import { useI18n } from './lib/i18n';
import type { Tab } from './lib/navigation';
import { ActivityView } from './views/ActivityView';
import { AnalysisView } from './views/AnalysisView';
import { SearchView } from './views/SearchView';
import { SettingsView, type SettingsCategory } from './views/SettingsView';
import { SkillsView } from './views/SkillsView';

export function App(): React.ReactElement {
  const api = useApi();
  const snapshot = useSnapshot();
  const { status, showStatus } = useStatus();
  const { t, scopeLabel, locale } = useI18n();
  const [tab, setTab] = useState<Tab>('skills');
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>('general');

  const openSettings = (category: SettingsCategory = 'general') => {
    setSettingsCategory(category);
    setTab('settings');
  };

  // Cmd/Ctrl+, opens Settings, matching the platform convention.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ',') {
        event.preventDefault();
        setSettingsCategory('general');
        setTab('settings');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const reportError = useReportError(showStatus);
  const { op, startOp, cancelOp, closeOp } = useOperations(api, reportError);
  const evaluationLog = useEvaluationLog(api);
  const activity = useActivity(api, snapshot?.scannedAt ?? null);
  const { bridges } = useBridges(api);
  const { projects, reload: reloadProjects } = useProjects(api, snapshot?.scannedAt);
  const { scopes, scopeKey, setScopeKey, activeScope, records } = useScopes(
    snapshot,
    scopeLabel,
    projects,
  );
  const editor = useAnnotationEditor(
    api,
    () => showStatus(t('status.annotationSaved')),
    (error) => showStatus(t('status.saveFailed', { message: errorMessage(error) })),
  );

  const globalLoading = snapshot === null || snapshot.loading;
  const llmConfigured = snapshot !== null && isLlmConfigured(snapshot.config.llm);
  const evaluating = snapshot?.evaluating ?? false;
  const reviewing = snapshot?.reviewing ?? false;
  const findings = snapshot?.findings ?? [];
  const navCounts: Record<Tab, string> = {
    skills: String(
      (snapshot?.global.length ?? 0) +
        (snapshot?.projects.reduce((sum, project) => sum + project.records.length, 0) ?? 0),
    ),
    analysis: String(findings.length),
    activity:
      activity.stats && activity.stats.total > 0 ? String(activity.stats.total) : '',
    search: '',
    settings: '',
  };

  const startOpFromConfirm = async (request: OpStart) => {
    setConfirmState(null);
    await startOp(request);
  };

  const removeProject = async (project: ProjectInfo) => {
    await api.removeProject(project.path);
    setConfirmState(null);
    showStatus(t('status.projectRemoved'));
  };

  const pinProject = (path: string, pinned: boolean) => {
    void api.setProjectPinned(path, pinned).then(reloadProjects);
  };

  const unregisterProject = (path: string) => {
    const project = projects.find((entry) => entry.path === path);
    if (project) setConfirmState({ kind: 'project-remove', project });
  };

  const addProject = () => {
    void api.pickDirectory().then(async (path) => {
      if (!path) return;
      await api.addProject(path);
      await reloadProjects();
      showStatus(t('status.projectAdded', { path }));
    });
  };

  const runEvaluation = () => {
    void api.evaluate(locale).catch(reportError);
  };

  const requestEvaluate = () => {
    if (snapshot?.evaluation) {
      setConfirmState({ kind: 'reevaluate', generatedAt: snapshot.evaluation.generatedAt });
    } else {
      runEvaluation();
    }
  };

  const reviewCandidates = () => {
    void api.reviewCandidates(locale).catch(reportError);
  };

  const openSkill = (record: SkillRecord) =>
    void api.openSkill({
      scope: record.scope,
      projectPath: record.projectPath,
      name: record.name,
    });

  const revealSkill = (record: SkillRecord) =>
    void api.revealSkill({
      scope: record.scope,
      projectPath: record.projectPath,
      name: record.name,
    });

  const saveSettings = async (patch: {
    roots: string[];
    proxy: { url: string; bypass: string };
    thresholds: { overlap: number; duplicate: number };
    skillsCommand: string[] | null;
    showInternal: boolean;
    customSkillDirs: string[];
    llm: LlmSettings;
    activity: ActivitySettings;
  }): Promise<boolean> => {
    try {
      await api.setSettings({
        skillsCommand: patch.skillsCommand,
        proxy: patch.proxy,
        thresholds: patch.thresholds,
        showInternal: patch.showInternal,
        customSkillDirs: patch.customSkillDirs,
        llm: patch.llm,
        activity: patch.activity,
      });
      await api.setRoots(patch.roots);
      showStatus(t('status.settingsSaved'));
      return true;
    } catch (error) {
      showStatus(t('status.saveFailed', { message: errorMessage(error) }));
      return false;
    }
  };

  const selectScope = (key: string) => {
    setScopeKey(key);
    setTab('skills');
  };

  return (
    <div className="grid h-screen grid-rows-1 grid-cols-[232px_1fr] overflow-hidden">
      <GlobalProgress active={globalLoading} />
      <AppSidebar
        tab={tab}
        onSelectTab={(next) => (next === 'settings' ? openSettings() : setTab(next))}
        navCounts={navCounts}
        scopes={scopes}
        scopeKey={scopeKey}
        onSelectScope={selectScope}
        onTogglePin={pinProject}
        onAddProject={addProject}
        onUnregister={unregisterProject}
        snapshot={snapshot}
        analysisCount={findings.length}
      />

      <main className="flex min-w-0 flex-col">
        <AppToolbar
          tab={tab}
          scopeLabel={activeScope.label}
          recordCount={records.length}
          refreshing={snapshot?.loading ?? false}
          onRefresh={() => void api.refresh()}
          onDeepRefresh={() => void api.refresh({ deep: true })}
          onUpdateAll={() => setConfirmState({ kind: 'update-all' })}
          onEvaluate={requestEvaluate}
          evaluateDisabled={!llmConfigured || evaluating || reviewing}
          evaluating={evaluating}
          evaluateProgress={snapshot?.evaluationProgress ?? null}
          onReviewCandidates={reviewCandidates}
          reviewDisabled={!llmConfigured || evaluating || reviewing}
          reviewing={reviewing}
        />

        <AppNotices
          cliAvailable={snapshot?.cliAvailable ?? false}
          cliError={snapshot?.cliError}
          showNoRoots={
            snapshot !== null &&
            snapshot.config.roots.length === 0 &&
            snapshot.projects.length === 0
          }
          onGoToSettings={() => openSettings()}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          {tab === 'skills' ? (
            <SkillsView
              records={records}
              activityCounts={snapshot?.activityCounts}
              onOpen={openSkill}
              onReveal={revealSkill}
              onEditTriggers={(record) => void editor.open(record)}
              onUpdate={(record) => setConfirmState({ kind: 'update', record })}
              onRemove={(record) => setConfirmState({ kind: 'remove', record })}
            />
          ) : null}
          {tab === 'activity' ? (
            <ActivityView
              events={activity.events}
              stats={activity.stats}
              configured={bridges.some((bridge) => bridge.installed)}
              onConfigure={() => openSettings('integrations')}
              onClear={async () => {
                await api.clearActivity();
                await activity.reload();
                showStatus(t('settings.activityCleared'));
              }}
            />
          ) : null}
          {tab === 'analysis' ? (
            <AnalysisView
              findings={findings}
              evaluation={snapshot?.evaluation ?? null}
              evaluationStale={snapshot?.evaluationStale ?? false}
              verdictsAt={snapshot?.verdictsAt ?? null}
              verdictsStale={snapshot?.verdictsStale ?? false}
              evaluating={evaluating}
              reviewing={reviewing}
              evaluationProgress={snapshot?.evaluationProgress ?? null}
              evaluationError={snapshot?.evaluationError ?? null}
              processEvents={evaluationLog.events}
            />
          ) : null}
          {tab === 'search' ? (
            <SearchView
              onSearch={api.searchRemote}
              onLeaderboard={api.leaderboard}
              onInstall={(skill: RemoteSkill) => setConfirmState({ kind: 'install', skill })}
            />
          ) : null}
          {tab === 'settings' && snapshot ? (
            <SettingsView
              config={snapshot.config}
              configPath={snapshot.configPath}
              appVersion={snapshot.version}
              cliAvailable={snapshot.cliAvailable}
              cliSource={snapshot.cliSource}
              cliError={snapshot.cliError}
              initialCategory={settingsCategory}
              onStatus={showStatus}
              onSave={saveSettings}
              onTestLlm={api.testLlm}
              onCheckUpdate={api.checkUpdate}
              onOpenExternal={api.openExternal}
              onPickDirectory={() => api.pickDirectory()}
              onOpenConfig={() => api.openConfig().catch(reportError)}
              onRevealConfig={() => api.revealConfig()}
              onReloadConfig={() =>
                api
                  .reloadConfig()
                  .then(() => showStatus(t('status.configReloaded')))
                  .catch(reportError)
              }
              onDoctor={() => api.doctor()}
              onListBridges={() => api.listBridges()}
              onInstallBridge={(id) => api.installBridge(id)}
              onUninstallBridge={(id) => api.uninstallBridge(id)}
            />
          ) : null}
        </div>

        {op ? (
          <OperationDrawer op={op} onCancel={cancelOp} onClose={closeOp} />
        ) : (
          <div className="flex shrink-0 items-center gap-2.5 border-t border-border bg-card px-3.5 py-1.5 text-muted-foreground">
            <span>{status ?? t('app.ready')}</span>
          </div>
        )}
      </main>

      {confirmState ? (
        <ConfirmFlows
          state={confirmState}
          activeScope={activeScope}
          scopes={scopes}
          onStartOp={startOpFromConfirm}
          onRemoveProject={removeProject}
          onReevaluate={() => {
            setConfirmState(null);
            runEvaluation();
          }}
          onClose={() => setConfirmState(null)}
        />
      ) : null}
      {editor.editor ? (
        <TriggerEditorModal
          record={editor.editor.record}
          annotation={editor.editor.annotation}
          onSave={(annotation) => void editor.save(annotation)}
          onClose={editor.close}
        />
      ) : null}
    </div>
  );
}
