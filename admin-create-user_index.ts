// Quality Project Control V7.2 · admin-create-user
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ROLE_MATRIX: Record<string, string[]> = {
  EJECUCION: [],
  CALIDAD: ["EJECUCION"],
  COORDINADOR_CALIDAD: ["EJECUCION", "CALIDAD"],
  GERENCIA: ["EJECUCION", "CALIDAD", "COORDINADOR_CALIDAD", "GERENCIA"],
  PRESIDENTE: ["EJECUCION", "CALIDAD", "COORDINADOR_CALIDAD", "GERENCIA", "PRESIDENTE", "IT"],
  IT: ["EJECUCION", "CALIDAD", "COORDINADOR_CALIDAD", "GERENCIA", "PRESIDENTE", "IT"],
};

const PASSWORD_RESET_ROLES = new Set(["CALIDAD", "COORDINADOR_CALIDAD", "IT"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) throw new Error("Faltan variables de entorno de Supabase.");

    const authHeader = req.headers.get("Authorization") || "";
    const admin = createClient(supabaseUrl, serviceKey);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) throw new Error("Usuario no autenticado.");

    const { data: actorProfile, error: actorError } = await admin
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", authData.user.id)
      .single();
    if (actorError || !actorProfile?.is_active) throw new Error("Perfil administrador no disponible.");

    const body = await req.json();
    const email = String(body.email || "").toLowerCase().trim();
    const role = String(body.role || "EJECUCION").toUpperCase();
    const mode = body.mode === "update" ? "update" : "create";
    if (!email) throw new Error("Correo requerido.");
    if (!ROLE_MATRIX[actorProfile.role]?.includes(role)) throw new Error("Su rol no puede administrar el rol seleccionado.");

    let userId = body.auth_id || null;
    let existingProfile: Record<string, unknown> | null = null;

    if (userId) {
      const { data } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
      existingProfile = data;
    } else if (mode === "update") {
      const { data } = await admin.from("profiles").select("*").ilike("email", email).maybeSingle();
      existingProfile = data;
      userId = data?.id || null;
    }

    if (existingProfile?.role && !ROLE_MATRIX[actorProfile.role]?.includes(String(existingProfile.role))) {
      throw new Error("Su rol no puede modificar la cuenta seleccionada.");
    }

    if (!userId) {
      if (!body.password) throw new Error("La contraseña inicial es obligatoria.");
      const created = await admin.auth.admin.createUser({
        email,
        password: String(body.password),
        email_confirm: true,
      });
      if (created.error) throw created.error;
      userId = created.data.user.id;
    } else if (body.password) {
      if (!PASSWORD_RESET_ROLES.has(actorProfile.role)) {
        throw new Error("Solo Calidad o Tecnología puede cambiar o restaurar contraseñas existentes.");
      }
      const updated = await admin.auth.admin.updateUserById(userId, { password: String(body.password) });
      if (updated.error) throw updated.error;
    }

    const profile = {
      id: userId,
      legacy_id: body.legacy_id || existingProfile?.legacy_id || userId,
      full_name: String(body.full_name || existingProfile?.full_name || email),
      email,
      role,
      execution_area: body.execution_area || null,
      project_ids: Array.isArray(body.project_ids) && body.project_ids.length ? body.project_ids : ["LCE"],
      is_active: body.is_active !== false,
      updated_at: new Date().toISOString(),
    };

    const upsert = await admin.from("profiles").upsert(profile, { onConflict: "id" }).select().single();
    if (upsert.error) throw upsert.error;

    const directory = await admin.from("login_directory").upsert({
      email,
      full_name: profile.full_name,
      role,
      is_active: profile.is_active,
      updated_at: new Date().toISOString(),
    });
    if (directory.error) throw directory.error;

    return new Response(JSON.stringify({ profile: upsert.data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || String(error) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
