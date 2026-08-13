create extension if not exists vector;

create table if not exists public.retrieval_documents (
  id uuid primary key default gen_random_uuid(),
  operator_user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('resolution','change_record','knowledge','runbook','freshdesk_ticket')),
  source_id text not null,
  chunk_id text not null default '',
  account_number text not null default '',
  title text not null default '',
  lexical_text text not null default '',
  semantic_text text not null default '',
  source_status text not null default '',
  confidence text not null default '' check (confidence in ('','verified','probable','unknown')),
  source_created_at timestamptz,
  source_updated_at timestamptz,
  content_hash text not null,
  embedding vector(3072),
  embedded_content_hash text not null default '',
  embedding_model text not null default '',
  embedding_version text not null default '',
  embedding_status text not null default 'pending' check (embedding_status in ('pending','ready','failed','disabled','skipped')),
  embedding_error text not null default '',
  embedding_attempts integer not null default 0,
  embedded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(lexical_text,''))
  ) stored,
  unique (operator_user_id, source_type, source_id, chunk_id)
);

grant select, insert, update, delete on public.retrieval_documents to authenticated;
grant all on public.retrieval_documents to service_role;

alter table public.retrieval_documents enable row level security;

create policy "Operators manage their own retrieval documents"
  on public.retrieval_documents for all to authenticated
  using (auth.uid() = operator_user_id)
  with check (auth.uid() = operator_user_id);

create index if not exists retrieval_documents_fts_idx
  on public.retrieval_documents using gin (search_vector);
create index if not exists retrieval_documents_owner_type_idx
  on public.retrieval_documents (operator_user_id, source_type);
create index if not exists retrieval_documents_owner_account_idx
  on public.retrieval_documents (operator_user_id, account_number);
create index if not exists retrieval_documents_owner_status_idx
  on public.retrieval_documents (operator_user_id, source_status);
create index if not exists retrieval_documents_owner_conf_idx
  on public.retrieval_documents (operator_user_id, confidence);
create index if not exists retrieval_documents_updated_idx
  on public.retrieval_documents (source_updated_at desc);
create index if not exists retrieval_documents_embed_status_idx
  on public.retrieval_documents (operator_user_id, embedding_status);
create index if not exists retrieval_documents_embedding_hnsw
  on public.retrieval_documents using hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

create trigger retrieval_documents_set_updated_at
  before update on public.retrieval_documents
  for each row execute function public.update_updated_at_column();

-- Keyword (lexical) candidates. Structured filters are applied inside the
-- query so relevant account rows can never be filtered out after ranking.
create or replace function public.retrieval_lexical_candidates(
  p_query text,
  p_account_number text default null,
  p_source_types text[] default null,
  p_confidences text[] default null,
  p_include_historical boolean default false,
  p_limit integer default 30
)
returns table (
  id uuid,
  source_type text,
  source_id text,
  chunk_id text,
  account_number text,
  title text,
  lexical_text text,
  source_status text,
  confidence text,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  embedding_status text,
  lexical_score double precision
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select d.id, d.source_type, d.source_id, d.chunk_id, d.account_number, d.title,
         d.lexical_text, d.source_status, d.confidence,
         d.source_created_at, d.source_updated_at, d.embedding_status,
         ts_rank_cd(d.search_vector, websearch_to_tsquery('simple', p_query))::double precision
           + case when d.lexical_text ilike '%' || replace(replace(coalesce(p_query,''), '%', E'\\%'), '_', E'\\_') || '%' escape E'\\' then 0.5 else 0 end
  from public.retrieval_documents d
  where d.operator_user_id = auth.uid()
    and nullif(btrim(coalesce(p_query,'')), '') is not null
    and (p_account_number is null or d.account_number = p_account_number)
    and (p_source_types is null or d.source_type = any(p_source_types))
    and (p_confidences is null or d.confidence = any(p_confidences))
    and (p_include_historical or d.source_status not in ('superseded','archived'))
    and (
      d.search_vector @@ websearch_to_tsquery('simple', p_query)
      or d.title ilike '%' || replace(replace(p_query, '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
      or d.lexical_text ilike '%' || replace(replace(p_query, '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
    )
  order by 13 desc, d.source_updated_at desc nulls last
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- Semantic candidates. Only fresh embeddings from the requested model are
-- eligible: a stale vector is never presented as current evidence.
create or replace function public.retrieval_semantic_candidates(
  p_embedding text,
  p_model text,
  p_account_number text default null,
  p_source_types text[] default null,
  p_confidences text[] default null,
  p_include_historical boolean default false,
  p_limit integer default 30
)
returns table (
  id uuid,
  source_type text,
  source_id text,
  chunk_id text,
  account_number text,
  title text,
  lexical_text text,
  source_status text,
  confidence text,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  embedding_status text,
  distance double precision
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select d.id, d.source_type, d.source_id, d.chunk_id, d.account_number, d.title,
         d.lexical_text, d.source_status, d.confidence,
         d.source_created_at, d.source_updated_at, d.embedding_status,
         (d.embedding::halfvec(3072) <=> (p_embedding::halfvec(3072)))::double precision
  from public.retrieval_documents d
  where d.operator_user_id = auth.uid()
    and d.embedding is not null
    and d.embedding_status = 'ready'
    and d.embedding_model = p_model
    and d.embedded_content_hash = d.content_hash
    and (p_account_number is null or d.account_number = p_account_number)
    and (p_source_types is null or d.source_type = any(p_source_types))
    and (p_confidences is null or d.confidence = any(p_confidences))
    and (p_include_historical or d.source_status not in ('superseded','archived'))
  order by d.embedding::halfvec(3072) <=> (p_embedding::halfvec(3072))
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke all on function public.retrieval_lexical_candidates(text, text, text[], text[], boolean, integer) from anon;
revoke all on function public.retrieval_semantic_candidates(text, text, text, text[], text[], boolean, integer) from anon;
grant execute on function public.retrieval_lexical_candidates(text, text, text[], text[], boolean, integer) to authenticated;
grant execute on function public.retrieval_semantic_candidates(text, text, text, text[], text[], boolean, integer) to authenticated;