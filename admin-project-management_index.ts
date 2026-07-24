import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class ApiError extends Error {
  constructor(
    public message: string,
    public status = 400,
    public stage = "request",
    public details?: unknown,
  ) {
    super(message);
  }
}

type ProjectInput = {
  id?: unknown;
  name?: unknown;
  short_code?: unknown;
  shortCode?: unknown;
  description?: unknown;
  timezone?: unknown;
  is_active?: unknown;
  isActive?: unknown;
};

type AreaInput = {
  id?: unknown;
  dbId?: unknown;
  code?: unknown;
  name?: unknown;
  area_type?: unknown;
  areaType?: unknown;
  sort_order?: unknown;
  sortOrder?: unknown;
  is_active?: unknown;
  isActive?: unknown;
};

type LevelInput = AreaInput & { areas?: AreaInput[] };
type BlockInput = AreaInput & { levels?: LevelInput[] };

function text(value: unknown): string {
  return String(value ?? "").trim();
}
function code(value: unknown, fallback = ""): string {
  const result = text(value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
  if (!result) throw new ApiError("Falta un código válido.", 400, "validation");
  return result;
}
function bool(value: unknown, fallback = true): boolean {
  return value === undefined || value === null ? fallback : Boolean(value);
}
function numberOf(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}
function array<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

async function hasPermission(admin: SupabaseClient, userId: string, permissionCode: string) {
  const { data, error } = await admin.rpc("user_has_permission_for", {
    p_user_id: userId,
    p_permission_code: permissionCode,
  });
  if (error) throw new ApiError(error.message, 500, "permission-check");
  return data === true;
}
async function assertPermission(admin: SupabaseClient, userId: string, permissionCode: string) {
  if (!(await hasPermission(admin, userId, permissionCode))) {
    throw new ApiError(`No tiene el permiso requerido: ${permissionCode}.`, 403, "authorization");
  }
}

async function audit(
  admin: SupabaseClient,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  previousData: unknown,
  newData: unknown,
  projectId: string | null,
) {
  const { error } = await admin.from("audit_logs").insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    previous_data: previousData ?? null,
    new_data: newData ?? null,
    project_id: projectId,
  });
  if (error) console.error("audit insert failed", error);
}

