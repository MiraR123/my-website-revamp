-- Sample delivery challan / invoice data for client BAC-1004.
-- Run AFTER supabase-setup.sql, supabase-billing.sql and supabase-billing-v2.sql.
-- Safe to re-run: it clears this client's rows first. No other client is touched.
--
-- Challans with an invoice_id are billed and so do not appear on the DC tab;
-- the three with invoice_id null are what the client sees there.

do $$
declare
  v_client uuid;
  v_inv1   uuid;
  v_inv2   uuid;
begin
  select id into v_client
  from public.clients
  where client_code = 'BAC-1004';

  if v_client is null then
    raise exception 'No client with client_code BAC-1004 — check public.clients.';
  end if;

  delete from public.delivery_challans where client_id = v_client;
  delete from public.invoices          where client_id = v_client;

  insert into public.invoices (client_id, invoice_date, invoice_amount)
  values (v_client, current_date - 45, 56640)
  returning id into v_inv1;

  insert into public.invoices (client_id, invoice_date, invoice_amount)
  values (v_client, current_date - 12, 37170)
  returning id into v_inv2;

  insert into public.delivery_challans
    (client_id, dc_number, dc_date, dc_description, dc_amount, invoice_id)
  values
    (v_client, 'DC-4001', current_date - 58, 'A0 drawing prints — tender set',        18000, v_inv1),
    (v_client, 'DC-4002', current_date - 54, 'Spiral binding — 12 volumes',            6000, v_inv1),
    (v_client, 'DC-4003', current_date - 49, 'A1 colour plots — layout revision',     24000, v_inv1),
    (v_client, 'DC-4004', current_date - 25, 'Large format scanning — old drawings',  20000, v_inv2),
    (v_client, 'DC-4005', current_date - 20, 'Photocopies — A3 double sided',         11500, v_inv2),
    (v_client, 'DC-4006', current_date -  8, 'A0 mono plots — site copies',           13500, null),
    (v_client, 'DC-4007', current_date -  4, 'Lamination — display boards',            4800, null),
    (v_client, 'DC-4008', current_date -  1, 'Drawing scanning to PDF/A',             10500, null);
end $$;
