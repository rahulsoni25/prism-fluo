#!/usr/bin/env node
/**
 * server.mjs — the PRISM Ads Connector, a Model Context Protocol (MCP) server
 * spoken over stdio. Zero dependencies: it implements the JSON-RPC 2.0 / MCP
 * handshake directly and uses native fetch for the ad platform APIs.
 *
 * Transport (per the MCP spec): newline-delimited JSON-RPC messages on
 * stdin/stdout. Logs go to stderr so they never corrupt the protocol stream.
 *
 * Run:    node connector/src/server.mjs
 * Add to Claude Desktop / Claude Code as a stdio MCP server (see README).
 */
import { createInterface } from 'node:readline';
import config from './config.mjs';
import { toolList, buildContext, callSkill } from './registry.mjs';

const PROTOCOL_VERSION = '2025-06-18';
const SUPPORTED_PROTOCOLS = new Set(['2025-06-18', '2025-03-26', '2024-11-05']);

const ctx = buildContext(config);

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}
function result(id, res) { send({ jsonrpc: '2.0', id, result: res }); }
function error(id, code, message, data) { send({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } }); }

// JSON-RPC error codes.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

async function handle(msg) {
  // Notifications have no id and never get a response.
  const isNotification = msg.id === undefined || msg.id === null;

  switch (msg.method) {
    case 'initialize': {
      const requested = msg.params?.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOLS.has(requested) ? requested : PROTOCOL_VERSION;
      return result(msg.id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: config.serverName, version: config.serverVersion },
        instructions:
          'PRISM Ads Connector. Skills for auditing and managing Google Ads & Meta Ads (and reading GA4). ' +
          'Start with list_ad_accounts to discover account IDs. Write actions (pause_underperformers, ' +
          'add_negative_keywords) default to dryRun=true — confirm before applying. ' +
          (anyDemo() ? 'NOTE: running in DEMO mode for one or more platforms (no credentials set) — output is sample data flagged "_demo": true.' : ''),
      });
    }

    case 'notifications/initialized':
    case 'initialized':
      return; // ack only

    case 'ping':
      return result(msg.id, {});

    case 'tools/list':
      return result(msg.id, { tools: toolList() });

    case 'tools/call': {
      const name = msg.params?.name;
      const args = msg.params?.arguments || {};
      if (!name) return error(msg.id, INVALID_PARAMS, 'Missing tool name');
      try {
        const data = await callSkill(name, args, ctx);
        return result(msg.id, {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
          isError: false,
        });
      } catch (err) {
        if (err.code === 'UNKNOWN_TOOL') return error(msg.id, METHOD_NOT_FOUND, err.message);
        // Tool execution errors are reported as tool results (isError) per MCP,
        // so the model can read and react to them.
        const payload = { error: err.message, tool: name, platform: err.platform, status: err.status };
        return result(msg.id, {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
          isError: true,
        });
      }
    }

    // Gracefully decline capabilities we don't implement.
    case 'resources/list': return result(msg.id, { resources: [] });
    case 'prompts/list': return result(msg.id, { prompts: [] });

    default:
      if (isNotification) return; // ignore unknown notifications
      return error(msg.id, METHOD_NOT_FOUND, `Method not found: ${msg.method}`);
  }
}

function anyDemo() {
  return ctx.isDemo('google') || ctx.isDemo('meta') || ctx.isDemo('ga4');
}

// ── stdio loop ──
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return error(null, PARSE_ERROR, 'Parse error');
  }
  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    if (msg.id !== undefined) error(msg.id, INVALID_REQUEST, 'Invalid Request');
    return;
  }
  try {
    await handle(msg);
  } catch (err) {
    if (msg.id !== undefined && msg.id !== null) error(msg.id, INTERNAL_ERROR, err.message);
    else process.stderr.write(`[connector] unhandled: ${err.stack || err.message}\n`);
  }
});

rl.on('close', () => process.exit(0));

process.stderr.write(
  `[connector] ${config.serverName} v${config.serverVersion} ready on stdio` +
  (anyDemo() ? ' (DEMO mode — set platform credentials to go live)' : '') + '\n',
);
