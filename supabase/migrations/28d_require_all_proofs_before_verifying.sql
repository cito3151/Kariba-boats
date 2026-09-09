-- The owner page calls the four documents "required" and the admin card lists what is
-- still missing, but admin_review_company only ever demanded one approved document.
-- An admin could verify a company on the director ID alone and the tourist-facing
-- badge would light up for an operator with no proof it owns a boat or holds a licence.
--
-- The gate now requires an approved document of every kind in company_document_kind,
-- so adding a fifth proof later tightens this automatically rather than silently
-- leaving the rule at "four of five".

create or replace function public.admin_review_company(
  p_company_id uuid, p_status company_verification_status, p_note text default null
) returns public.companies
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_company public.companies; v_missing text;
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;

  if p_status = 'verified' then
    select string_agg(k::text, ', ' order by k::text) into v_missing
      from unnest(enum_range(null::company_document_kind)) k
     where not exists (
       select 1 from public.verification_documents d
        where d.company_id = p_company_id
          and d.doc_kind = k
          and d.review_status = 'approved'
     );
    if v_missing is not null then
      raise exception 'Approve every ownership proof first. Still outstanding: %', v_missing;
    end if;
  end if;

  update public.companies set
    verification_status = p_status,
    verification_note = p_note,
    verified_at = case when p_status = 'verified' then now() else null end,
    verified_by = case when p_status = 'verified' then auth.uid() else null end
  where id = p_company_id returning * into v_company;
  if v_company.id is null then raise exception 'Company not found'; end if;
  return v_company;
end; $$;

revoke all on function public.admin_review_company(uuid, company_verification_status, text)
  from public, anon;
grant execute on function public.admin_review_company(uuid, company_verification_status, text)
  to authenticated;
