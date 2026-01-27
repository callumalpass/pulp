# Pulp

Self-hosted PDF and EPUB reader that syncs with Obsidian literature notes. Stores reading progress, highlights, and bookmarks in markdown frontmatter.

Works best with [BibLib](https://github.com/callumalpass/obsidian-biblib), an Obsidian plugin for managing literature notes with bibliographic metadata.

## Screenshots

### Library

<p>
  <img src="screenshots/library.png" alt="Library - Dark Mode" width="600">
</p>

<p>
  <img src="screenshots/library-light.png" alt="Library - Light Mode" width="600">
</p>

### Reader

<p>
  <img src="screenshots/reader.png" alt="PDF Reader" width="600">
</p>

### Mobile

<p>
  <img src="screenshots/mobile.png" alt="Mobile View" width="200">
</p>

## Features

- PDF and EPUB reading with progress sync
- Highlights and bookmarks stored in frontmatter
- Full-text search across documents
- Reading statistics and daily goals
- Dictionary lookup
- E-ink display mode

## Requirements

- Node.js 20+
- A directory with markdown files linking to PDF/EPUB files

## Setup

Create `pulp.yaml` in `~/.config/pulp/` or set `PULP_CONFIG`:

```yaml
library_path: ~/path/to/literature-notes
source_key: source  # frontmatter key pointing to the PDF/EPUB file
```

## Development

```bash
npm install

# Start both servers
npm run dev:server  # http://localhost:3000
npm run dev:web     # http://localhost:5173
```

## Build

```bash
npm run build
npm start -w @pulp/server
```

## Tests

```bash
npm run test:e2e
npm run typecheck
npm run lint
```

## Structure

```
packages/
├── server/   # Fastify API server
├── web/      # React frontend (Vite)
└── shared/   # TypeScript types
```
