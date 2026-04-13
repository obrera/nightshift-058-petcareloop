import { cp, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDist = path.join(root, 'dist', 'client');
const publicDist = path.join(root, 'dist', 'public');

try {
  await stat(clientDist);
  await mkdir(publicDist, { recursive: true });
  await cp(clientDist, publicDist, { recursive: true, force: true });
} catch (error) {
  console.warn('Skipping client copy:', error instanceof Error ? error.message : error);
}
