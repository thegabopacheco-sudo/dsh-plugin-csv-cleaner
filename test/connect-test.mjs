// Test end-to-end de csv-cleaner.
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const packageDir = path.resolve(import.meta.dirname, '..');
const tmpDir = path.join(packageDir, 'test', 'tmp');
rmSync(tmpDir, { recursive: true, force: true });
const home = path.join(tmpDir, 'dsh-home');
mkdirSync(path.join(home, 'csv-cleaner'), { recursive: true });
writeFileSync(path.join(home, 'csv-cleaner', 'config.json'), JSON.stringify({ allowedPaths: [tmpDir] }), 'utf8');
const csvFile = path.join(tmpDir, 'datos.csv');
writeFileSync(csvFile, [
  ' Nombre ,Edad, Ciudad ',
  ' Ana , 30 , Madrid ',
  'Ana,30,Madrid',
  ',,',
  ' Luis ,25, Bogotá ',
].join('\n') + '\n', 'utf8');

function makeClient(extraEnv = {}) {
  const entry = process.env.CSVCLEAN_SERVER ? path.resolve(process.env.CSVCLEAN_SERVER) : path.join(packageDir, 'server.mjs');
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows', PATH: process.env.PATH, USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME || process.env.USERPROFILE, TEMP: process.env.TEMP, TMP: process.env.TMP, DSH_HOME: home, ...extraEnv }, stderr: 'pipe' });
  transport.stderr?.on('data', (c) => process.stderr.write(`[server] ${c}`));
  const client = new Client({ name: 'csvclean-test', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode: 'auto' } });
  return client.connect(transport).then(() => ({ client, transport }));
}
const textOf = (r) => (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

const { client, transport } = await makeClient();
console.log('tools:', (await client.listTools()).tools.map((t) => t.name).join(', '));
console.log('--- status ---'); console.log(textOf(await client.callTool({ name: 'status', arguments: {} })));
const profile = textOf(await client.callTool({ name: 'profile', arguments: { path: csvFile } }));
console.log('--- profile ---'); console.log(profile);
console.log('perfila filas y columnas:', profile.includes('Filas: 3') && profile.includes('columnas: 3'));
console.log('muestra vacíos:', profile.includes('vacíos'));
const noConfirm = await client.callTool({ name: 'clean', arguments: { path: csvFile } });
console.log('clean sin confirm isError:', noConfirm.isError === true);
const cleaned = await client.callTool({ name: 'clean', arguments: { path: csvFile, confirm: true } });
const cleanedText = textOf(cleaned);
console.log('--- clean ---'); console.log(cleanedText);
const file = cleanedText.replace('Guardado: ', '').split('\n')[0];
const content = readFileSync(file, 'utf8');
console.log('archivo existe:', existsSync(file));
console.log('headers normalizados:', content.split('\n')[0] === 'nombre,edad,ciudad');
console.log('quita duplicados:', content.split('\n').filter(Boolean).length === 3);
console.log('trim aplicado:', content.includes('Ana,30,Madrid') && !content.includes(' Ana '));
const outside = await client.callTool({ name: 'clean', arguments: { path: csvFile, output: 'C:\\Windows\\x.csv', confirm: true } });
console.log('ruta fuera isError:', outside.isError === true);
await client.close(); try { await transport.close?.(); } catch {}
const { client: roClient, transport: roTransport } = await makeClient({ DSH_CSVCLEAN_MODE: 'read-only' });
const roClean = await roClient.callTool({ name: 'clean', arguments: { path: csvFile, confirm: true } });
console.log('read-only clean isError:', roClean.isError === true);
await roClient.close(); try { await roTransport.close?.(); } catch {}
console.log('OK');
