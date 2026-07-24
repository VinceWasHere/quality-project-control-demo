// Quality Project Control V7.3 · admin-create-user
// Creates or repairs Supabase Auth users and their application profiles.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALL_ROLES = [
  "EJECUCION",
  "CALIDAD",
  "COORDINADOR_CALIDAD",
  "GERENCIA",
  "PRESIDENTE",
  "IT",
] as const;

type AppRole = (typeof ALL_ROLES)[number];

const ROLE_MATRIX: Record<AppRole, AppRole[]> = {
  EJECUCION: [],
  CALIDAD: ["EJECUCION"],
  COORDINADOR_CALIDAD: ["EJECUCION", "CALIDAD"],
  GERENCIA: ["EJECUCION", "CALIDAD", "COORDINADOR_CALIDAD", "GERENCIA"],
  PRESIDENTE: [...ALL_ROLES],
  IT: [...ALL_ROLES],
};

// IT has every permission. Password changes remain restricted to Quality and IT.
const PASSWORD_RESET_ROLES = new Set<AppRole>(["CALIDAD", "COORDINADOR_CALIDAD", "IT"]);

class ApiError extends Error {
  status: number;
  stage: string;

  constructor(message: string, status = 400, stage = "request") {
    super(message);
    this.status = status;
    this.stage = stage;
  }
}

function normalizeRole(value: unknown): AppRole {
  const role = String(value || "EJECUCION").toUpperCase() as AppRole;
  if (!ALL_ROLES.includes(role)) throw new ApiError(`Rol no válido: ${role}.`, 400, "validation");
  return role;
}

async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const normalized = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new ApiError(error.message, 500, "auth-list");
    const found = data.users.find((user) => user.email?.toLowerCase() === normalized);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let stage = "bootstrap";
  let createdAuthUserId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) {
      throw new ApiError("Faltan variables internas de Supabase.", 500, "environment");
    }

    const authHeader = req.headers.get("Authorization") || "";
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    stage = "actor-auth";
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) throw new ApiError("Usuario no autenticado.", 401, stage);

    stage = "actor-profile";
    const { data: actorProfile, error: actorError } = await admin
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", authData.user.id)
      .single();
    if (actorError || !actorProfile?.is_active) {
      throw new ApiError("El perfil administrador no está activo o no existe.", 403, stage);
    }

    const actorRole = normalizeRole(actorProfile.role);
    const body = await req.json();
    const email = String(body.email || "").toLowerCase().trim();
    const targetRole = normalizeRole(body.role);
    const mode = body.mode === "update" ? "update" : "create";

    stage = "validation";
    if (!email) throw new ApiError("Correo requerido.", 400, stage);
    if (!ROLE_MATRIX[actorRole].includes(targetRole)) {
      throw new ApiError("Su rol no puede administrar el rol seleccionado.", 403, stage);
    }

    stage = "existing-profile";
    let existingProfile: Record<string, unknown> | null = null;
    if (body.auth_id) {
      const { data, error } = await admin.from("profiles").select("*").eq("id", body.auth_id).maybeSingle();
      if (error) throw new ApiError(error.message, 500, stage);
      existingProfile = data;
    }
    if (!existingProfile) {
      const { data, error } = await admin.from("profiles").select("*").ilike("email", email).maybeSingle();
      if (error) throw new ApiError(error.message, 500, stage);
      existingProfile = data;
    }

    if (existingProfile?.role) {
      const existingRole = normalizeRole(existingProfile.role);
      if (!ROLE_MATRIX[actorRole].includes(existingRole)) {
        throw new ApiError("Su rol no puede modificar la cuenta seleccionada.", 403, stage);
      }
    }

    stage = "auth-user-lookup";
    let authUser = await findAuthUserByEmail(admin, email);
    let userId = String(body.auth_id || existingProfile?.id || authUser?.id || "") || null;

    if (!authUser && !userId) {
      stage = "auth-create";
      if (!body.password) throw new ApiError("La contraseña inicial es obligatoria.", 400, stage);
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: String(body.password),
        email_confirm: true,
        user_metadata: {
          full_name: String(body.full_name || email),
          role: targetRole,
        },
      });
      if (error || !data.user) throw new ApiError(error?.message || "No se pudo crear el usuario.", 400, stage);
      authUser = data.user;
      userId = data.user.id;
      createdAuthUserId = data.user.id;
    } else if (!authUser && userId) {
      stage = "auth-by-id";
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data.user) throw new ApiError(error?.message || "Usuario de autenticación no encontrado.", 404, stage);
      authUser = data.user;
    }

    if (!userId || !authUser) throw new ApiError("No se pudo resolver el usuario de autenticación.", 500, stage);

    stage = "auth-update";
    const authUpdates: Record<string, unknown> = {
      email,
      user_metadata: {
        ...(authUser.user_metadata || {}),
        full_name: String(body.full_name || existingProfile?.full_name || email),
        role: targetRole,
      },
    };
    if (body.password) {
      const isExistingAccount = !createdAuthUserId;
      if (isExistingAccount && !PASSWORD_RESET_ROLES.has(actorRole)) {
        throw new ApiError("Solo Calidad o Tecnología puede cambiar o restaurar contraseñas existentes.", 403, stage);
      }
      authUpdates.password = String(body.password);
    }
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, authUpdates);
    if (authUpdateError) throw new ApiError(authUpdateError.message, 400, stage);

    const profile = {
      id: userId,
      legacy_id: String(body.legacy_id || existingProfile?.legacy_id || userId),
      full_name: String(body.full_name || existingProfile?.full_name || email),
      email,
      role: targetRole,
      execution_area: body.execution_area || null,
      project_ids: Array.isArray(body.project_ids) && body.project_ids.length
        ? body.project_ids
        : (existingProfile?.project_ids || ["LCE"]),
      is_active: body.is_active !== false,
      updated_at: new Date().toISOString(),
    };

    stage = "profile-upsert";
    const { data: savedProfile, error: profileError } = await admin
      .from("profiles")
      .upsert(profile, { onConflict: "id" })
      .select()
      .single();
    if (profileError) throw new ApiError(profileError.message, 400, stage);

    stage = "directory-upsert";
    const { error: directoryError } = await admin.from("login_directory").upsert({
      email,
      full_name: profile.full_name,
      role: targetRole,
      is_active: profile.is_active,
      updated_at: new Date().toISOString(),
    });
    if (directoryError) throw new ApiError(directoryError.message, 400, stage);

    return new Response(JSON.stringify({
      ok: true,
      mode,
      repaired_orphan: Boolean(authUser && !existingProfile && !createdAuthUserId),
      profile: savedProfile,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const apiError = error instanceof ApiError
      ? error
      : new ApiError(error instanceof Error ? error.message : String(error), 500, stage);

    // Avoid leaving new orphan Auth users when profile creation fails.
    if (createdAuthUserId && apiError.stage === "profile-upsert") {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        await admin.auth.admin.deleteUser(createdAuthUserId);
      } catch (rollbackError) {
        console.error("admin-create-user rollback failed", rollbackError);
      }
    }

    console.error("admin-create-user failed", {
      stage: apiError.stage,
      status: apiError.status,
      message: apiError.message,
    });

    return new Response(JSON.stringify({
      error: apiError.message,
      stage: apiError.stage,
    }), {
      status: apiError.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
