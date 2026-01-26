import { z } from 'zod';

export const configSchema = z.object({
  // Core paths and keys
  library_path: z.string().min(1, 'library_path is required'),
  literature_note_tag: z.string().default('literature-note'),
  source_key: z.string().default('source'),
  progress_key: z.string().default('reading_progress'),
  last_read_key: z.string().default('last_read'),
  last_opened_cfi_key: z.string().default('last_opened_cfi'),
  date_created_key: z.string().default('dateCreated'),
  author_key: z.string().default('author'),
  rating_key: z.string().default('rating'),
  total_pages_key: z.string().default('total_pages'),
  bookmarks_key: z.string().default('bookmarks'),
  pinned_key: z.string().default('pinned'),
  reading_stats_key: z.string().default('reading_stats'),
  reading_history_key: z.string().default('reading_history'),
  date_finished_key: z.string().default('date_finished'),
  collections_key: z.string().default('collections'),

  // Highlight templates
  // Available variables: source, page, pageLabel, selection, text, note, createdAt
  highlight_template: z.string().default(
    '- [[{{source}}#page={{page}}&selection={{selection}}|"{{text}}"|p. {{pageLabel}}|{{createdAt}}]]{{#if note}}\n{{note}}{{/if}}'
  ),
  // Available variables: source, cfi, text, note, createdAt
  highlight_template_epub: z.string().default(
    '- [[{{source}}#cfi={{cfi}}|"{{text}}"|{{createdAt}}]]{{#if note}}\n{{note}}{{/if}}'
  ),

  // Timing and debouncing
  progress_debounce_ms: z.number().default(5000),

  // Folder exclusions
  exclude_folders: z.array(z.string()).default(['.obsidian', '.trash', 'templates']),

  // Search configuration
  search_context_chars: z.number().min(10).max(500).default(80),
  search_max_matches_per_doc: z.number().min(1).max(500).default(50),
  search_results_per_doc: z.number().min(1).max(100).default(10),

  // Reading history configuration
  reading_history_max_days: z.number().min(7).max(365).default(90),

  // Cover extraction configuration
  cover_width: z.number().min(50).max(1000).default(300),
  cover_height: z.number().min(50).max(1500).default(450),
  cover_quality: z.number().min(1).max(100).default(80),

  // Reading goals defaults
  default_daily_goal_minutes: z.number().min(1).max(1440).default(30),
  default_grace_period_days: z.number().min(0).max(7).default(1),
});

export type Config = z.infer<typeof configSchema>;
