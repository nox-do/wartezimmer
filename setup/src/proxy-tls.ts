import fs from 'node:fs';
import path from 'node:path';
import {
  PORTAL_STATIC_SURFACE_ROUTES,
  PORTAL_SURFACE_ROUTES,
  PORTAL_UI_SURFACE_ROUTES,
  type PortalSurfaceRoute,
  type TlsMode,
  type TlsStatus,
} from '@praxis-flow/server-shared';

export const GENERATED_CADDYFILE_MARKER = '# PRAXIS-FLOW-GENERATED LAN-TLS v3';

export const PROXY_TLS_HOST_PATH_ENV_KEYS = [
  'PROXY_HTTPS_PORT',
  'PROXY_CADDY_DATA_HOST_PATH',
  'PROXY_CADDY_CONFIG_HOST_PATH',
  'PROXY_CADDYFILE_HOST_PATH',
  'PROXY_ACME_DNS_CREDENTIALS_HOST_PATH',
  'PROXY_CERTS_HOST_PATH',
] as const;

export const PROXY_TLS_RUNTIME_ENV_KEYS = [
  ...PROXY_TLS_HOST_PATH_ENV_KEYS,
  'TLS_ACME_DIRECTORY',
  'TLS_ACME_DIRECTORY_URL',
  'TLS_ACME_DNS_API',
  'TLS_ACME_DNS_CREDENTIALS_SERVER_URL',
  'TLS_OPERATOR_ZONE',
  'TLS_DNS_RESOLVERS',
  'TLS_PEBBLE_ROOT_CA_PATH',
  'TLS_RUNTIME_FAKE',
  'TRUST_PROXY_HEADERS',
] as const;

export type ProxyTlsPaths = {
  root: string;
  caddyData: string;
  caddyConfig: string;
  caddyfile: string;
  acmeDnsCredentials: string;
  certs: string;
  customFullchain: string;
  customPrivateKey: string;
  operatorToken: string;
};

export function resolveProxyTlsPaths(installHome: string): ProxyTlsPaths {
  const root = path.join(installHome, 'state', 'tls');
  const certs = path.join(root, 'certs');
  return {
    root,
    caddyData: path.join(root, 'caddy-data'),
    caddyConfig: path.join(root, 'caddy-config'),
    caddyfile: path.join(root, 'Caddyfile'),
    acmeDnsCredentials: path.join(root, 'acme-dns.json'),
    certs,
    customFullchain: path.join(certs, 'fullchain.pem'),
    customPrivateKey: path.join(certs, 'private-key.pem'),
    operatorToken: path.join(root, 'operator-token'),
  };
}

export function ensureProxyTlsPaths(installHome: string): ProxyTlsPaths {
  const paths = resolveProxyTlsPaths(installHome);
  for (const directory of [paths.root, paths.caddyData, paths.caddyConfig, paths.certs]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  // The TLS overlay always mounts this path. Custom mode deliberately has no account,
  // but a regular empty JSON file avoids Docker turning a missing file into a directory.
  if (!fs.existsSync(paths.acmeDnsCredentials)) {
    writeSecretFileAtomically(paths.acmeDnsCredentials, '{}\n');
  }
  return paths;
}

/** Host-path env for TLS overlay. Does not create directories or files. */
export function resolveProxyTlsEnvUpdates(
  installHome: string,
  httpsPort = 443,
): Record<string, string> {
  const paths = resolveProxyTlsPaths(installHome);
  return {
    PROXY_HTTPS_PORT: String(httpsPort),
    PROXY_CADDY_DATA_HOST_PATH: paths.caddyData,
    PROXY_CADDY_CONFIG_HOST_PATH: paths.caddyConfig,
    PROXY_CADDYFILE_HOST_PATH: paths.caddyfile,
    PROXY_ACME_DNS_CREDENTIALS_HOST_PATH: paths.acmeDnsCredentials,
    PROXY_CERTS_HOST_PATH: paths.certs,
  };
}

export function buildProxyTlsEnvUpdates(
  installHome: string,
  httpsPort = 443,
): Record<string, string> {
  ensureProxyTlsPaths(installHome);
  return resolveProxyTlsEnvUpdates(installHome, httpsPort);
}

export function writeSecretFileAtomically(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath)) {
    // Credentials and custom PEM files may already be individual Docker bind
    // mounts. Keep their inode so the running container sees the new bytes.
    fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });
  } else {
    const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temporaryPath, content, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
  }
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o600);
  }
}

