
insert into storage.buckets (id, name, public) values ('org-databases', 'org-databases', false)
on conflict (id) do nothing;

create policy "Super admins manage org databases"
on storage.objects for all
to authenticated
using (bucket_id = 'org-databases' and public.has_role(auth.uid(), 'super_admin'::public.app_role))
with check (bucket_id = 'org-databases' and public.has_role(auth.uid(), 'super_admin'::public.app_role));
