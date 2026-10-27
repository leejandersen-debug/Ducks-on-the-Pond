-- Up Migration
-- Course corpus for search: the Trailhead documents, chunked and embedded offline
-- (scripts/chunk-text.mjs, scripts/embed-chunks.mjs) and loaded by scripts/load-corpus.mjs.
-- Vectors are all-MiniLM-L6-v2 (384 dimensions, normalized); lib/embed.ts embeds queries the same way.

create extension if not exists vector;  -- pgvector

create table doc_chunks (
  id             text primary key,                -- "employee-handbook-19"
  source         text not null,                   -- "employee-handbook.md"
  section        text,                            -- heading the chunk starts in
  sections       text[] not null default '{}',    -- every heading the chunk covers
  position       int  not null,                   -- order within the source
  content        text not null,
  words          int  not null,
  tokens         int  not null,
  embedding      vector(384) not null,
  loaded_at      timestamptz not null default now()
);

-- Cosine distance (<=>), the metric the vectors were built for.
create index doc_chunks_embedding_idx on doc_chunks using hnsw (embedding vector_cosine_ops);
create index doc_chunks_source_idx on doc_chunks (source);

-- Reference text: everyone may read it; only the loader (running as the owner) writes it.
alter table doc_chunks enable row level security;
create policy doc_chunks_read on doc_chunks for select using (true);
revoke all on doc_chunks from app_rw;
grant select on doc_chunks to app_rw;

-- Down Migration

drop table if exists doc_chunks;
drop extension if exists vector;
