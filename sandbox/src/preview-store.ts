export type PreviewMode = 'interactive_pdf' | 'raster_fallback';
export type PreviewStatus = 'empty' | 'scanning' | 'ready' | 'blocked_malware' | 'render_error';

export type PreviewSession = {
  previewSessionId: string;
  documentId: string;
  status: PreviewStatus;
  previewMode: PreviewMode;
  embedUrl: string;
  sourcePath?: string;
  mimeType?: string;
  updatedAt: string;
};

export type PreviewStore = {
  get: (previewSessionId: string) => PreviewSession | undefined;
  set: (previewSessionId: string, session: PreviewSession) => void;
  delete: (previewSessionId: string) => void;
};

export function createPreviewStore(): PreviewStore {
  const sessions = new Map<string, PreviewSession>();
  return {
    get: (previewSessionId) => sessions.get(previewSessionId),
    set: (previewSessionId, session) => {
      sessions.set(previewSessionId, session);
    },
    delete: (previewSessionId) => {
      sessions.delete(previewSessionId);
    },
  };
}