function caddyAcmeDirectory(env: Map<string, string>): string {
  const explicit = env.get('TLS_ACME_DIRECTORY_URL')?.trim();
  if (explicit) {
    try {
      const url = new URL(explicit);
      if ((url.protocol === 'http:' || url.protocol === 'https:') && !/[\s{}]/.test(explicit)) {
        return explicit;
      }
    } catch {
      // common error below
    }
    throw new Error('TLS_ACME_DIRECTORY_URL muss eine gültige http(s)-URL sein.');
  }
  const kind = env.get('TLS_ACME_DIRECTORY')?.trim().toLowerCase() || 'production';
  if (kind === 'staging') {
    return 'https://acme-staging-v02.api.letsencrypt.org/directory';
  }
  if (kind === 'pebble') {
    return 'https://pebble:14000/dir';
  }
  return 'https://acme-v02.api.letsencrypt.org/directory';
}

function tlsDirective(mode: TlsMode, env: Map<string, string>): string {
  if (mode === 'custom') {
    return '\ttls /certs/fullchain.pem /certs/private-key.pem';
  }
  const pebbleResolvers =
    (env.get('TLS_ACME_DIRECTORY')?.trim().toLowerCase() || '') === 'pebble'
      ? ['\t\t\tresolvers coredns:53']
      : [];
  return [
    '\ttls {',
    '\t\tissuer acme {',
    `\t\t\tdir ${caddyAcmeDirectory(env)}`,
    '\t\t\tdisable_http_challenge',
    '\t\t\tdisable_tlsalpn_challenge',
    '\t\t\tdns acmedns /run/secrets/acme-dns.json',
    ...pebbleResolvers,
    '\t\t}',
    '\t}',
  ].join('\n');
}

function escapeCaddyRegexp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function portalSurfacePathRegexp(pathTemplate: string): string {
  const segments = pathTemplate
    .split('/')
    .map((segment) => (segment.startsWith(':') ? '[^/]+' : escapeCaddyRegexp(segment)));
  return `^${segments.join('/')}$`;
}

export function portalApiCaddyMatcher(route: PortalSurfaceRoute, index: number): string[] {
  const name = `portalApi${index}`;
  const pathLine = route.path.includes(':')
    ? `\t\tpath_regexp ${name} ${portalSurfacePathRegexp(route.path)}`
    : `\t\tpath ${route.path}`;
  return [`\t@${name} {`, `\t\tmethod ${route.method}`, pathLine, '\t}'];
}

function portalRestrictedSite(
  status: TlsStatus,
  env: Map<string, string>,
  managedWildcard: string | null,
): string[] {
  const portalHostname = status.portalHostname;
  if (!portalHostname || !status.mode) return [];
  const siteAddress = managedWildcard ?? portalHostname;
  const uiPaths = PORTAL_UI_SURFACE_ROUTES.map((route) => route.path).join(' ');
  const staticPaths = PORTAL_STATIC_SURFACE_ROUTES.map((route) => route.path).join(' ');
  const apiMatchers = PORTAL_SURFACE_ROUTES.flatMap((route, index) => [
    ...portalApiCaddyMatcher(route, index),
    `\thandle @portalApi${index} {`,
    '\t\treverse_proxy app:8080',
    '\t}',
  ]);
  return [
    '',
    `https://${siteAddress}:444 {`,
    tlsDirective(status.mode, env),
    '\t@portalOrigin {',
    `\t\thost ${portalHostname}`,
    `\t\texpression {http.request.tls.server_name} == "${portalHostname}"`,
    '\t}',
    '\t@portalUi {',
    '\t\tmethod GET HEAD',
    `\t\tpath ${uiPaths}`,
    '\t}',
    '\t@portalStatic {',
    '\t\tmethod GET HEAD',
    `\t\tpath ${staticPaths}`,
    '\t}',
    '\thandle @portalOrigin {',
    '\t\thandle @portalUi {',
    '\t\t\treverse_proxy app:8080',
    '\t\t}',
    '\t\thandle @portalStatic {',
    '\t\t\treverse_proxy app:8080',
    '\t\t}',
    ...apiMatchers.map((line) => `\t${line}`),
    '\t\thandle {',
    '\t\t\trespond 404',
    '\t\t}',
    '\t}',
    '\thandle {',
    '\t\tabort',
    '\t}',
    '}',
  ];
}

