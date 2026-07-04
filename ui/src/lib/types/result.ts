export type Result<T> =
  | { ok: true; data: T; error?: never }
  | {
      ok: false;
      data?: never;
      error: { message: string; code?: string; details?: unknown; status?: number };
    };

export type SimpleResult =
  | { ok: true; error?: never }
  | { ok: false; error: { message: string; code?: string; details?: unknown; status?: number } };
