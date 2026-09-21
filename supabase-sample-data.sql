-- Sample delivery challan / invoice data for testing the dashboard tabs.
-- Run AFTER supabase-setup.sql, supabase-billing.sql and supabase-billing-v2.sql.
--
-- Change the email below to the client you sign in as, then run the whole file.
-- Re-running it is safe: it clears this client's sample rows first.

do $$
declare
  v_client uuid;
  v_inv1   uuid;
  v_inv2   uuid;
begin
  select id into v_client
  from public.clients
  where lower(email) = lower('aarthiradhakrishnan7@gmail.com');

  if v_client is null then
    raise exception 'No client found for that email — register and confirm the account first.';
  end if;

  -- start clean so the script can be re-run
  delete from public.delivery_challans where client_id = v_client;
  delete from public.invoices          where client_id = v_client;

  insert into public.invoices (client_id, invoice_date, invoice_amount)
  values (v_client, current_date - 45, 56640)
  returning id into v_inv1;

  insert into public.invoices (client_id, invoice_date, invoice_amount)
  values (v_client, current_date - 12, 37170)
  returning id into v_inv2;

  -- challans: five billed across the two invoices, three still to be billed
  insert into public.delivery_challans
    (client_id, dc_number, dc_date, dc_description, dc_amount, invoice_id)
  values
    (v_client, 'DC-1001', current_date - 58, 'A0 drawing prints — tender set',        18000, v_inv1),
    (v_client, 'DC-1002', current_date - 54, 'Spiral binding — 12 volumes',            6000, v_inv1),
    (v_client, 'DC-1003', current_date - 49, 'A1 colour plots — layout revision',     24000, v_inv1),
    (v_client, 'DC-1004', current_date - 25, 'Large format scanning — old drawings',  20000, v_inv2),
    (v_client, 'DC-1005', current_date - 20, 'Photocopies — A3 double sided',         11500, v_inv2),
    (v_client, 'DC-1006', current_date -  8, 'A0 mono plots — site copies',           13500, null),
    (v_client, 'DC-1007', current_date -  4, 'Lamination — display boards',            4800, null),
    (v_client, 'DC-1008', current_date -  1, 'Drawing scanning to PDF/A',             10500, null);
end $$;

-- optional: a few jobs for the Account tab
-- insert into public.jobs (client_id, reference, title, service, status)
-- select id, 'JOB-2201', 'Tender drawing set', 'Plotting', 'completed'
-- from public.clients where lower(email) = lower('aarthiradhakrishnan7@gmail.com');
