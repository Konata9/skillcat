/**
 * Confirmation dialogs for destructive or long-running actions (remove,
 * update, update-all, install, unregister project). The component only
 * renders; the actual work is delegated to the injected callbacks.
 */
import * as React from 'react';
import { useState } from 'react';
import type { AddTarget, ProjectInfo, RemoteSkill, Scope, SkillRecord } from '@skillcat/core';
import { Check } from 'lucide-react';
import type { OpStart } from '@shared/contract';
import { useI18n } from '@renderer/lib/i18n';
import { cn } from '@renderer/lib/utils';
import type { ScopeOption } from '@renderer/hooks/useScopes';
import { ConfirmDialog } from './ConfirmDialog';

export type ConfirmState =
  | { kind: 'remove'; record: SkillRecord }
  | { kind: 'update'; record: SkillRecord }
  | { kind: 'update-all' }
  | { kind: 'install'; skill: RemoteSkill }
  | { kind: 'reevaluate'; generatedAt: string | null }
  | { kind: 'project-remove'; project: ProjectInfo };

export function ConfirmFlows({
  state,
  activeScope,
  scopes,
  onStartOp,
  onRemoveProject,
  onReevaluate,
  onClose,
}: {
  state: ConfirmState;
  activeScope: ScopeOption;
  scopes: ScopeOption[];
  onStartOp: (request: OpStart) => Promise<void>;
  onRemoveProject: (project: ProjectInfo) => Promise<void>;
  onReevaluate: () => void;
  onClose: () => void;
}): React.ReactElement {
  const { t, scopeLabel, relativeTime } = useI18n();

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
        <InstallDialog
          skill={state.skill}
          activeScope={activeScope}
          scopes={scopes}
          onStartOp={onStartOp}
          onClose={onClose}
        />
      );
    case 'reevaluate':
      return (
        <ConfirmDialog
          title={t('confirm.reevaluate.title')}
          confirmLabel={t('confirm.reevaluate.confirm')}
          onClose={onClose}
          onConfirm={onReevaluate}
        >
          <p>{t('confirm.reevaluate.body', { time: relativeTime(state.generatedAt) })}</p>
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

function ScopeChoice({
  selected,
  disabled,
  label,
  hint,
  onSelect,
}: {
  selected: boolean;
  disabled?: boolean;
  label: string;
  hint: string;
  onSelect: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'focus-ring flex flex-1 flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        selected ? 'border-primary bg-primary/10' : 'border-input enabled:hover:border-primary/60',
      )}
    >
      <span className="font-medium">{label}</span>
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    </button>
  );
}

function TargetRow({
  checked,
  label,
  hint,
  onToggle,
}: {
  checked: boolean;
  label: string;
  hint: string;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={cn(
        'focus-ring flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors',
        checked ? 'border-primary bg-primary/10' : 'border-input hover:border-primary/60',
      )}
    >
      <span
        className={cn(
          'flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
        )}
      >
        {checked ? <Check className="size-3" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

/**
 * Install confirmation. Global vs Project mirrors the `npx skills add` scope
 * prompt; picking Project reveals a multi-select list of registered projects so
 * several can be installed to at once, without first selecting one in the
 * sidebar. Project is disabled when there are no projects.
 */
function InstallDialog({
  skill,
  activeScope,
  scopes,
  onStartOp,
  onClose,
}: {
  skill: RemoteSkill;
  activeScope: ScopeOption;
  scopes: ScopeOption[];
  onStartOp: (request: OpStart) => Promise<void>;
  onClose: () => void;
}): React.ReactElement {
  const { t } = useI18n();
  const projects = scopes.filter((scope) => scope.path !== null);
  const [mode, setMode] = useState<Scope>(activeScope.path ? 'project' : 'global');
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
    () => new Set(activeScope.path ? [activeScope.key] : []),
  );
  const packageName = `${skill.source}@${skill.name}`;

  const toggleProject = (key: string) => {
    setSelectedProjects((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const targets: AddTarget[] =
    mode === 'global'
      ? [{ scope: 'global' }]
      : projects
          .filter((project) => project.path && selectedProjects.has(project.key))
          .map((project) => ({ scope: 'project', cwd: project.path! }));

  return (
    <ConfirmDialog
      title={t('confirm.install.title')}
      confirmLabel={t('confirm.install.confirm')}
      confirmDisabled={targets.length === 0}
      onClose={onClose}
      onConfirm={() =>
        void onStartOp({
          kind: 'add',
          source: packageName,
          targets,
          title: `${t('confirm.install.confirm')} ${skill.name}`,
        })
      }
    >
      <p>{t('confirm.install.body', { package: packageName })}</p>
      <div className="flex flex-col gap-1.5">
        <span className="section-label">{t('confirm.install.scopeLabel')}</span>
        <div className="flex gap-1.5">
          <ScopeChoice
            selected={mode === 'global'}
            label={t('confirm.install.scopeGlobal')}
            hint={t('confirm.install.scopeGlobalHint')}
            onSelect={() => setMode('global')}
          />
          <ScopeChoice
            selected={mode === 'project'}
            disabled={projects.length === 0}
            label={t('confirm.install.scopeProject')}
            hint={
              projects.length > 0
                ? t('confirm.install.scopeProjectHint')
                : t('confirm.install.scopeProjectUnavailable')
            }
            onSelect={() => setMode('project')}
          />
        </div>
        {mode === 'project' && projects.length > 0 ? (
          <div className="flex max-h-52 flex-col gap-1 overflow-y-auto">
            {projects.map((project) => (
              <TargetRow
                key={project.key}
                checked={selectedProjects.has(project.key)}
                label={project.label}
                hint={project.path ?? ''}
                onToggle={() => toggleProject(project.key)}
              />
            ))}
          </div>
        ) : null}
        {mode === 'project' && targets.length === 0 ? (
          <span className="text-[11px] text-destructive">{t('confirm.install.noTargets')}</span>
        ) : null}
      </div>
    </ConfirmDialog>
  );
}
