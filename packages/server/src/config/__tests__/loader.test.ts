import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { loadConfig } from '../loader.js';

// Mock node:fs
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

import { readFileSync, existsSync } from 'node:fs';

const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);

const VALID_YAML = `
library_path: /tmp/test-library
`;

const FULL_YAML = `
library_path: /tmp/test-library
literature_note_tag: lit-note
source_key: src
progress_key: progress
search_context_chars: 120
cover_width: 400
cover_height: 600
cover_quality: 90
default_daily_goal_minutes: 60
default_grace_period_days: 3
exclude_folders:
  - .obsidian
  - .trash
  - node_modules
`;

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.PULP_CONFIG;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('config file discovery', () => {
    it('finds config via PULP_CONFIG environment variable', () => {
      process.env.PULP_CONFIG = '/custom/path/pulp.yaml';

      mockExistsSync.mockImplementation((p) => {
        if (p === '/custom/path/pulp.yaml') return true;
        // library_path must also exist
        if (p === '/tmp/test-library') return true;
        return false;
      });
      mockReadFileSync.mockReturnValue(VALID_YAML);

      const config = loadConfig();

      expect(config.library_path).toBe('/tmp/test-library');
      expect(mockReadFileSync).toHaveBeenCalledWith('/custom/path/pulp.yaml', 'utf-8');
    });

    it('throws when PULP_CONFIG points to non-existent file', () => {
      process.env.PULP_CONFIG = '/missing/config.yaml';

      mockExistsSync.mockReturnValue(false);

      expect(() => loadConfig()).toThrow('Config file not found at PULP_CONFIG path: /missing/config.yaml');
    });

    it('searches default paths when PULP_CONFIG is not set', () => {
      // Make the first default path exist
      mockExistsSync.mockImplementation((p) => {
        const path = String(p);
        if (path.endsWith('pulp.yaml') && !path.includes('.config')) return true;
        if (path === '/tmp/test-library') return true;
        return false;
      });
      mockReadFileSync.mockReturnValue(VALID_YAML);

      const config = loadConfig();

      expect(config.library_path).toBe('/tmp/test-library');
    });

    it('throws when no config file is found in any default location', () => {
      mockExistsSync.mockReturnValue(false);

      expect(() => loadConfig()).toThrow('No config file found');
      expect(() => loadConfig()).toThrow('pulp.yaml');
      expect(() => loadConfig()).toThrow('PULP_CONFIG');
    });

    it('expands ~ in PULP_CONFIG path', () => {
      process.env.PULP_CONFIG = '~/my-config/pulp.yaml';
      process.env.HOME = '/home/testuser';

      mockExistsSync.mockImplementation((p) => {
        if (p === '/home/testuser/my-config/pulp.yaml') return true;
        if (p === '/tmp/test-library') return true;
        return false;
      });
      mockReadFileSync.mockReturnValue(VALID_YAML);

      const config = loadConfig();

      expect(config.library_path).toBe('/tmp/test-library');
    });
  });

  describe('YAML parsing', () => {
    it('parses valid YAML with all fields', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(FULL_YAML);

      const config = loadConfig();

      expect(config.literature_note_tag).toBe('lit-note');
      expect(config.source_key).toBe('src');
      expect(config.progress_key).toBe('progress');
      expect(config.search_context_chars).toBe(120);
      expect(config.cover_width).toBe(400);
      expect(config.cover_height).toBe(600);
      expect(config.cover_quality).toBe(90);
      expect(config.default_daily_goal_minutes).toBe(60);
      expect(config.default_grace_period_days).toBe(3);
      expect(config.exclude_folders).toEqual(['.obsidian', '.trash', 'node_modules']);
    });

    it('applies defaults for optional fields', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(VALID_YAML);

      const config = loadConfig();

      expect(config.literature_note_tag).toBe('literature-note');
      expect(config.source_key).toBe('source');
      expect(config.progress_key).toBe('reading_progress');
      expect(config.progress_debounce_ms).toBe(5000);
      expect(config.search_context_chars).toBe(80);
      expect(config.search_max_matches_per_doc).toBe(50);
      expect(config.search_results_per_doc).toBe(10);
      expect(config.reading_history_max_days).toBe(90);
      expect(config.cover_width).toBe(300);
      expect(config.cover_height).toBe(450);
      expect(config.cover_quality).toBe(80);
      expect(config.default_daily_goal_minutes).toBe(30);
      expect(config.default_grace_period_days).toBe(1);
    });

    it('throws on invalid YAML syntax', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{ invalid yaml: [');

      expect(() => loadConfig()).toThrow();
    });
  });

  describe('schema validation', () => {
    it('throws when library_path is missing', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('literature_note_tag: test\n');

      expect(() => loadConfig()).toThrow('Invalid config');
    });

    it('throws when library_path is empty string', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('library_path: ""\n');

      expect(() => loadConfig()).toThrow('Invalid config');
      expect(() => loadConfig()).toThrow('library_path');
    });

    it('throws when search_context_chars is below minimum (10)', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
library_path: /tmp/test-library
search_context_chars: 5
`);

      expect(() => loadConfig()).toThrow('Invalid config');
    });

    it('throws when search_context_chars exceeds maximum (500)', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
library_path: /tmp/test-library
search_context_chars: 999
`);

      expect(() => loadConfig()).toThrow('Invalid config');
    });

    it('throws when cover_quality exceeds maximum (100)', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
library_path: /tmp/test-library
cover_quality: 150
`);

      expect(() => loadConfig()).toThrow('Invalid config');
    });

    it('throws when default_daily_goal_minutes exceeds maximum (1440)', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
library_path: /tmp/test-library
default_daily_goal_minutes: 2000
`);

      expect(() => loadConfig()).toThrow('Invalid config');
    });

    it('includes field path in validation error message', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
library_path: /tmp/test-library
cover_width: -5
`);

      try {
        loadConfig();
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        const msg = (e as Error).message;
        expect(msg).toContain('Invalid config');
        expect(msg).toContain('cover_width');
      }
    });
  });

  describe('library path resolution', () => {
    it('resolves library_path to an absolute path', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(VALID_YAML);

      const config = loadConfig();

      // /tmp/test-library is already absolute, so it should remain the same
      expect(config.library_path).toBe('/tmp/test-library');
    });

    it('expands ~ in library_path', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';
      process.env.HOME = '/home/testuser';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('library_path: ~/my-vault\n');

      const config = loadConfig();

      expect(config.library_path).toBe('/home/testuser/my-vault');
    });

    it('throws when library_path directory does not exist', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';

      mockExistsSync.mockImplementation((p) => {
        // Config file exists, library path does not
        if (p === '/test/config.yaml') return true;
        return false;
      });
      mockReadFileSync.mockReturnValue('library_path: /nonexistent/path\n');

      expect(() => loadConfig()).toThrow('Library path does not exist: /nonexistent/path');
    });
  });

  describe('edge cases', () => {
    it('handles empty config file (no content)', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('');

      // Empty YAML parses to null/undefined, which will fail schema validation
      expect(() => loadConfig()).toThrow();
    });

    it('handles config with only comments', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('# This is a comment\n# Another comment\n');

      expect(() => loadConfig()).toThrow();
    });

    it('handles config with extra unknown fields (Zod strips by default)', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
library_path: /tmp/test-library
unknown_field: some_value
another_unknown: 42
`);

      const config = loadConfig();

      expect(config.library_path).toBe('/tmp/test-library');
      expect((config as Record<string, unknown>)['unknown_field']).toBeUndefined();
    });

    it('handles readFileSync throwing an error', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      expect(() => loadConfig()).toThrow('EACCES: permission denied');
    });

    it('handles HOME env not set for tilde expansion', () => {
      process.env.PULP_CONFIG = '~/config/pulp.yaml';
      delete process.env.HOME;

      // With HOME unset, expandHome joins empty string + path
      mockExistsSync.mockImplementation((p) => {
        const path = String(p);
        if (path.endsWith('pulp.yaml')) return true;
        if (path === '/tmp/test-library') return true;
        return false;
      });
      mockReadFileSync.mockReturnValue(VALID_YAML);

      // Should not throw - falls back to empty string for HOME
      const config = loadConfig();
      expect(config.library_path).toBe('/tmp/test-library');
    });

    it('handles boundary values for numeric configs', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
library_path: /tmp/test-library
search_context_chars: 10
search_max_matches_per_doc: 1
search_results_per_doc: 1
reading_history_max_days: 7
cover_width: 50
cover_height: 50
cover_quality: 1
default_daily_goal_minutes: 1
default_grace_period_days: 0
`);

      const config = loadConfig();

      expect(config.search_context_chars).toBe(10);
      expect(config.search_max_matches_per_doc).toBe(1);
      expect(config.search_results_per_doc).toBe(1);
      expect(config.reading_history_max_days).toBe(7);
      expect(config.cover_width).toBe(50);
      expect(config.cover_height).toBe(50);
      expect(config.cover_quality).toBe(1);
      expect(config.default_daily_goal_minutes).toBe(1);
      expect(config.default_grace_period_days).toBe(0);
    });

    it('handles maximum boundary values for numeric configs', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`
library_path: /tmp/test-library
search_context_chars: 500
search_max_matches_per_doc: 500
search_results_per_doc: 100
reading_history_max_days: 365
cover_width: 1000
cover_height: 1500
cover_quality: 100
default_daily_goal_minutes: 1440
default_grace_period_days: 7
`);

      const config = loadConfig();

      expect(config.search_context_chars).toBe(500);
      expect(config.search_max_matches_per_doc).toBe(500);
      expect(config.search_results_per_doc).toBe(100);
      expect(config.reading_history_max_days).toBe(365);
      expect(config.cover_width).toBe(1000);
      expect(config.cover_height).toBe(1500);
      expect(config.cover_quality).toBe(100);
      expect(config.default_daily_goal_minutes).toBe(1440);
      expect(config.default_grace_period_days).toBe(7);
    });
  });

  describe('console output', () => {
    it('logs the config path being loaded', () => {
      process.env.PULP_CONFIG = '/test/config.yaml';

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(VALID_YAML);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      loadConfig();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Loading config from:')
      );

      consoleSpy.mockRestore();
    });
  });
});
