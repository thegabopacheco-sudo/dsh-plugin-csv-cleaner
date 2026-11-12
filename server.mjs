#!/usr/bin/env node
// dsh-plugin-csv-cleaner — limpia y perfila CSV locales.
// Tools: status, profile, clean.

import path from 'node:path';
import os from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const VERSION = '0.1.0';
const DSH_HOME = (() => {
  const v = process.env.DSH_HOME && process.env.DSH_HOME.trim();
  return v || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.dsh');
})();
const CONFIG_FILE = path.join(DSH_HOME, 'csv-cleaner', 'config.json');
const CACHE_DIR = path.join(DSH_HOME, 'cache', 'csv-cleaner');
const READ_ONLY = String(process.env.DSH_CSVCLEAN_MODE || '').toLowerCase() === 'read-only';
const MAX_BYTES = 20 * 1024 * 1024;
const log = (m) => process.stderr.write(`[csvclean] ${m}\n`);

function loadConfig() { try { if (existsSync(CONFIG_FILE)) return { allowedPaths: [], ...(JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) || {}) }; } catch { /* defaults */ } return { allowedPaths: [] }; }
function allowedRoots() { const configured = loadConfig().allowedPaths; return (Array.isArray(configured) && configured.length ? configured : [process.env.USERPROFILE || process.env.HOME || os.homedir()]).map((item) => path.resolve(item)); }
function isAllowed(target) { const resolved = path.resolve(target); return resolved === CACHE_DIR || resolved.startsWith(CACHE_DIR + path.sep) || allowedRoots().some((root) => resolved === root || resolved.startsWith(root + path.sep)); }

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') { if (text[index + 1] === '"') { field += '"'; index++; } else quoted = false; }
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}
function serializeCsv(rows) { return rows.map((row) => row.map((value) => /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value).join(',')).join('\n') + '\n'; }
function normalizeHeaders(headers) { return headers.map((header) => String(header).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'col'); }
function loadCsv(file) {
  const resolved = path.resolve(file);
  if (!existsSync(resolved)) throw new Error(`archivo no existe: ${resolved}`);
  if (!isAllowed(resolved)) throw new Error(`ruta no permitida (revisa allowedPaths): ${resolved}`);
  const text = readFileSync(resolved, 'utf8').replace(/^\uFEFF/, '');
  if (text.length > MAX_BYTES) throw new Error('CSV demasiado grande (máx 20 MB)');
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error('CSV vacío');
  return { file: resolved, headers: rows[0], data: rows.slice(1).filter((row) => row.some((value) => String(value).trim() !== '')) };
}
function cleanData({ headers, data }, options) {
  let rows = data.map((row) => row.map((value) => options.trim ? String(value).trim() : value));
  let normHeaders = headers.map((header) => String(header));
  if (options.normalizeHeaders) normHeaders = normalizeHeaders(normHeaders);
  if (options.dropEmptyRows) rows = rows.filter((row) => row.some((value) => String(value).trim() !== ''));
  const beforeDedupe = rows.length;
  if (options.dedupe) { const seen = new Set(); rows = rows.filter((row) => { const key = JSON.stringify(row); if (seen.has(key)) return false; seen.add(key); return true; }); }
  const deduped = beforeDedupe - rows.length;
  const filled = rows.map((row) => { const copy = row.slice(); while (copy.length < normHeaders.length) copy.push(''); return copy.slice(0, normHeaders.length); });
  return { rows: filled, headers: normHeaders, stats: { inputRows: data.length, outputRows: filled.length, removedEmpty: data.length - beforeDedupe, deduped } };
}
function profileData({ headers, data }) {
  const columns = headers.map((header, index) => {
    const values = data.map((row) => String(row[index] ?? '').trim());
    const empty = values.filter((value) => value === '').length;
    const unique = new Set(values.filter((value) => value !== '')).size;
    return { name: String(header), empty, unique, sample: values.find((value) => value !== '') || '' };
  });
  return { rows: data.length, columns: columns.length, columnsDetail: columns };
}
function textResult(text) { return { content: [{ type: 'text', text }] }; }
function uniquePath(target) { if (!existsSync(target)) return target; const parsed = path.parse(target); for (let index = 1; index < 1000; index++) { const candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`); if (!existsSync(candidate)) return candidate; } throw new Error('no se pudo generar nombre único'); }

function buildInstructions() {
  return [
    'CSV Cleaner: limpia y perfila CSV locales.',
    '',
    `Salidas: ${CACHE_DIR}`,
    '',
    'Herramientas: status, profile, clean.',
    '',
    'Reglas:',
    '- profile es solo lectura; clean escribe y requiere confirm:true.',
    '- Opciones: trim, normalizeHeaders, dedupe, dropEmptyRows.',
    '- Nunca sobrescribe (sufijo único) y respeta allowedPaths.',
    '- Reporta filas leídas/escritas reales; no inventes datos.',
  ].join('\n');
}

function buildServer() {
  const server = new McpServer({ name: 'dsh-plugin-csv-cleaner', version: VERSION }, { capabilities: { tools: {} }, instructions: buildInstructions() });
  server.registerTool(
    'status',
    { title: 'Estado', description: 'Rutas permitidas y modo.', inputSchema: z.object({}) },
    async () => textResult([`Rutas permitidas: ${allowedRoots().join(', ')}`, `Salida: ${CACHE_DIR}`, `Modo: ${READ_ONLY ? 'read-only' : 'normal'}`].join('\n')),
  );
  server.registerTool(
    'profile',
    { title: 'Perfilar CSV', description: 'Filas, columnas, vacíos y únicos por columna.', inputSchema: z.object({ path: z.string().min(2) }) },
    async (args) => {
      const result = profileData(loadCsv(args.path));
      return textResult([`Filas: ${result.rows} · columnas: ${result.columns}`, '', ...result.columnsDetail.map((column) => `- ${column.name}: vacíos ${column.empty} · únicos ${column.unique} · ejemplo "${column.sample.slice(0, 40)}"`)].join('\n'));
    },
  );
  server.registerTool(
    'clean',
    { title: 'Limpiar CSV', description: 'Limpia y escribe un CSV nuevo. Requiere confirm:true.', inputSchema: z.object({ path: z.string().min(2), output: z.string().optional(), trim: z.boolean().optional(), normalizeHeaders: z.boolean().optional(), dedupe: z.boolean().optional(), dropEmptyRows: z.boolean().optional(), confirm: z.boolean().optional() }) },
    async (args) => {
      if (READ_ONLY) throw new Error('modo read-only: clean deshabilitado');
      if (args.confirm !== true) throw new Error('clean requiere confirm:true y pedido explícito');
      const csv = loadCsv(args.path);
      const result = cleanData(csv, { trim: args.trim !== false, normalizeHeaders: args.normalizeHeaders !== false, dedupe: args.dedupe !== false, dropEmptyRows: args.dropEmptyRows !== false });
      const target = args.output ? path.resolve(args.output) : path.join(CACHE_DIR, `${path.basename(csv.file, path.extname(csv.file))}-clean.csv`);
      if (!isAllowed(target)) throw new Error(`ruta de salida no permitida: ${target}`);
      mkdirSync(path.dirname(target), { recursive: true });
      const file = uniquePath(target);
      writeFileSync(file, serializeCsv([result.headers, ...result.rows]), 'utf8');
      return textResult([`Guardado: ${file}`, `Filas: ${result.stats.inputRows} → ${result.stats.outputRows} (duplicadas quitadas: ${result.stats.deduped})`, `Columnas: ${result.headers.join(', ')}`].join('\n'));
    },
  );
  return server;
}

try { mkdirSync(CACHE_DIR, { recursive: true }); } catch { /* ignora */ }
log(`modo: ${READ_ONLY ? 'read-only' : 'normal'}`);
serveStdio(buildServer, { onerror: (e) => log(`serveStdio: ${e.message}`) });
process.on('uncaughtException', (e) => log(`excepción: ${e.message}`));
process.on('unhandledRejection', (e) => log(`rechazo: ${e && e.message ? e.message : String(e)}`));
