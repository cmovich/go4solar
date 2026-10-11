-- 0010_id_hashes.sql — keyed hashes of full NIN / BVN for identity matching.
-- Never edit this file after it has been pushed; add a new migration instead.
--
-- nin_hash / bvn_hash = HMAC-SHA256(ID_HASH_SECRET, 'nin:<11 digits>' / 'bvn:<11 digits>'),
-- computed in the app (src/lib/ids/idHash.ts). The raw numbers are never stored.

alter table public.applications
  add column nin_hash text,
  add column bvn_hash text;

-- One active application per person (NIN). A declined application frees the NIN.
create unique index applications_one_active_per_nin
  on public.applications (nin_hash)
  where nin_hash is not null and status <> 'declined';

create index applications_bvn_hash_idx on public.applications (bvn_hash) where bvn_hash is not null;

comment on column public.applications.nin_hash is 'HMAC-SHA256 (ID_HASH_SECRET) of the full NIN; never the number itself';
comment on column public.applications.bvn_hash is 'HMAC-SHA256 (ID_HASH_SECRET) of the full BVN; never the number itself';
comment on column public.guarantees.nin_hash is 'HMAC-SHA256 (ID_HASH_SECRET) of the full NIN; never the number itself';
