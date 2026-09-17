/**
 * Confirmation dialogs for destructive or long-running actions (remove,
 * update, update-all, install, unregister project). The component only
 * renders; the actual work is delegated to the injected callbacks.
 */
import * as React from 'react';
import type { ProjectInfo, RemoteSkill, SkillRecord } from '@skillman/core';
import type { OpStart } from '@shared/contract';
import { useI18n } from '@renderer/lib/i18n';
import type { ScopeOption } from '@renderer/hooks/useScopes';
import { ConfirmDialog } from './ConfirmDialog';

export type ConfirmState =
  | { kind: 'remove'; record: SkillRecord }
  | { kind: 'update'; record: SkillRecord }
  | { kind: 'update-all' }
  | { kind: 'install'; skill: RemoteSkill }
  | { kind: 'project-remove'; project: ProjectInfo };

export function ConfirmFlows({
  state,
  activeScope,
  onStartOp,
  onRemoveProject,
  onClose,
}: {
  state: ConfirmState;
  activeScope: ScopeOption;
  onStartOp: (request: OpStart) => Promise<void>;
  onRemoveProject: (project: ProjectInfo) => Promise<void>;
  onClose: () => void;
}): React.ReactElement {
  const { t, scopeLabel } = useI18n();

  switch (state.kind) {
    case 'remove':
      return (
        <ConfirmDialog
          title={t('confirm.removeSkill.title')}
          confirmLabel={t('confirm.removeSkill.confirm')}
          danger
          onClose={onClose}
          onConfirm={() =>
            void onStartOp({
              kind: 'remove',
              name: state.record.name,
              scope: state.record.scope,
              cwd: state.record.projectPath,
              title: `${t('confirm.removeSkill.confirm')} ${state.record.name}`,
            })
          }
        >
          <p>
            {t('confirm.removeSkill.body', {
              name: state.record.name,
              scope: scopeLabel(state.record.scope, state.record.projectPath),
            })}
          </p>
          {/* deslop-ignore-next-line 34: 磁盘路径是数据值 */}
          <p className="font-mono text-[11px] text-muted-foreground">{state.record.path}</p>
        </ConfirmDialog>
      );
    case 'update':
      return (
        <ConfirmDialog
          title={t('confirm.update.title')}
          confirmLabel={t('confirm.update.confirm')}
          onClose={onClose}
          onConfirm={() =>
            void onStartOp({
              kind: 'update',
              names: [state.record.name],
              scope: state.record.scope,
              cwd: state.record.projectPath,
              title: `${t('confirm.update.confirm')} ${state.record.name}`,
            })
          }
        >
          <p>{t('confirm.update.body', { name: state.record.name })}</p>
          {state.record.source ? (
            <p className="text-muted-foreground">
              {t('confirm.update.source', { source: state.record.source })}
            </p>
          ) : (
            <p className="text-warning">{t('confirm.update.noLock')}</p>
          )}
        </ConfirmDialog>
      );
    case 'update-all':
      return (
        <ConfirmDialog
          title={t('confirm.updateAll.title')}
          confirmLabel={t('confirm.update.confirm')}
          onClose={onClose}
          onConfirm={() =>
            void onStartOp({
              kind: 'update',
              names: [],
              scope: activeScope.path ? 'project' : 'global',
              cwd: activeScope.path ?? undefined,
              title: `${t('confirm.updateAll.title')} · ${activeScope.label}`,
            })
          }
        >
          <p>{t('confirm.updateAll.body', { label: activeScope.label })}</p>
        </ConfirmDialog>
      );
    case 'install':
      return (
        <ConfirmDialog
          title={t('confirm.install.title')}
          confirmLabel={t('confirm.install.confirm')}
          onClose={onClose}
          onConfirm={() =>
            void onStartOp({
              kind: 'add',
              source: `${state.skill.source}@${state.skill.name}`,
              scope: activeScope.path ? 'project' : 'global',
              cwd: activeScope.path ?? undefined,
              title: `${t('confirm.install.confirm')} ${state.skill.name}`,
            })
          }
        >
          <p>
            {t('confirm.install.body', {
              package: `${state.skill.source}@${state.skill.name}`,
              label: activeScope.label,
            })}
          </p>
        </ConfirmDialog>
      );
    case 'project-remove':
      return (
        <ConfirmDialog
          title={t('confirm.projectRemove.title')}
          confirmLabel={t('confirm.projectRemove.confirm')}
          danger
          onClose={onClose}
          onConfirm={() => void onRemoveProject(state.project)}
        >
          <p>{t('confirm.projectRemove.body', { name: state.project.name })}</p>
        </ConfirmDialog>
      );
  }
}
