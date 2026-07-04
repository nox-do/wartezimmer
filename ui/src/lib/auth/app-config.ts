function readEnv(name: string): string {
  return (import.meta.env[name] as string | undefined)?.trim() ?? '';
}

export type ClientConfig = {
  baseUrl: string;
};

export function getClientConfig(): ClientConfig {
  return { baseUrl: readEnv('VITE_API_BASE') };
}
