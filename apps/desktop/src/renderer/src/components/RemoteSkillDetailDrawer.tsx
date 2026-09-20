// deslop-ignore-file 34: 抽屉展示 SKILL.md 原始正文与命令，等宽字体是内容本身的要求
import * as React from 'react';
import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { RemoteSkill, RemoteSkillDetail } from '@skillcat/core';
import { Check, Copy, Download, ExternalLink, X } from 'lucide-react';
import { useApi } from '@renderer/api';
import { errorMessage, formatInstalls } from '@renderer/lib/format';
import { useI18n } from '@renderer/lib/i18n';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="mt-5">
      <h3 className="section-label mb-1.5">{title}</h3>
      {children}
    </section>
  );
}

export function RemoteSkillDetailDrawer({
  skill,
  onInstall,
  onClose,
}: {
  skill: RemoteSkill | null;
  onInstall: (skill: RemoteSkill) => void;
  onClose: () => void;
}): React.ReactElement {
  const api = useApi();
  const { t } = useI18n();
  const [detail, setDetail] = useState<RemoteSkillDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const slug = skill?.slug ?? null;
  useEffect(() => {
    if (!slug) {
      setDetail(null);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    setDetail(null);
    setError(null);
    setLoading(true);
    api
      .remoteSkillDetail(slug)
      .then((value) => {
        if (active) setDetail(value);
      })
      .catch((loadError) => {
        if (active) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, slug]);

  const openExternal = (url: string) => {
    void api.openExternal(url).catch(() => {});
  };

  const copyCommand = async () => {
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(detail.installCommand);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable; the command stays selectable
    }
  };

  return (
    <DialogPrimitive.Root open={skill !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-[overlay-in_120ms_ease-out]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[600px] flex-col border-l border-border bg-card shadow-lg outline-none data-[state=open]:animate-[drawer-in_180ms_ease-out]"
        >
          <div className="flex items-start gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="truncate text-[15px] font-semibold">
                {skill?.name ?? ''}
              </DialogPrimitive.Title>
              {skill ? (
                <button
                  type="button"
                  className="focus-ring mt-0.5 block max-w-full truncate rounded-sm font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => openExternal(`https://skills.sh/${skill.slug}`)}
                >
                  {skill.source}
                </button>
              ) : null}
            </div>
            <DialogPrimitive.Close className="focus-ring rounded-sm p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <X className="size-4" />
              <span className="sr-only">{t('common.close')}</span>
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-6">
            <div className="flex flex-wrap items-center gap-1.5">
              {skill?.isOfficial ? <Badge tone="accent">{t('search.official')}</Badge> : null}
              <Badge>
                <Download className="size-3" />
                {formatInstalls(skill?.installs ?? 0) || '—'}
              </Badge>
            </div>

            {loading ? (
              <div className="px-5 py-10 text-center text-muted-foreground">
                {t('search.loading')}
              </div>
            ) : null}
            {error ? (
              <div className="mt-4 text-destructive">
                {t('search.detailError', { message: error })}
              </div>
            ) : null}

            {detail ? (
              <>
                <Section title={t('search.detailInstall')}>
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-1.5">
                    <code className="min-w-0 flex-1 truncate font-mono text-[11px]">
                      {detail.installCommand}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={copied ? t('search.detailCopied') : t('search.detailCopy')}
                      title={copied ? t('search.detailCopied') : t('search.detailCopy')}
                      onClick={() => void copyCommand()}
                    >
                      {copied ? <Check /> : <Copy />}
                    </Button>
                  </div>
                </Section>

                {detail.description ? (
                  <Section title={t('search.detailDescription')}>
                    <p className="max-w-[65ch] text-muted-foreground">{detail.description}</p>
                  </Section>
                ) : null}

                <Section title="SKILL.md">
                  <pre className="overflow-x-auto rounded-md border border-border bg-card p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                    {detail.body}
                  </pre>
                </Section>

                {detail.files.length > 1 ? (
                  <Section title={t('search.detailFiles', { count: detail.files.length })}>
                    <ul className="flex flex-col gap-0.5 font-mono text-[11px] text-muted-foreground">
                      {detail.files.map((file) => (
                        <li key={file.path} className="truncate">
                          {file.path}
                        </li>
                      ))}
                    </ul>
                  </Section>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={!skill}
              onClick={() => skill && openExternal(`https://skills.sh/${skill.slug}`)}
            >
              <ExternalLink />
              {t('search.detailViewSource')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!skill}
              onClick={() => skill && onInstall(skill)}
            >
              <Download />
              {t('search.detailInstallAction')}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
