import { describe, expect, it } from 'vitest';
import { annotationKey, recordKey } from '../keys.js';

describe('recordKey', () => {
  it('joins scope, project path and name with pipes', () => {
    expect(recordKey({ scope: 'global', name: 'alpha' })).toBe('global||alpha');
    expect(recordKey({ scope: 'project', projectPath: '/tmp/p', name: 'alpha' })).toBe(
      'project|/tmp/p|alpha',
    );
  });

  it('gives built-in skills a dedicated tier distinct from a user global skill', () => {
    expect(recordKey({ scope: 'global', name: 'skill-optimizer', builtin: true })).toBe(
      'builtin||skill-optimizer',
    );
    expect(recordKey({ scope: 'global', name: 'skill-optimizer', builtin: false })).toBe(
      'global||skill-optimizer',
    );
  });
});

describe('annotationKey', () => {
  it('appends the content hash so annotations expire with content changes', () => {
    expect(annotationKey({ scope: 'global', name: 'alpha', contentHash: 'abc123' })).toBe(
      'global||alpha|abc123',
    );
  });
});