async function projectSnapshot(admin: SupabaseClient, projectId: string) {
  const { data: project, error: projectError } = await admin
    .from("qpc_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) throw new ApiError(projectError.message, 500, "project-snapshot");
  if (!project) return null;

  const { data: blocks, error: blockError } = await admin
    .from("qpc_project_blocks")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order");
  if (blockError) throw new ApiError(blockError.message, 500, "project-snapshot");

  const blockIds = (blocks ?? []).map((item: { id: string }) => item.id);
  const { data: levels, error: levelError } = blockIds.length
    ? await admin.from("qpc_project_levels").select("*").in("block_id", blockIds).order("sort_order")
    : { data: [], error: null };
  if (levelError) throw new ApiError(levelError.message, 500, "project-snapshot");

  const levelIds = (levels ?? []).map((item: { id: string }) => item.id);
  const { data: areas, error: areaError } = levelIds.length
    ? await admin.from("qpc_project_areas").select("*").in("level_id", levelIds).order("sort_order")
    : { data: [], error: null };
  if (areaError) throw new ApiError(areaError.message, 500, "project-snapshot");

  return { project, blocks: blocks ?? [], levels: levels ?? [], areas: areas ?? [] };
}

async function upsertStructure(
  admin: SupabaseClient,
  projectId: string,
  blocksInput: BlockInput[],
) {
  const { data: existingBlocks, error: existingBlockError } = await admin
    .from("qpc_project_blocks")
    .select("id,code")
    .eq("project_id", projectId);
  if (existingBlockError) throw new ApiError(existingBlockError.message, 500, "structure-block-list");

  const sentBlockCodes = new Set<string>();
  for (const [blockIndex, blockInput] of blocksInput.entries()) {
    const blockCode = code(blockInput.code || blockInput.id, `B${blockIndex + 1}`);
    sentBlockCodes.add(blockCode);
    const blockRecord = {
      project_id: projectId,
      code: blockCode,
      name: text(blockInput.name) || `Bloque ${blockCode}`,
      sort_order: numberOf(blockInput.sort_order ?? blockInput.sortOrder, (blockIndex + 1) * 10),
      is_active: bool(blockInput.is_active ?? blockInput.isActive, true),
      updated_at: new Date().toISOString(),
    };
    const { data: block, error: blockError } = await admin
      .from("qpc_project_blocks")
      .upsert(blockRecord, { onConflict: "project_id,code" })
      .select("id,code")
      .single();
    if (blockError || !block) throw new ApiError(blockError?.message || "No se guardó el bloque.", 400, "structure-block");

    const { data: existingLevels, error: existingLevelError } = await admin
      .from("qpc_project_levels")
      .select("id,code")
      .eq("block_id", block.id);
    if (existingLevelError) throw new ApiError(existingLevelError.message, 500, "structure-level-list");

    const sentLevelCodes = new Set<string>();
    for (const [levelIndex, levelInput] of array<LevelInput>(blockInput.levels).entries()) {
      const levelCode = code(levelInput.code || levelInput.id, `N${String(levelIndex + 1).padStart(2, "0")}`);
      sentLevelCodes.add(levelCode);
      const levelRecord = {
        block_id: block.id,
        code: levelCode,
        name: text(levelInput.name) || `Nivel ${String(levelIndex + 1).padStart(2, "0")}`,
        sort_order: numberOf(levelInput.sort_order ?? levelInput.sortOrder, (levelIndex + 1) * 10),
        is_active: bool(levelInput.is_active ?? levelInput.isActive, true),
        updated_at: new Date().toISOString(),
      };
      const { data: level, error: levelError } = await admin
        .from("qpc_project_levels")
        .upsert(levelRecord, { onConflict: "block_id,code" })
        .select("id,code")
        .single();
      if (levelError || !level) throw new ApiError(levelError?.message || "No se guardó el nivel.", 400, "structure-level");

      const { data: existingAreas, error: existingAreaError } = await admin
        .from("qpc_project_areas")
        .select("id,code")
        .eq("level_id", level.id);
      if (existingAreaError) throw new ApiError(existingAreaError.message, 500, "structure-area-list");

      const sentAreaCodes = new Set<string>();
      for (const [areaIndex, areaInput] of array<AreaInput>(levelInput.areas).entries()) {
        const areaName = text(areaInput.name) || `Área ${areaIndex + 1}`;
        const areaCode = code(areaInput.code || areaInput.id, areaName);
        sentAreaCodes.add(areaCode);
        const areaRecord = {
          level_id: level.id,
          code: areaCode,
          name: areaName,
          area_type: text(areaInput.area_type ?? areaInput.areaType) || null,
          sort_order: numberOf(areaInput.sort_order ?? areaInput.sortOrder, (areaIndex + 1) * 10),
          is_active: bool(areaInput.is_active ?? areaInput.isActive, true),
          updated_at: new Date().toISOString(),
        };
        const { error: areaError } = await admin
          .from("qpc_project_areas")
          .upsert(areaRecord, { onConflict: "level_id,code" });
        if (areaError) throw new ApiError(areaError.message, 400, "structure-area");
      }

      for (const existingArea of existingAreas ?? []) {
        if (!sentAreaCodes.has(existingArea.code)) {
          const { error } = await admin.from("qpc_project_areas").update({ is_active: false }).eq("id", existingArea.id);
          if (error) throw new ApiError(error.message, 400, "structure-area-archive");
        }
      }
    }

    for (const existingLevel of existingLevels ?? []) {
      if (!sentLevelCodes.has(existingLevel.code)) {
        const { error } = await admin.from("qpc_project_levels").update({ is_active: false }).eq("id", existingLevel.id);
        if (error) throw new ApiError(error.message, 400, "structure-level-archive");
      }
    }
  }

  for (const existingBlock of existingBlocks ?? []) {
    if (!sentBlockCodes.has(existingBlock.code)) {
      const { error } = await admin.from("qpc_project_blocks").update({ is_active: false }).eq("id", existingBlock.id);
      if (error) throw new ApiError(error.message, 400, "structure-block-archive");
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let stage = "bootstrap";
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new ApiError("Faltan secretos internos de Supabase.", 500, "environment");

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) throw new ApiError("Falta el token de sesión.", 401, "actor-auth");

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    stage = "actor-auth";
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) throw new ApiError("La sesión no es válida.", 401, stage, userError?.message);
    const actorId = userData.user.id;

    stage = "actor-profile";
    const { data: actor, error: actorError } = await admin
      .from("profiles")
      .select("id,role,is_active")
      .eq("id", actorId)
      .maybeSingle();
    if (actorError || !actor?.is_active) throw new ApiError("El perfil administrador no existe o está inactivo.", 403, stage, actorError?.message);

    const body = await req.json();
    const action = text(body.action || "upsert_project");

    if (action === "upsert_project") {
      const input = (body.project || {}) as ProjectInput;
      const projectId = code(input.id, "PRJ");
      const projectName = text(input.name);
      const shortCode = code(input.short_code ?? input.shortCode, projectId);
      if (!projectName) throw new ApiError("El nombre completo del proyecto es obligatorio.", 400, "validation");

      stage = "project-lookup";
      const previous = await projectSnapshot(admin, projectId);
      await assertPermission(admin, actorId, previous ? "projects.edit" : "projects.create");
      const blocks = array<BlockInput>(body.blocks);
      if (blocks.length || body.replace_structure === true) {
        await assertPermission(admin, actorId, "projects.structure.manage");
      }

      const requestedActive = bool(input.is_active ?? input.isActive, true);
      if (previous && Boolean(previous.project.is_active) !== requestedActive) {
        await assertPermission(admin, actorId, "projects.archive");
      }

      stage = "project-upsert";
      const projectRecord = {
        id: projectId,
        name: projectName,
        short_code: shortCode,
        description: text(input.description),
        timezone: text(input.timezone) || "America/Santo_Domingo",
        is_active: requestedActive,
        created_by: previous?.project.created_by || actorId,
        updated_at: new Date().toISOString(),
      };
      const { error: projectError } = await admin
        .from("qpc_projects")
        .upsert(projectRecord, { onConflict: "id" });
      if (projectError) throw new ApiError(projectError.message, 400, stage);

      if (blocks.length || body.replace_structure === true) {
        stage = "project-structure";
        await upsertStructure(admin, projectId, blocks);
      }

      // El creador queda asignado; los usuarios IT quedan asignados a todos los proyectos.
      stage = "project-membership";
      const { error: creatorMemberError } = await admin.from("project_members").upsert({
        project_id: projectId,
        user_id: actorId,
        is_active: true,
        assigned_by: actorId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "project_id,user_id" });
      if (creatorMemberError) throw new ApiError(creatorMemberError.message, 400, stage);

      const { data: itProfiles, error: itError } = await admin
        .from("profiles")
        .select("id")
        .eq("role", "IT")
        .eq("is_active", true);
      if (itError) throw new ApiError(itError.message, 500, stage);
      if ((itProfiles ?? []).length) {
        const { error: itMemberError } = await admin.from("project_members").upsert(
          (itProfiles ?? []).map((profile: { id: string }) => ({
            project_id: projectId,
            user_id: profile.id,
            is_active: true,
            assigned_by: actorId,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "project_id,user_id" },
        );
        if (itMemberError) throw new ApiError(itMemberError.message, 400, stage);
      }

      const saved = await projectSnapshot(admin, projectId);
      await audit(admin, actorId, previous ? "PROJECT_UPDATED" : "PROJECT_CREATED", "project", projectId, previous, saved, projectId);

      return new Response(JSON.stringify({ ok: true, project: saved }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "archive_project" || action === "restore_project") {
      await assertPermission(admin, actorId, "projects.archive");
      const projectId = code(body.project_id, "PRJ");
      const previous = await projectSnapshot(admin, projectId);
      if (!previous) throw new ApiError("El proyecto no existe.", 404, "project-lookup");
      const isActive = action === "restore_project";
      const { error } = await admin
        .from("qpc_projects")
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq("id", projectId);
      if (error) throw new ApiError(error.message, 400, "project-status");
      const saved = await projectSnapshot(admin, projectId);
      await audit(admin, actorId, isActive ? "PROJECT_RESTORED" : "PROJECT_ARCHIVED", "project", projectId, previous, saved, projectId);
      return new Response(JSON.stringify({ ok: true, project: saved }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new ApiError(`Acción no soportada: ${action}.`, 400, "validation");
  } catch (error) {
    const apiError = error instanceof ApiError
      ? error
      : new ApiError(error instanceof Error ? error.message : String(error), 500, stage);
    console.error("admin-project-management failed", {
      stage: apiError.stage,
      status: apiError.status,
      message: apiError.message,
      details: apiError.details,
    });
    return new Response(JSON.stringify({
      error: apiError.message,
      stage: apiError.stage,
      details: apiError.details ?? null,
    }), {
      status: apiError.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
