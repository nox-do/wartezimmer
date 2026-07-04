#!/usr/bin/env node
import * as p from '@clack/prompts';
import { applySetupPlan, getHostStatus } from './host-state.js';
import { canRunGatewayCompose, dockerInstallHints, detectDocker } from './docker.js';
import { listLanIpv4Candidates, listNetworkInterfaces } from './network.js';
import { resolveSetupContext } from './setup-context.js';
import { buildDeviceUrls } from './urls.js';

function isCancel<T>(value: T | symbol): value is symbol {
  return typeof value === 'symbol';
}

async function main() {
  p.intro('Praxis Flow — Einrichtung (Host)');

  const ctx = resolveSetupContext();
  p.log.message(`Install: ${ctx.home} (${ctx.mode}, compose=${ctx.composeProjectName})`);

  const docker = await detectDocker();
  if (!docker.installed || !docker.composeAvailable) {
    p.log.error('Docker oder „docker compose“ fehlt.');
    p.note(dockerInstallHints(), 'Installation');
    process.exit(1);
  }
  if (!docker.daemonRunning) {
    p.log.error('Docker-Daemon läuft nicht. Bitte Docker Desktop starten.');
    process.exit(1);
  }
  p.log.success(`Docker OK (${docker.detail ?? 'läuft'})`);

  const candidates = listLanIpv4Candidates();
  if (candidates.length === 0) {
    p.log.warn('Keine LAN-IPv4 gefunden — Sie können die IP manuell eingeben.');
  }

  const lanChoice = await p.select({
    message: 'IP-Adresse dieses Rechners im Praxis-LAN (Terminal, TV, MFA)',
    options: [
      ...candidates.map((c) => ({ value: c.address, label: c.label })),
      { value: '__custom__', label: 'Andere IP eingeben …' },
      { value: '127.0.0.1', label: '127.0.0.1 (nur Test auf diesem Rechner)' },
    ],
  });
  if (isCancel(lanChoice)) {
    process.exit(0);
  }

  let lanAppIp = String(lanChoice);
  if (lanAppIp === '__custom__') {
    const custom = await p.text({
      message: 'LAN-IP des Servers',
      placeholder: '192.168.1.50',
      validate: (value) => (value?.trim() ? undefined : 'IP eingeben'),
    });
    if (isCancel(custom)) {
      process.exit(0);
    }
    lanAppIp = String(custom).trim();
  }

  const practiceName = await p.text({
    message:
      'Anzeigename der Praxis (Terminal, TV, Datenschutz — wird in Systemeinstellungen gespeichert)',
    initialValue: 'Hausarztpraxis Muster',
    validate: (value) => (value?.trim() ? undefined : 'Name eingeben'),
  });
  if (isCancel(practiceName)) {
    process.exit(0);
  }

  p.log.info(
    'MFA- und Ops-Anmeldung: Standard-PIN 0000 (MFA/Panel: MFA → Betrieb; Ops: System → PIN & Sicherheit; Reset: Praxis Flow Manager → Wartung).',
  );

  const gatewayEnabled = await p.confirm({
    message: 'Gast-WLAN mit Captive Portal einrichten? (Linux-Host, optional)',
    initialValue: false,
  });
  if (isCancel(gatewayEnabled)) {
    process.exit(0);
  }

  let gatewayInterface = 'eth1';
  let gatewayIp = '192.168.88.1';
  let portalAppIp = lanAppIp;

  if (gatewayEnabled && !canRunGatewayCompose()) {
    p.log.warn(
      'Gast-WLAN-Container läuft nur auf Linux. Auf diesem System werden Gateway-Variablen in .env vorbereitet, Compose startet ohne Gateway-Profil.',
    );
  }

  if (gatewayEnabled) {
    const ifaces = listNetworkInterfaces();
    const ifaceChoice = await p.select({
      message: 'Netzwerk-Interface für Gast-LAN (GATEWAY_INTERFACE)',
      options: [
        ...ifaces.map((iface) => ({
          value: iface.name,
          label: `${iface.name} — ${iface.addresses.map((a) => a.address).join(', ')}`,
        })),
        { value: 'eth1', label: 'eth1 (manuell, Standard)' },
      ],
    });
    if (isCancel(ifaceChoice)) {
      process.exit(0);
    }
    gatewayInterface = String(ifaceChoice);

    const gwIp = await p.text({
      message: 'Gateway-IP im Gast-Netz (GATEWAY_IP)',
      initialValue: '192.168.88.1',
    });
    if (isCancel(gwIp)) {
      process.exit(0);
    }
    gatewayIp = String(gwIp).trim() || '192.168.88.1';

    const portalIp = await p.text({
      message: 'App-IP für Patienten im Gast-WLAN (APP_PORTAL_URL, oft = LAN-IP)',
      initialValue: lanAppIp,
    });
    if (isCancel(portalIp)) {
      process.exit(0);
    }
    portalAppIp = String(portalIp).trim() || lanAppIp;
  }

  const envExists = (await getHostStatus(ctx)).envExists;
  let preserveEnv = false;
  if (envExists) {
    const overwrite = await p.confirm({
      message:
        'Neue Zufalls-Keys für alle Rollen erzeugen? (Nein = bestehende AUTH_KEY_* / Tokens in .env behalten)',
      initialValue: false,
    });
    if (isCancel(overwrite)) {
      process.exit(0);
    }
    preserveEnv = !overwrite;
  } else {
    p.log.info('Neue Keys werden in .env angelegt (erste Einrichtung).');
  }

  const runCompose = await p.confirm({
    message: 'Docker Compose jetzt starten (build bei Dev)?',
    initialValue: true,
  });
  if (isCancel(runCompose)) {
    process.exit(0);
  }

  const spinner = p.spinner();
  spinner.start('Schreibe .env, lege Ordner an …');

  try {
    const result = await applySetupPlan(ctx, {
      lanAppIp,
      practiceDisplayName: String(practiceName).trim(),
      portalAppIp,
      preserveEnv,
      runCompose: Boolean(runCompose),
      gateway: {
        enabled: Boolean(gatewayEnabled),
        gatewayInterface,
        gatewayIp,
        portalAppIp,
        authBridgeUrl: '',
      },
    });

    spinner.stop('Host-Einrichtung angewendet');

    if (result.secretsGenerated.length > 0) {
      p.log.success(
        `Neu erzeugt (${result.secretsGenerated.length}): ${result.secretsGenerated.join(', ')}`,
      );
    }
    if (result.secretsKept.length > 0) {
      p.log.info(`Unverändert: ${result.secretsKept.join(', ')}`);
    }

    if (result.backupPath) {
      p.log.info(`Backup: ${result.backupPath}`);
    }
    if (result.folders.created.length > 0) {
      p.log.info(`Ordner angelegt: ${result.folders.created.join(', ')}`);
    }
    if (result.gatewayComposeSkipped) {
      p.log.info(
        'Gateway-Profil übersprungen (macOS/Windows — siehe docs/gateway-captive-portal.md)',
      );
    }
    if (result.compose && !result.compose.ok) {
      p.log.error('Docker Compose fehlgeschlagen');
      p.note(result.compose.log, 'Compose-Log');
      p.log.warn('Manuell: docker compose --env-file .env up -d --build app');
    } else if (result.compose?.ok) {
      p.log.success('Container gestartet');
    }

    const urls = buildDeviceUrls(lanAppIp);
    p.note(
      [
        `Terminal:  ${urls.terminal}`,
        `MFA:       ${urls.mfa}`,
        `TV:        ${urls.tv}`,
        `Ops:       ${urls.opsSetup}`,
        '',
        'Anmeldung MFA/Ops: Standard-PIN 0000 (Datenbank, nicht .env).',
        'MFA/Panel unter MFA → Betrieb; Ops unter System → PIN & Sicherheit; bei Vergessen: Praxis Flow Manager → Wartung → Staff-PINs.',
        '',
        'Server-Secrets stehen in .env (AUTH_KEY_CAPTIVE, SANDBOX_INTERNAL_TOKEN, OPENNDS_FAS_KEY).',
        '',
        'Wichtig: Terminal/TV nutzen Pairing, MFA/Ops nutzen Staff-Session; keine Rollen-Keys im UI-Build.',
        'Nach neuen Keys: docker compose --env-file .env up -d --build app',
        'Als Nächstes im Browser den Assistenten unter /ops/setup abschließen.',
      ].join('\n'),
      'Lesezeichen für die Praxis',
    );

    if (result.probes.length > 0) {
      const lines = result.probes.map(
        (probe) => `${probe.ok ? '✓' : '✗'} ${probe.id}: ${probe.message}`,
      );
      p.note(lines.join('\n'), 'Verbindungstests');
    }

    p.outro('Host-Einrichtung fertig — Browser: Ops-Assistent öffnen');
  } catch (error) {
    spinner.stop('Fehler');
    p.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
