-- Subsystem B: add the 'agency' role. Isolated in its own migration because a new enum
-- value must be committed before it can be referenced (migration 27 uses it).

alter type public.user_role add value if not exists 'agency';
