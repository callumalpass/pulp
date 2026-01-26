import { z } from 'zod';

export const configSchema = z.object({
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
  highlight_template: z.string().default(
    '- [[{{source}}#page={{page}}&selection={{selection}}|"{{text}}"]]{{#if note}}\n{{note}}{{/if}}'
  ),
  highlight_template_epub: z.string().default(
    '- [[{{source}}#cfi={{cfi}}|"{{text}}"]]{{#if note}}\n{{note}}{{/if}}'
  ),
  progress_debounce_ms: z.number().default(5000),
  exclude_folders: z.array(z.string()).default(['.obsidian', '.trash', 'templates']),
  bookmarks_key: z.string().default('bookmarks'),
  pinned_key: z.string().default('pinned'),
  reading_stats_key: z.string().default('reading_stats'),
  reading_history_key: z.string().default('reading_history'),
});

export type Config = z.infer<typeof configSchema>;
