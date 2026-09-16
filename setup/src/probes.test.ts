import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultDetectDnsRebind, runConnectionProbes } from './probes.js';

function resolverFactory(answers: Array<string[] | Error | null>) {
  const servers: string[][] = [];
  let cancelled = 0;
  return {
    servers,
    get cancelled() { return cancelled; },
    createResolver: () => ({
      setServers(value: readonly string[]) { servers.push([...value]); },
      resolve4: (() => {
        const answer = answers.shift();
        if (answer === null) return new Promise<string[]>(() => {});
        return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer ?? []);
      }) as import('node:dns/promises').Resolver['resolve4'],
      cancel() { cancelled += 1; },
    }),
  };
}

test('public DNS diagnostic accepts RFC1918 answers from either resolver despite NXDOMAIN on the other', async () => {
  for (const address of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.0.93']) {
    const deps = resolverFactory([new Error('ENOTFOUND'), [address]]);
    assert.equal(await defaultDetectDnsRebind('staff.example.test', deps), true);
    assert.deepEqual(deps.servers, [['1.1.1.1'], ['8.8.8.8']]);
    assert.equal(deps.cancelled, 2);
  }
});

test('public DNS diagnostic does not classify public, loopback or malformed addresses as private LAN', async () => {
  const deps = resolverFactory([['8.8.8.8', '172.32.0.1', '127.0.0.1', '192.168.999.1'], []]);
  assert.equal(await defaultDetectDnsRebind('staff.example.test', deps), false);
  assert.equal(await defaultDetectDnsRebind('192.168.0.93', deps), false);
  assert.equal(deps.servers.length, 2);
});

test('public DNS failures preserve generic diagnosis and deadline cancels pending queries', async () => {
  assert.equal(await defaultDetectDnsRebind('staff.example.test', resolverFactory([
    new Error('ENOTFOUND'), new Error('ETIMEOUT'),
  ])), false);
  const deps = resolverFactory([null, null]);
  assert.equal(await defaultDetectDnsRebind('staff.example.test', { ...deps, timeoutMs: 10 }), false);
  assert.equal(deps.cancelled, 2);
});

for (const code of ['ENOTFOUND', 'EAI_AGAIN']) {
  test(`${code} triggers secondary diagnosis and retains original error detail`, async () => {
    const results = await runConnectionProbes({ lanAppBaseUrl: 'https://staff.example.test' }, {
      fetchStatus: async (url) => url.includes('127.0.0.1')
        ? { ok: true, status: 200, body: '' }
        : { ok: false, status: 0, body: `getaddrinfo ${code} staff.example.test` },
      detectDnsRebind: async (hostname) => {
        assert.equal(hostname, 'staff.example.test');
        return true;
      },
    });
    assert.equal(results[1].reason, 'dns-rebind');
    assert.equal(results[1].ok, false);
    assert.match(results[1].message, /möglich/);
    assert.match(results[1].detail!, new RegExp(code));
  });
}

test('successful requests, HTTP error bodies and connection errors do not trigger public DNS', async () => {
  for (const response of [
    { ok: true, status: 200, body: '' },
    { ok: false, status: 503, body: 'ENOTFOUND' },
    { ok: false, status: 0, body: 'ECONNREFUSED' },
    { ok: false, status: 0, body: 'timeout' },
  ]) {
    await runConnectionProbes({ lanAppBaseUrl: 'https://staff.example.test' }, {
      fetchStatus: async () => response,
      detectDnsRebind: async () => { assert.fail('unexpected public query'); },
    });
  }
});

test('inconclusive secondary diagnosis leaves original failure unchanged', async () => {
  for (const detectDnsRebind of [async () => false, async () => { throw new Error('blocked'); }]) {
    const result = await runConnectionProbes({ lanAppBaseUrl: 'https://staff.example.test' }, {
      fetchStatus: async () => ({ ok: false, status: 0, body: 'ENOTFOUND' }),
      detectDnsRebind,
    });
    assert.equal(result[1].reason, undefined);
    assert.equal(result[1].detail, 'ENOTFOUND');
  }
});
