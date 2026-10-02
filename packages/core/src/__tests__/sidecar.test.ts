import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluationFilePath, stateFilePath, annotationsFilePath } from '../paths.js';
import { SidecarStore } from '../sidecar.js';

async function store(): Promise<{ dir: string; sidecar: SidecarStore }> {
  const dir = await mkdtemp(join(tmpdir(), 'skillcat-sidecar-'));
  return { dir, sidecar: new SidecarStore(dir) };
}

const goodSkill = { name: 'alpha', scope: 'global', path: '/tmp/alpha' };

describe('SidecarStore evaluation sanitization', () => {
  it('coerces invalid verdict fields and drops malformed entries', async () => {
    const { dir, sidecar } = await store();
    await writeFile(
      evaluationFilePath(dir),
      JSON.stringify({
        report: null,
        verdicts: [
          {
            skills: [goodSkill, { name: 'beta', scope: 'global', path: '/tmp/beta' }],
            kind: 'not-a-kind',
            verdict: 'nonsense',
            severity: 'critical',
            title: 'x',
            detail: 'y',
            suggestion: 42,
          },
          { skills: [goodSkill], kind: 'duplicate' },
          'not-an-object',
        ],
        verdictsAt: '2026-01-01T00:00:00.000Z',
        verdictsSignature: 'sig',
      }),
    );

    const loaded = await sidecar.loadEvaluation();
    expect(loaded?.verdicts).toHaveLength(1);
    expect(loaded?.verdicts[0]).toMatchObject({
      kind: 'duplicate',
      verdict: 'uncertain',
      severity: 'warn',
      suggestion: null,
    });
    expect(loaded?.verdicts[0]?.pairKey).toContain('global||alpha');
  });

  it('migrates legacy issue records to confirmed verdicts', async () => {
    const { dir, sidecar } = await store();
    await writeFile(
      evaluationFilePath(dir),
      JSON.stringify({
        generatedAt: '2025-01-01T00:00:00.000Z',
        provider: 'openai',
        model: 'gpt-4o',
        locale: 'en',
        signature: 'legacy-sig',
        summary: 'legacy',
        averageScore: 50,
        scores: [],
        issues: [
          {
            skills: [goodSkill, { name: 'beta', scope: 'global', path: '/tmp/beta' }],
            kind: 'conflict',
            severity: 'error',
            title: 't',
            detail: 'd',
          },
        ],
      }),
    );

    const loaded = await sidecar.loadEvaluation();
    expect(loaded?.verdicts).toHaveLength(1);
    expect(loaded?.verdicts[0]).toMatchObject({ kind: 'conflict', severity: 'error', verdict: 'confirmed' });
    expect(loaded?.verdictsSignature).toBe('legacy-sig');
  });
});

describe('SidecarStore malformed files', () => {
  it('falls back to empty state and annotations for non-object payloads', async () => {
    const { dir, sidecar } = await store();
    await writeFile(stateFilePath(dir), JSON.stringify([1, 2, 3]));
    await writeFile(annotationsFilePath(dir), JSON.stringify('nope'));

    expect(await sidecar.loadState()).toEqual({ hashes: {} });
    expect(await sidecar.loadAnnotations()).toEqual({});
  });

  it('returns null for a non-object evaluation file', async () => {
    const { dir, sidecar } = await store();
    await writeFile(evaluationFilePath(dir), JSON.stringify(42));
    expect(await sidecar.loadEvaluation()).toBeNull();
  });
});
