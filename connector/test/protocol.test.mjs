/**
 * End-to-end MCP protocol test: spawn the server over stdio, run the JSON-RPC
 * handshake, list tools, and call one. Verifies the connector speaks MCP.
 * Run: node --test connector/test/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = join(here, '..', 'src', 'server.mjs');

/** Spawn the server and exchange newline-delimited JSON-RPC messages. */
function startServer() {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, CONNECTOR_DEMO: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buf = '';
  const pending = new Map();
  child.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });
  const rpc = (id, method, params) =>
    new Promise((resolve) => {
      pending.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  const notify = (method, params) =>
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  return { child, rpc, notify, stop: () => child.kill() };
}

test('initialize → tools/list → tools/call handshake works over stdio', async () => {
  const s = startServer();
  try {
    const init = await s.rpc(1, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    });
    assert.equal(init.result.serverInfo.name, 'prism-ads-connector');
    assert.ok(init.result.capabilities.tools);
    s.notify('notifications/initialized');

    const list = await s.rpc(2, 'tools/list', {});
    assert.ok(Array.isArray(list.result.tools));
    assert.ok(list.result.tools.find((t) => t.name === 'account_audit'));

    const call = await s.rpc(3, 'tools/call', {
      name: 'find_wasted_spend',
      arguments: { platform: 'google', minSpend: 500 },
    });
    assert.equal(call.result.isError, false);
    assert.ok(call.result.structuredContent.recoverableSpend >= 0);
    assert.ok(call.result.content[0].text.includes('recoverableSpend'));

    const ping = await s.rpc(4, 'ping', {});
    assert.deepEqual(ping.result, {});
  } finally {
    s.stop();
  }
});

test('calling an unknown tool returns a JSON-RPC method-not-found error', async () => {
  const s = startServer();
  try {
    await s.rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {} });
    const r = await s.rpc(2, 'tools/call', { name: 'does_not_exist', arguments: {} });
    assert.equal(r.error.code, -32601);
  } finally {
    s.stop();
  }
});
