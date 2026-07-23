
// supabase/functions/admin-create-user/index.ts
// Requiere variable de entorno SUPABASE_SERVICE_ROLE_KEY en Supabase Edge Functions.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const admin = createClient(supabaseUrl, serviceKey);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: sessionData, error: userError } = await userClient.auth.getUser();
    if (userError || !sessionData?.user) throw new Error("Usuario no autenticado.");
    const { data: actorProfile } = await admin.from("profiles").select("role").eq("id", sessionData.user.id).single();
    if (!["CALIDAD","COORDINADOR_CALIDAD","GERENCIA","PRESIDENTE"].includes(actorProfile?.role)) throw new Error("Sin permisos para crear usuarios.");

    const body = await req.json();
    const role = body.role || "EJECUCION";
    if (role === "CALIDAD" && actorProfile?.role !== "COORDINADOR_CALIDAD") throw new Error("Solo Gerente de Calidad puede administrar Calidad.");
    const email = String(body.email || "").toLowerCase().trim();
    if (!email) throw new Error("Correo requerido.");

    let userId = body.auth_id || null;
    if (!userId) {
      const created = await admin.auth.admin.createUser({ email, password: body.password, email_confirm: true });
      if (created.error) throw created.error;
      userId = created.data.user.id;
    } else if (body.password) {
      const updated = await admin.auth.admin.updateUserById(userId, { password: body.password });
      if (updated.error) throw updated.error;
    }

    const profile = {
      id: userId,
      legacy_id: body.legacy_id || userId,
      full_name: body.full_name,
      email,
      role,
      execution_area: body.execution_area || null,
      project_ids: body.project_ids || ["LCE"],
      is_active: body.is_active !== false,
      updated_at: new Date().toISOString(),
    };
    const upsert = await admin.from("profiles").upsert(profile, { onConflict: "id" }).select().single();
    if (upsert.error) throw upsert.error;
    await admin.from("login_directory").upsert({ email, full_name: profile.full_name, role, is_active: profile.is_active, updated_at: new Date().toISOString() });
    return new Response(JSON.stringify({ profile: upsert.data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
