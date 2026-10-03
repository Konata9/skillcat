/**
 * Skill detail container: a pinned identity header, a two-tab bar
 * (info / optimization) and a single scrollable panel. The selected tab is
 * controlled by the view so it can reset when the selection changes.
 */
import * as React from 'react';
import type { SkillOptimization, SkillRecord } from '@skillcat/core';
import { Sparkles } from 'lucide-react';
import { useI18n } from '@renderer/lib/i18n';
import { cn } from '@renderer/lib/utils';
import { SkillDetailHeader, type SkillDetailActions } from './SkillDetailHeader';
import { SkillInfoPanel } from './SkillInfoPanel';
import { SkillOptimizationPanel } from './SkillOptimizationPanel';

export type SkillDetailTab = 'info' | 'optimize';

export function SkillDetail({
  record,
  triggerCount,
  optimization,
  optimizing,
  optimizationError,
  llmConfigured,
  tab,
  onTabChange,
  onOptimize,
  onOpenSettings,
  ...actions
}: {
  record: SkillRecord;
  triggerCount?: number;
  optimization: SkillOptimization | null;
  optimizing: boolean;
  optimizationError: string | null;
  llmConfigured: boolean;
  tab: SkillDetailTab;
  onTabChange: (tab: SkillDetailTab) => void;
  onOptimize: (record: SkillRecord) => void;
  onOpenSettings: () => void;
} & SkillDetailActions): React.ReactElement {
  const { t } = useI18n();

  const tabs: Array<{ id: SkillDetailTab; label: string; icon?: React.ReactNode }> = [
    { id: 'info', label: t('detail.tab.info') },
    { id: 'optimize', label: t('detail.tab.optimize'), icon: <Sparkles className="size-3.5" /> },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SkillDetailHeader record={record} {...actions} />

      <div
        role="tablist"
        className="flex shrink-0 items-center gap-1 border-b border-border px-4 py-1.5"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              'focus-ring flex items-center gap-1 rounded border border-transparent px-2.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground',
              tab === item.id && 'border-input bg-secondary text-foreground',
            )}
          >
            {item.icon}
            {item.label}
            {item.id === 'optimize' && optimization ? (
              <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 text-[10px] text-primary tabular-nums">
                {optimization.suggestions.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'info' ? (
          <SkillInfoPanel record={record} triggerCount={triggerCount} />
        ) : (
          <SkillOptimizationPanel
            record={record}
            optimization={optimization}
            optimizing={optimizing}
            optimizationError={optimizationError}
            llmConfigured={llmConfigured}
            onOptimize={onOptimize}
            onOpenSettings={onOpenSettings}
          />
        )}
      </div>
    </div>
  );
}

export type { SkillDetailActions };
