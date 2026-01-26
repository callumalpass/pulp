import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { configSchema, type Config } from './schema.js';

const CONFIG_PATHS = [
  './pulp.yaml',
  './pulp.yml',
  './config/pulp.yaml',
  './config/pulp.yml',
  '~/.config/pulp/config.yaml',
  '~/.config/pulp/config.yml',
];

function expandHome(filepath: string): string {
  if (filepath.startsWith('~/')) {
    return join(process.env.HOME || '', filepath.slice(2));
  }
  return filepath;
}

function findConfigFile(): string | null {
  // Check PULP_CONFIG env var first
  const envPath = process.env.PULP_CONFIG;
  if (envPath) {
    const expanded = expandHome(envPath);
    if (existsSync(expanded)) {
      return expanded;
    }
    throw new Error(`Config file not found at PULP_CONFIG path: ${envPath}`);
  }

  // Search default locations
  for (const configPath of CONFIG_PATHS) {
    const expanded = expandHome(configPath);
    const resolved = resolve(expanded);
    if (existsSync(resolved)) {
      return resolved;
    }
  }

  return null;
}

export function loadConfig(): Config {
  const configPath = findConfigFile();

  if (!configPath) {
    throw new Error(
      `No config file found. Create one at:\n${CONFIG_PATHS.map(p => `  - ${p}`).join('\n')}\nOr set PULP_CONFIG environment variable.`
    );
  }

  console.log(`Loading config from: ${configPath}`);

  const content = readFileSync(configPath, 'utf-8');
  const rawConfig = parseYaml(content);

  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.errors
      .map(e => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Invalid config:\n${errors}`);
  }

  // Resolve library_path to absolute
  const config = result.data;
  config.library_path = resolve(expandHome(config.library_path));

  if (!existsSync(config.library_path)) {
    throw new Error(`Library path does not exist: ${config.library_path}`);
  }

  return config;
}
