# AnimeBox Supabase migrations

`supabase/migrations/` больше не игнорируется Git.

Новые schema changes лучше создавать через Supabase CLI:

```bash
supabase migration new descriptive_name
```

Существующие `supabase/*.sql` сохранены как исторические/manual scripts. Не удаляй их: они нужны, чтобы Git описывал текущую production schema, пока изменения постепенно переводятся в canonical migration history.
