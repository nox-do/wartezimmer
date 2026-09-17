import os from 'node:os';
import type { NetworkAddress, NetworkInterfaceInfo } from '@praxis-flow/server-shared';

export type { NetworkAddress, NetworkInterfaceInfo };

export function networkInterfaceId(iface: NetworkInterfaceInfo): string {
  const mac = iface.addresses
    .map((address) => address.mac?.trim().toLowerCase())
    .find((value) => value && value !== '00:00:00:00:00:00');
  return mac ? `mac:${mac}` : `name:${iface.name}`;
}

export function listNetworkInterfaces(): NetworkInterfaceInfo[] {
  const raw = os.networkInterfaces();
  const result: NetworkInterfaceInfo[] = [];

  for (const [name, entries] of Object.entries(raw)) {
    if (!entries?.length) {
      continue;
    }
    const addresses: NetworkAddress[] = [];
    for (const entry of entries) {
      if (entry.family !== 'IPv4') {
        continue;
      }
      addresses.push({
        family: 'IPv4',
        address: entry.address,
        internal: entry.internal,
        cidr: entry.cidr ?? undefined,
        mac: entry.mac || undefined,
      });
    }
    if (addresses.length > 0) {
      result.push({ name, addresses });
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function listLanIpv4Candidates(): {
  label: string;
  address: string;
  interfaceName: string;
  mac?: string;
}[] {
  const candidates: { label: string; address: string; interfaceName: string; mac?: string }[] = [];

  for (const iface of listNetworkInterfaces()) {
    for (const addr of iface.addresses) {
      if (addr.internal || addr.address.startsWith('169.254.')) {
        continue;
      }
      candidates.push({
        label: `${addr.address} (${iface.name})`,
        address: addr.address,
        interfaceName: iface.name,
        mac: addr.mac,
      });
    }
  }

  const seen = new Set<string>();
  return candidates.filter((item) => {
    if (seen.has(item.address)) {
      return false;
    }
    seen.add(item.address);
    return true;
  });
}

/** Host machine hostname for LAN reachability comfort path. */
export function machineHostname(): string {
  return os.hostname().trim();
}
