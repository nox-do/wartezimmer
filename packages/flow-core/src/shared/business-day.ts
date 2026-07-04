export type ResolveBusinessDay = (now?: Date) => string;

/** Default: UTC-Kalendertag. Host injiziert eigene Funktion via `createRuntime({ resolveBusinessDay })`. */
export const resolveBusinessDay: ResolveBusinessDay = (now = new Date()) => {
  return now.toISOString().slice(0, 10);
};
