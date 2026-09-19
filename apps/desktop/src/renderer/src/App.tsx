/**
 * Application shell: wires the API-backed hooks to the presentational shell
 * components and views. Business state lives in `hooks/`, rendering lives in
 * `components/` and `views/`; this file only orchestrates them.
 */
import * as React from 'react';
import { useState } from 'react';
import type { ProjectInfo, RemoteSkill, SkillRecord, LlmSettings } from '@skillcat/core';
import type { OpStart } from '@shared/contract';
import { useApi, useSnapshot, useStatus } from './api';
import { AppNotices } from './components/AppNotices';
import { AppSidebar } from './components/AppSidebar';
import { AppToolbar } from './components/AppToolbar';
import { ConfirmFlows, type ConfirmState } from './components/ConfirmFlows';
import { OperationDrawer } from './components/OperationDrawer';
import { TriggerEditorModal } from './components/TriggerEditorModal';
import { useAnnotationEditor } from './hooks/useAnnotationEditor';
import { useOperations } from './hooks/useOperations';
import { useProjects } from './hooks/useProjects';
import { useScopes } from './hooks/useScopes';
import { errorMessage } from './lib/format';
import { useI18n } from './lib/i18n';
import type { Tab } from './lib/navigation';
import { ConflictsView } from './views/ConflictsView';
import { ProjectsView } from './views/ProjectsView';
import { SearchView } from './views/SearchView';
import { SettingsView } from './views/SettingsView';
import { SkillsView } from './views/SkillsView';

export function App(): React.ReactElement {
  const api = useApi();
  const snapshot = useSnapshot();
  const { status, showStatus } = useStatus();
  const { t, scopeLabel } = useI18n();
  const [tab, setTab] = useState<Tab>('skills');
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const { op, startOp, cancelOp, closeOp } = useOperations(api, (error) => {
    showStatus(t('status.opFailed', { message: errorMessage(error) }));
  });
  const { projects, reload: reloadProjects } = useProjects(api, snapshot?.scannedAt);
  const { scopes, scopeKey, setScopeKey, activeScope, records } = useScopes(snapshot, scopeLabel);
  const editor = useAnnotationEditor(
    api,
    () => showStatus(t('status.annotationSaved')),
    (error) => showStatus(t('status.saveFailed', { message: errorMessage(error) })),
  );

  const conflicts = snapshot?.findings ?? [];
  const navCounts: Record<Tab, string> = {
    skills: String(
      (snapshot?.global.length ?? 0) +
        (snapshot?.projects.reduce((sum, project) => sum + project.records.length, 0) ?? 0),
    ),
    conflicts: String(conflicts.length),
    projects: String(projects.length),
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

  const pinProject = (project: ProjectInfo) => {
    void api.setProjectPinned(project.path, !project.pinned).then(reloadProjects);
  };

  const addProject = () => {
    void api.pickDirectory().then(async (path) => {
      if (!path) return;
      await api.addProject(path);
      await reloadProjects();
      showStatus(t('status.projectAdded', { path }));
    });
  };

  const rescanProjects = () => {
    void api.refresh().then(async () => {
      await reloadProjects();
      showStatus(t('status.projectsRescanned'));
    });
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
  }): Promise<void> => {
    try {
      await api.setSettings({
        skillsCommand: patch.skillsCommand,
        proxy: patch.proxy,
        thresholds: patch.thresholds,
        showInternal: patch.showInternal,
        customSkillDirs: patch.customSkillDirs,
        llm: patch.llm,
      });
      await api.setRoots(patch.roots);
      showStatus(t('status.settingsSaved'));
    } catch (error) {
      showStatus(t('status.saveFailed', { message: errorMessage(error) }));
    }
  };

  const selectScope = (key: string) => {
    setScopeKey(key);
    setTab('skills');
  };

  return (
    <div className="grid h-screen grid-rows-1 grid-cols-[232px_1fr] overflow-hidden">
      <AppSidebar
        tab={tab}
        onSelectTab={setTab}
        navCounts={navCounts}
        scopes={scopes}
        scopeKey={scopeKey}
        onSelectScope={selectScope}
        snapshot={snapshot}
        conflictCount={conflicts.length}
      />

      <main className="flex min-w-0 flex-col">
        <AppToolbar
          tab={tab}
          scopeLabel={activeScope.label}
          recordCount={records.length}
          onRefresh={() => void api.refresh()}
          onDeepRefresh={() => void api.refresh({ deep: true })}
          onUpdateAll={() => setConfirmState({ kind: 'update-all' })}
        />

        <AppNotices
          cliAvailable={snapshot?.cliAvailable ?? false}
          cliError={snapshot?.cliError}
          showNoRoots={
            snapshot !== null &&
            snapshot.config.roots.length === 0 &&
            snapshot.projects.length === 0
          }
          onGoToSettings={() => setTab('settings')}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          {tab === 'skills' ? (
            <SkillsView
              records={records}
              onOpen={openSkill}
              onReveal={revealSkill}
              onEditTriggers={(record) => void editor.open(record)}
              onUpdate={(record) => setConfirmState({ kind: 'update', record })}
              onRemove={(record) => setConfirmState({ kind: 'remove', record })}
            />
          ) : null}
          {tab === 'conflicts' ? <ConflictsView findings={conflicts} /> : null}
          {tab === 'projects' ? (
            <ProjectsView
              projects={projects}
              onPin={pinProject}
              onRemove={(project) => setConfirmState({ kind: 'project-remove', project })}
              onAdd={addProject}
              onRescan={rescanProjects}
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
              cliAvailable={snapshot.cliAvailable}
              cliSource={snapshot.cliSource}
              cliError={snapshot.cliError}
              onStatus={showStatus}
              onSave={saveSettings}
              onTestLlm={api.testLlm}
              onPickDirectory={() => api.pickDirectory()}
              onOpenConfig={() =>
                api.openConfig().catch((error) => {
                  showStatus(t('status.opFailed', { message: errorMessage(error) }));
                })
              }
              onRevealConfig={() => api.revealConfig()}
              onReloadConfig={() =>
                api
                  .reloadConfig()
                  .then(() => showStatus(t('status.configReloaded')))
                  .catch((error) => {
                    showStatus(t('status.opFailed', { message: errorMessage(error) }));
                  })
              }
              onDoctor={() => api.doctor()}
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