/**
 * Generated runtime config. Before cutover port 80 remains the application; after
 * cutover it is redirect-only. A managed config requires an xcaddy image containing
 * github.com/caddy-dns/acmedns; the stock HTTP image remains valid for customer tests.
 */
export function generateTlsCaddyfile(status: TlsStatus, env: Map<string, string>): string {
  if (!status.hostname || !status.mode) {
    return `${GENERATED_CADDYFILE_MARKER}\n\n:80 {\n\treverse_proxy app:8080\n}\n`;
  }
  const staffHostname = status.staffHostname ?? status.hostname;
  const managedWildcard =
    status.mode === 'managed' ? (status.wildcardCertificateName ?? null) : null;
  const httpApplicationAction = status.cutoverApplied
    ? `redir https://${staffHostname}{uri} permanent`
    : 'reverse_proxy app:8080';
  const httpBlock = managedWildcard
    ? [
        ':80 {',
        `\t@staff host ${staffHostname}`,
        '\thandle @staff {',
        `\t\t${httpApplicationAction}`,
        '\t}',
        `\t@installationRoom host ${managedWildcard}`,
        '\thandle @installationRoom {',
        '\t\tabort',
        '\t}',
        '\thandle {',
        `\t\t${httpApplicationAction}`,
        '\t}',
        '}',
      ].join('\n')
    : `:80 {\n\t${httpApplicationAction}\n}`;
  const siteAddress = managedWildcard ?? staffHostname;
  const applicationHandlers = [
    '\t@setupTlsSse path /__praxis-flow/setup/tls-sse',
    '\thandle @setupTlsSse {',
    '\t\theader Content-Type "text/event-stream; charset=utf-8"',
    '\t\trespond "event: tick\\ndata: ok\\n\\n" 200',
    '\t}',
    '\thandle {',
    '\t\treverse_proxy app:8080',
    '\t}',
  ];
  const siteHandlers = managedWildcard
    ? [
        '\t@staff {',
        `\t\thost ${staffHostname}`,
        `\t\texpression {http.request.tls.server_name} == "${staffHostname}"`,
        '\t}',
        '\thandle @staff {',
        ...applicationHandlers.map((line) => `\t${line}`),
        '\t}',
        '\thandle {',
        '\t\tabort',
        '\t}',
      ]
    : applicationHandlers;
  return [
    GENERATED_CADDYFILE_MARKER,
    '',
    '{',
    '\tservers {',
    '\t\tprotocols h1 h2',
    '\t}',
    '\tauto_https disable_redirects',
    '}',
    '',
    httpBlock,
    '',
    'https://127.0.0.1 {',
    '\ttls internal',
    '\trespond /__praxis-flow/health "ok" 200',
    '}',
    '',
    `${siteAddress} {`,
    tlsDirective(status.mode, env),
    ...siteHandlers,
    '}',
    ...portalRestrictedSite(status, env, managedWildcard),
    '',
  ].join('\n');
}

export function writeGeneratedTlsCaddyfile(
  installHome: string,
  status: TlsStatus,
  env: Map<string, string>,
): string {
  const paths = ensureProxyTlsPaths(installHome);
  const content = generateTlsCaddyfile(status, env);
  if (fs.existsSync(paths.caddyfile)) {
    // Docker file bind-mounts keep referring to the original inode. Replacing the
    // path via rename would leave a running Caddy container on the old config.
    fs.writeFileSync(paths.caddyfile, content, 'utf8');
    return paths.caddyfile;
  }
  const temporaryPath = `${paths.caddyfile}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, paths.caddyfile);
  return paths.caddyfile;
}
