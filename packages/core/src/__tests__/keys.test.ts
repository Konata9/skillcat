import { describe, expect, it } from 'vitest';
import { annotationKey, recordKey } from '../keys.js';

describe('recordKey', () => {
  it('joins scope, project path and name with pipes', () => {
    expect(recordKey({ scope: 'global', name: 'alpha' })).toBe('global||alpha');
    expect(recordKey({ scope: 'project', projectPath: '/tmp/p', name: 'alpha' })).toBe(
      'project|/tmp/p|alpha',
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
