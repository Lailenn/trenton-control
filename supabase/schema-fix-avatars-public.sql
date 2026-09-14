-- Pegar en SQL Editor de Supabase.
-- Hace públicas las fotos de perfil para que se vean al recargar.
-- Se puede correr más de una vez.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update
set public = true,
    file_size_limit = 12582912;

update storage.buckets
set public = true,
    file_size_limit = 12582912
where id = 'avatars';
