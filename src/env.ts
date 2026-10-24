import { existsSync } from 'node:fs';

/** Подхватывает .env из текущего каталога, если он есть (встроенный process.loadEnvFile, Node ≥ 21.7). */
if (existsSync('.env')) process.loadEnvFile('.env');
