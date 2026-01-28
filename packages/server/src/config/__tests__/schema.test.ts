import { describe, it, expect } from 'vitest';
import { configSchema } from '../schema.js';

const MINIMAL_CONFIG = {
  library_path: '/tmp/test-library',
};

describe('configSchema', () => {
  describe('required fields', () => {
    it('requires library_path', () => {
      const result = configSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.errors.map(e => e.path.join('.'));
        expect(paths).toContain('library_path');
      }
    });

    it('rejects empty library_path', () => {
      const result = configSchema.safeParse({ library_path: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('library_path is required');
      }
    });

    it('accepts a minimal config with only library_path', () => {
      const result = configSchema.safeParse(MINIMAL_CONFIG);
      expect(result.success).toBe(true);
    });
  });

  describe('default values', () => {
    it('applies all defaults for a minimal config', () => {
      const result = configSchema.parse(MINIMAL_CONFIG);

      // Frontmatter keys
      expect(result.literature_note_tag).toBe('literature-note');
      expect(result.source_key).toBe('source');
      expect(result.progress_key).toBe('reading_progress');
      expect(result.last_read_key).toBe('last_read');
      expect(result.last_opened_cfi_key).toBe('last_opened_cfi');
      expect(result.date_created_key).toBe('dateCreated');
      expect(result.author_key).toBe('author');
      expect(result.rating_key).toBe('rating');
      expect(result.total_pages_key).toBe('total_pages');
      expect(result.bookmarks_key).toBe('bookmarks');
      expect(result.pinned_key).toBe('pinned');
      expect(result.reading_stats_key).toBe('reading_stats');
      expect(result.reading_history_key).toBe('reading_history');
      expect(result.reading_sessions_key).toBe('reading_sessions');
      expect(result.date_finished_key).toBe('date_finished');
      expect(result.collections_key).toBe('collections');
      expect(result.reader_preferences_key).toBe('reader_preferences');
      expect(result.current_chapter_key).toBe('current_chapter');
      expect(result.book_notes_key).toBe('book_notes');
      expect(result.paused_key).toBe('paused');
      expect(result.paused_at_key).toBe('paused_at');

      // Timing
      expect(result.progress_debounce_ms).toBe(5000);

      // Folder exclusions
      expect(result.exclude_folders).toEqual(['.obsidian', '.trash', 'templates']);

      // Search
      expect(result.search_context_chars).toBe(80);
      expect(result.search_max_matches_per_doc).toBe(50);
      expect(result.search_results_per_doc).toBe(10);

      // Reading history
      expect(result.reading_history_max_days).toBe(90);

      // Cover extraction
      expect(result.cover_width).toBe(300);
      expect(result.cover_height).toBe(450);
      expect(result.cover_quality).toBe(80);

      // Reading goals
      expect(result.default_daily_goal_minutes).toBe(30);
      expect(result.default_grace_period_days).toBe(1);
    });

    it('applies default highlight templates', () => {
      const result = configSchema.parse(MINIMAL_CONFIG);
      expect(result.highlight_template).toContain('{{source}}');
      expect(result.highlight_template).toContain('page={{page}}');
      expect(result.highlight_template).toContain('{{text}}');
      expect(result.highlight_template_epub).toContain('{{source}}');
      expect(result.highlight_template_epub).toContain('cfi={{cfi}}');
    });
  });

  describe('custom values override defaults', () => {
    it('accepts custom frontmatter keys', () => {
      const result = configSchema.parse({
        ...MINIMAL_CONFIG,
        literature_note_tag: 'book',
        source_key: 'file',
        progress_key: 'pct',
      });
      expect(result.literature_note_tag).toBe('book');
      expect(result.source_key).toBe('file');
      expect(result.progress_key).toBe('pct');
    });

    it('accepts custom highlight templates', () => {
      const template = '- {{text}} (p. {{pageLabel}})';
      const epubTemplate = '- {{text}} [{{cfi}}]';
      const result = configSchema.parse({
        ...MINIMAL_CONFIG,
        highlight_template: template,
        highlight_template_epub: epubTemplate,
      });
      expect(result.highlight_template).toBe(template);
      expect(result.highlight_template_epub).toBe(epubTemplate);
    });

    it('accepts custom exclude_folders', () => {
      const result = configSchema.parse({
        ...MINIMAL_CONFIG,
        exclude_folders: ['node_modules', '.git'],
      });
      expect(result.exclude_folders).toEqual(['node_modules', '.git']);
    });

    it('accepts an empty exclude_folders array', () => {
      const result = configSchema.parse({
        ...MINIMAL_CONFIG,
        exclude_folders: [],
      });
      expect(result.exclude_folders).toEqual([]);
    });
  });

  describe('search configuration validation', () => {
    it('accepts values within valid range', () => {
      const result = configSchema.parse({
        ...MINIMAL_CONFIG,
        search_context_chars: 200,
        search_max_matches_per_doc: 100,
        search_results_per_doc: 50,
      });
      expect(result.search_context_chars).toBe(200);
      expect(result.search_max_matches_per_doc).toBe(100);
      expect(result.search_results_per_doc).toBe(50);
    });

    it('accepts boundary minimum values', () => {
      const result = configSchema.parse({
        ...MINIMAL_CONFIG,
        search_context_chars: 10,
        search_max_matches_per_doc: 1,
        search_results_per_doc: 1,
      });
      expect(result.search_context_chars).toBe(10);
      expect(result.search_max_matches_per_doc).toBe(1);
      expect(result.search_results_per_doc).toBe(1);
    });

    it('accepts boundary maximum values', () => {
      const result = configSchema.parse({
        ...MINIMAL_CONFIG,
        search_context_chars: 500,
        search_max_matches_per_doc: 500,
        search_results_per_doc: 100,
      });
      expect(result.search_context_chars).toBe(500);
      expect(result.search_max_matches_per_doc).toBe(500);
      expect(result.search_results_per_doc).toBe(100);
    });

    it('rejects search_context_chars below minimum', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        search_context_chars: 9,
      });
      expect(result.success).toBe(false);
    });

    it('rejects search_context_chars above maximum', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        search_context_chars: 501,
      });
      expect(result.success).toBe(false);
    });

    it('rejects search_max_matches_per_doc below minimum', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        search_max_matches_per_doc: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects search_max_matches_per_doc above maximum', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        search_max_matches_per_doc: 501,
      });
      expect(result.success).toBe(false);
    });

    it('rejects search_results_per_doc below minimum', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        search_results_per_doc: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects search_results_per_doc above maximum', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        search_results_per_doc: 101,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('reading history validation', () => {
    it('accepts values within valid range', () => {
      const result = configSchema.parse({
        ...MINIMAL_CONFIG,
        reading_history_max_days: 30,
      });
      expect(result.reading_history_max_days).toBe(30);
    });

    it('accepts boundary minimum (7 days)', () => {
      const result = configSchema.parse({
        ...MINIMAL_CONFIG,
        reading_history_max_days: 7,
      });
      expect(result.reading_history_max_days).toBe(7);
    });

    it('accepts boundary maximum (365 days)', () => {
      const result = configSchema.parse({
        ...MINIMAL_CONFIG,
        reading_history_max_days: 365,
      });
      expect(result.reading_history_max_days).toBe(365);
    });

    it('rejects below minimum', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        reading_history_max_days: 6,
      });
      expect(result.success).toBe(false);
    });

    it('rejects above maximum', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        reading_history_max_days: 366,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('cover extraction validation', () => {
    it('accepts values within valid range', () => {
      const result = configSchema.parse({
        ...MINIMAL_CONFIG,
        cover_width: 200,
        cover_height: 300,
        cover_quality: 95,
      });
      expect(result.cover_width).toBe(200);
      expect(result.cover_height).toBe(300);
      expect(result.cover_quality).toBe(95);
    });

    it('accepts boundary minimum values', () => {
      const result = configSchema.parse({
        ...MINIMAL_CONFIG,
        cover_width: 50,
        cover_height: 50,
        cover_quality: 1,
      });
      expect(result.cover_width).toBe(50);
      expect(result.cover_height).toBe(50);
      expect(result.cover_quality).toBe(1);
    });

    it('accepts boundary maximum values', () => {
      const result = configSchema.parse({
        ...MINIMAL_CONFIG,
        cover_width: 1000,
        cover_height: 1500,
        cover_quality: 100,
      });
      expect(result.cover_width).toBe(1000);
      expect(result.cover_height).toBe(1500);
      expect(result.cover_quality).toBe(100);
    });

    it('rejects cover_width below minimum', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        cover_width: 49,
      });
      expect(result.success).toBe(false);
    });

    it('rejects cover_width above maximum', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        cover_width: 1001,
      });
      expect(result.success).toBe(false);
    });

    it('rejects cover_height below minimum', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        cover_height: 49,
      });
      expect(result.success).toBe(false);
    });

    it('rejects cover_height above maximum', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        cover_height: 1501,
      });
      expect(result.success).toBe(false);
    });

    it('rejects cover_quality below minimum', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        cover_quality: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects cover_quality above maximum', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        cover_quality: 101,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('reading goals validation', () => {
    it('accepts values within valid range', () => {
      const result = configSchema.parse({
        ...MINIMAL_CONFIG,
        default_daily_goal_minutes: 60,
        default_grace_period_days: 3,
      });
      expect(result.default_daily_goal_minutes).toBe(60);
      expect(result.default_grace_period_days).toBe(3);
    });

    it('accepts boundary minimum values', () => {
      const result = configSchema.parse({
        ...MINIMAL_CONFIG,
        default_daily_goal_minutes: 1,
        default_grace_period_days: 0,
      });
      expect(result.default_daily_goal_minutes).toBe(1);
      expect(result.default_grace_period_days).toBe(0);
    });

    it('accepts boundary maximum values', () => {
      const result = configSchema.parse({
        ...MINIMAL_CONFIG,
        default_daily_goal_minutes: 1440,
        default_grace_period_days: 7,
      });
      expect(result.default_daily_goal_minutes).toBe(1440);
      expect(result.default_grace_period_days).toBe(7);
    });

    it('rejects daily goal below minimum', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        default_daily_goal_minutes: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects daily goal above maximum (1440 = 24 hours)', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        default_daily_goal_minutes: 1441,
      });
      expect(result.success).toBe(false);
    });

    it('rejects grace period below minimum', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        default_grace_period_days: -1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects grace period above maximum', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        default_grace_period_days: 8,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('type coercion and edge cases', () => {
    it('rejects non-number for numeric fields', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        cover_width: 'not-a-number',
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-string for string fields', () => {
      const result = configSchema.safeParse({
        library_path: 123,
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-array for exclude_folders', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        exclude_folders: 'not-an-array',
      });
      expect(result.success).toBe(false);
    });

    it('strips unknown keys', () => {
      const result = configSchema.safeParse({
        ...MINIMAL_CONFIG,
        unknown_key: 'should-be-stripped',
      });
      // Zod strips unknown keys by default
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as Record<string, unknown>)['unknown_key']).toBeUndefined();
      }
    });

    it('handles a full config with all fields specified', () => {
      const fullConfig = {
        library_path: '/home/user/vault',
        literature_note_tag: 'book',
        source_key: 'file',
        progress_key: 'pct',
        last_read_key: 'read_at',
        last_opened_cfi_key: 'cfi',
        date_created_key: 'created',
        author_key: 'writer',
        rating_key: 'stars',
        total_pages_key: 'pages',
        bookmarks_key: 'marks',
        pinned_key: 'pin',
        reading_stats_key: 'stats',
        reading_history_key: 'history',
        reading_sessions_key: 'sessions',
        date_finished_key: 'finished',
        collections_key: 'tags',
        reader_preferences_key: 'prefs',
        current_chapter_key: 'chapter',
        book_notes_key: 'notes',
        paused_key: 'is_paused',
        paused_at_key: 'pause_time',
        highlight_template: '{{text}}',
        highlight_template_epub: '{{text}}',
        progress_debounce_ms: 3000,
        exclude_folders: ['.git'],
        search_context_chars: 150,
        search_max_matches_per_doc: 25,
        search_results_per_doc: 5,
        reading_history_max_days: 60,
        cover_width: 400,
        cover_height: 600,
        cover_quality: 90,
        default_daily_goal_minutes: 45,
        default_grace_period_days: 2,
      };
      const result = configSchema.parse(fullConfig);
      expect(result).toMatchObject(fullConfig);
    });

    it('reports multiple validation errors at once', () => {
      const result = configSchema.safeParse({
        // missing library_path
        cover_width: -1,
        cover_quality: 999,
        search_context_chars: 0,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('progress_debounce_ms', () => {
    it('defaults to 5000', () => {
      const result = configSchema.parse(MINIMAL_CONFIG);
      expect(result.progress_debounce_ms).toBe(5000);
    });

    it('accepts custom value', () => {
      const result = configSchema.parse({
        ...MINIMAL_CONFIG,
        progress_debounce_ms: 10000,
      });
      expect(result.progress_debounce_ms).toBe(10000);
    });
  });
});
