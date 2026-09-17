import type { ComposeStatus } from '@praxis-flow/server-shared';

export const runtimeAuditEnv = {
  PROXY_ENABLED: 'true',
  PROXY_MODE: 'tls-managed',
  APP_BIND_ADDRESS: '127.0.0.1',
  SETUP_LAN_APP_IP: '192.0.2.10',
  SETUP_RESTRICTED_ENABLED: 'true',
  SETUP_RESTRICTED_APP_IP: '192.0.2.20',
  SETUP_RESTRICTED_INTERFACE_ID: 'name:patient',
  TLS_MODE: 'managed',
  TLS_STATE: 'active',
  TLS_CUTOVER_APPLIED: 'true',
  TLS_INSTALLATION_ID: '7fk3m2q9',
  TLS_HOSTNAME: 'staff.installation.example',
  TLS_STAFF_HOSTNAME: 'staff.installation.example',
  TLS_PORTAL_HOSTNAME: 'portal.installation.example',
  TLS_INSTALLATION_DOMAIN: 'installation.example',
  TLS_WILDCARD_CERTIFICATE_NAME: '*.installation.example',
  CANONICAL_BASE_URL: 'https://staff.installation.example',
};

export const runtimeAuditInterfaces = () => [
  {
    name: 'staff',
    addresses: [
      { address: runtimeAuditEnv.SETUP_LAN_APP_IP, family: 'IPv4' as const, internal: false },
    ],
  },
  {
    name: 'patient',
    addresses: [
      {
        address: runtimeAuditEnv.SETUP_RESTRICTED_APP_IP,
        family: 'IPv4' as const,
        internal: false,
      },
    ],
  },
];

export function runtimeAuditCompose(restricted = true): ComposeStatus {
  return {
    running: true,
    services: [
      {
        name: 'app',
        service: 'app',
        state: 'running',
        health: 'healthy',
        publishedBindings: [
          { hostIp: '127.0.0.1', publishedPort: 8080, targetPort: 8080, protocol: 'tcp' },
          { hostIp: '127.0.0.1', publishedPort: 8082, targetPort: 8082, protocol: 'tcp' },
        ],
      },
      {
        name: 'sandbox',
        service: 'sandbox',
        state: 'running',
        health: 'healthy',
        publishedBindings: [],
      },
      {
        name: 'proxy',
        service: 'proxy',
        state: 'running',
        health: 'healthy',
        publishedBindings: [
          {
            hostIp: runtimeAuditEnv.SETUP_LAN_APP_IP,
            publishedPort: 80,
            targetPort: 80,
            protocol: 'tcp',
          },
          {
            hostIp: runtimeAuditEnv.SETUP_LAN_APP_IP,
            publishedPort: 443,
            targetPort: 443,
            protocol: 'tcp',
          },
          ...(restricted
            ? [
                {
                  hostIp: runtimeAuditEnv.SETUP_RESTRICTED_APP_IP,
                  publishedPort: 443,
                  targetPort: 444,
                  protocol: 'tcp',
                },
              ]
            : []),
        ],
      },
    ],
  };
}
