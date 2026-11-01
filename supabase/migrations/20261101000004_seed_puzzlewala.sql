-- Registers PuzzleWala. PostgreSQL generates its UUID once; re-running keeps the existing one.
insert into public.games (name, slug, description, version, status)
values (
  'PuzzleWala',
  'puzzlewala',
  'Educational jigsaw puzzles for children aged 3-6.',
  '1.0.0',
  'active'
)
on conflict (slug) do nothing;
