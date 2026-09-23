/* Admin-only client provisioning.

   Creating a login needs the service-role key, which must never reach the
   browser, so it lives here as a function secret. The caller's own JWT is
   checked first: the account must exist in public.clients with role
   'admin', otherwise the request is refused before anything is created.

   Deploy:
     supabase functions deploy admin-create-client
   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.)
*/
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  /* supabase-js sends apikey and x-client-info alongside the token, and a
     preflight that does not list them fails before the request is made. */
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/* Readable but unguessable: the admin reads it out to the client once and
   the client is forced to replace it at first sign-in. */
function tempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return "BAC-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply(405, { error: "Use POST." });

  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return reply(401, { error: "Sign in first." });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const caller = await createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  }).auth.getUser();

  if (caller.error || !caller.data.user) return reply(401, { error: "Sign in first." });

  const { data: profile } = await admin
    .from("clients").select("role").eq("id", caller.data.user.id).maybeSingle();

  if (profile?.role !== "admin") return reply(403, { error: "Admins only." });

  let payload: { email?: string; full_name?: string; company?: string; phone?: string };
  try {
    payload = await request.json();
  } catch {
    return reply(400, { error: "Send JSON." });
  }

  const email = (payload.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(400, { error: "A valid email is required." });

  const password = tempPassword();
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: payload.full_name ?? "",
      company: payload.company ?? "",
      phone: payload.phone ?? "",
    },
  });

  if (created.error) {
    const already = /already/i.test(created.error.message);
    return reply(already ? 409 : 400, {
      error: already ? "An account already exists for that email." : created.error.message,
    });
  }

  /* The auth.users trigger writes public.clients; this only adds what the
     trigger cannot know — that the password is temporary. */
  const { data: row } = await admin
    .from("clients")
    .update({
      must_change_password: true,
      full_name: payload.full_name ?? null,
      company: payload.company ?? null,
      phone: payload.phone ?? null,
    })
    .eq("id", created.data.user!.id)
    .select("client_code")
    .maybeSingle();

  return reply(200, { email, password, client_code: row?.client_code ?? null });
});
