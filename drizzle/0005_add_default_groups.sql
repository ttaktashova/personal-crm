-- The five groups the owner starts with. Nobody is put into them: existing contacts
-- stay without groups. Runs once, in the same transaction as 0004_create_groups.
-- "on conflict do nothing" keeps a rerun on a database that already has such a group
-- (the unique index groups_name_key compares names without case and with "ё" as "е").
insert into groups (name) values
  ('Аналитики'),
  ('Друзья'),
  ('Знакомые'),
  ('Семья'),
  ('Теннис')
on conflict do nothing;
