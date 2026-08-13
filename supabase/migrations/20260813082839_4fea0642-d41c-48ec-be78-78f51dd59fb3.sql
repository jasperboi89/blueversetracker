alter extension vector set schema extensions;

alter function public.retrieval_semantic_candidates(text, text, text, text[], text[], boolean, integer)
  set search_path to 'public', 'extensions';
alter function public.retrieval_lexical_candidates(text, text, text[], text[], boolean, integer)
  set search_path to 'public', 'extensions';