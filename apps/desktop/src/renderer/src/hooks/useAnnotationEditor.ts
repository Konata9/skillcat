/**
 * Annotation editing session: loads the sidecar annotation for a record,
 * saves (or clears) it and closes the editor. Success and failure reporting is
 * delegated to the caller so this hook stays free of UI copy.
 */
import { useCallback, useState } from 'react';
import type { Annotation, SkillRecord } from '@skillcat/core';
import type { SkillCatApi } from '@shared/contract';

export interface AnnotationEditorSession {
  record: SkillRecord;
  annotation: Annotation | null;
}

export interface AnnotationEditorController {
  editor: AnnotationEditorSession | null;
  open: (record: SkillRecord) => Promise<void>;
  save: (annotation: Annotation | null) => Promise<void>;
  close: () => void;
}

export function useAnnotationEditor(
  api: SkillCatApi,
  onSaved: () => void,
  onError: (error: unknown) => void,
): AnnotationEditorController {
  const [editor, setEditor] = useState<AnnotationEditorSession | null>(null);

  const open = useCallback(
    async (record: SkillRecord) => {
      const annotation = await api.getAnnotation({
        scope: record.scope,
        projectPath: record.projectPath,
        name: record.name,
      });
      setEditor({ record, annotation });
    },
    [api],
  );

  const save = useCallback(
    async (annotation: Annotation | null) => {
      if (!editor) return;
      setEditor(null);
      try {
        await api.saveAnnotation(
          {
            scope: editor.record.scope,
            projectPath: editor.record.projectPath,
            name: editor.record.name,
          },
          annotation,
        );
        onSaved();
      } catch (error) {
        onError(error);
      }
    },
    [api, editor, onSaved, onError],
  );

  const close = useCallback(() => setEditor(null), []);

  return { editor, open, save, close };
}
