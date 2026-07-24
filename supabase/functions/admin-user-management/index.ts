import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES = ["EJECUCION","CALIDAD","COORDINADOR_CALIDAD","GERENCIA","PRESIDENTE","IT"] as const;
type AppRole = typeof ROLES[number];

const CREATE_PERMISSION: Record<AppRole,string> = {
  EJECUCION:"users.create.execution", CALIDAD:"users.create.quality",
  COORDINADOR_CALIDAD:"users.create.quality_manager", GERENCIA:"users.create.project_manager",
  PRESIDENTE:"users.create.president", IT:"users.create.it",
};
const EDIT_PERMISSION: Record<AppRole,string> = {
  EJECUCION:"users.edit.execution", CALIDAD:"users.edit.quality",
  COORDINADOR_CALIDAD:"users.edit.quality_manager", GERENCIA:"users.edit.project_manager",
  PRESIDENTE:"users.edit.president", IT:"users.edit.it",
};

class ApiError extends Error {
  constructor(public message:string, public status=400, public stage="request", public details?:unknown){super(message);}
}

function roleOf(value:unknown):AppRole {
  const role=String(value||"").toUpperCase() as AppRole;
  if(!ROLES.includes(role)) throw new ApiError(`Rol no válido: ${role||"vacío"}.`,400,"validation");
  return role;
}
function emailOf(value:unknown){
  const email=String(value||"").trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError("Correo no válido.",400,"validation");
  return email;
}
function arrayOfText(value:unknown){return Array.isArray(value)?[...new Set(value.map(String).map(v=>v.trim()).filter(Boolean))]:[];}

async function findAuthUser(admin:SupabaseClient,email:string):Promise<User|null>{
  for(let page=1;page<=50;page++){
    const {data,error}=await admin.auth.admin.listUsers({page,perPage:200});
    if(error) throw new ApiError(error.message,500,"auth-list");
    const found=data.users.find(u=>u.email?.toLowerCase()===email);
    if(found)return found;
    if(data.users.length<200)return null;
  }
  return null;
}

async function hasPermission(admin:SupabaseClient,userId:string,code:string){
  const {data,error}=await admin.rpc("user_has_permission_for",{p_user_id:userId,p_permission_code:code});
  if(error)throw new ApiError(error.message,500,"permission-check");
  return data===true;
}

async function assertPermission(admin:SupabaseClient,userId:string,code:string){
  if(!(await hasPermission(admin,userId,code))) throw new ApiError(`No tiene el permiso requerido: ${code}.`,403,"authorization");
}

async function audit(admin:SupabaseClient,actorId:string,action:string,entityType:string,entityId:string|null,previousData:unknown,newData:unknown,projectId:string|null=null){
  const {error}=await admin.from("audit_logs").insert({actor_id:actorId,action,entity_type:entityType,entity_id:entityId,previous_data:previousData??null,new_data:newData??null,project_id:projectId});
  if(error)console.error("audit insert failed",error);
}

serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return new Response(JSON.stringify({error:"Método no permitido."}),{status:405,headers:{...corsHeaders,"Content-Type":"application/json"}});

  let stage="bootstrap";
  let createdAuthId:string|null=null;
  try{
    const url=Deno.env.get("SUPABASE_URL");
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!serviceKey)throw new ApiError("Faltan secretos internos de Supabase.",500,"environment");
    const authHeader=req.headers.get("Authorization")||"";
    const token=authHeader.replace(/^Bearer\s+/i,"").trim();
    if(!token)throw new ApiError("Falta el token de sesión.",401,"actor-auth");

    const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
    stage="actor-auth";
    const {data:userData,error:userError}=await admin.auth.getUser(token);
    if(userError||!userData.user)throw new ApiError("La sesión no es válida.",401,stage,userError?.message);
    const actorId=userData.user.id;

    stage="actor-profile";
    const {data:actor,error:actorError}=await admin.from("profiles").select("id,role,is_active").eq("id",actorId).maybeSingle();
    if(actorError||!actor?.is_active)throw new ApiError("El perfil administrador no existe o está inactivo.",403,stage,actorError?.message);

    const body=await req.json();
    const action=String(body.action||"upsert_user");
    if(action!=="upsert_user")throw new ApiError(`Acción no soportada: ${action}.`,400,"validation");

    const profileInput=body.profile||body;
    const email=emailOf(profileInput.email);
    const targetRole=roleOf(profileInput.role);
    let projectIds=arrayOfText(body.project_ids??profileInput.project_ids);
    const requestedOverrides=Array.isArray(body.permission_overrides)?body.permission_overrides:[];

    stage="project-validation";
    const {data:availableProjects,error:availableProjectError}=await admin.from("qpc_projects").select("id").eq("is_active",true);
    if(availableProjectError)throw new ApiError(availableProjectError.message,500,stage);
    const availableProjectIds=new Set<string>((availableProjects||[]).map((row:any)=>String(row.id)));
    if(targetRole==="IT") projectIds=[...availableProjectIds];
    const invalidProjects=projectIds.filter(projectId=>!availableProjectIds.has(projectId));
    if(invalidProjects.length)throw new ApiError(`Proyectos no válidos o archivados: ${invalidProjects.join(", ")}.`,400,stage);

    stage="target-lookup";
    let authUser=await findAuthUser(admin,email);
    const targetId=String(profileInput.auth_id||authUser?.id||"")||null;
    const {data:existingProfile,error:existingError}=targetId
      ? await admin.from("profiles").select("*").eq("id",targetId).maybeSingle()
      : await admin.from("profiles").select("*").ilike("email",email).maybeSingle();
    if(existingError)throw new ApiError(existingError.message,500,stage);
    const isCreate=!existingProfile;

    await assertPermission(admin,actorId,isCreate?CREATE_PERMISSION[targetRole]:EDIT_PERMISSION[targetRole]);
    if(projectIds.length)await assertPermission(admin,actorId,"users.assign_projects");
    if(requestedOverrides.length)await assertPermission(admin,actorId,"users.permissions.manage");
    if(existingProfile && profileInput.is_active!==undefined && Boolean(existingProfile.is_active)!==Boolean(profileInput.is_active)){
      await assertPermission(admin,actorId,"users.activate_deactivate");
    }
    if(existingProfile && profileInput.password)await assertPermission(admin,actorId,"users.password.reset");

    // Protección del último IT activo.
    if(existingProfile?.role==="IT" && profileInput.is_active===false){
      const {count,error}=await admin.from("profiles").select("id",{count:"exact",head:true}).eq("role","IT").eq("is_active",true);
      if(error)throw new ApiError(error.message,500,"last-it-check");
      if((count||0)<=1)throw new ApiError("No se puede desactivar el último usuario IT activo.",409,"last-it-check");
    }

    stage="auth-upsert";
    if(!authUser){
      if(!profileInput.password)throw new ApiError("La contraseña inicial es obligatoria.",400,stage);
      const {data,error}=await admin.auth.admin.createUser({
        email,password:String(profileInput.password),email_confirm:true,
        user_metadata:{full_name:String(profileInput.full_name||email),role:targetRole},
      });
      if(error||!data.user)throw new ApiError(error?.message||"No se pudo crear la cuenta.",400,stage);
      authUser=data.user;createdAuthId=data.user.id;
    }else{
      const updates:Record<string,unknown>={email,user_metadata:{...(authUser.user_metadata||{}),full_name:String(profileInput.full_name||email),role:targetRole}};
      if(profileInput.password)updates.password=String(profileInput.password);
      const {error}=await admin.auth.admin.updateUserById(authUser.id,updates);
      if(error)throw new ApiError(error.message,400,stage);
    }

    const userId=authUser.id;
    const previous=existingProfile||null;
    const legacyId=String(profileInput.legacy_id||existingProfile?.legacy_id||`usr-${userId.slice(0,12)}`);
    const savedProfile={
      id:userId,legacy_id:legacyId,full_name:String(profileInput.full_name||existingProfile?.full_name||email),
      email,role:targetRole,execution_area:profileInput.execution_area||null,
      project_ids:projectIds.length?projectIds:(existingProfile?.project_ids||[]),
      is_active:profileInput.is_active!==false,updated_at:new Date().toISOString(),
    };

    stage="profile-upsert";
    const {data:profile,error:profileError}=await admin.from("profiles").upsert(savedProfile,{onConflict:"id"}).select().single();
    if(profileError)throw new ApiError(profileError.message,400,stage);

    stage="project-members";
    if(projectIds.length||body.replace_projects===true){
      const {error:deleteError}=await admin.from("project_members").delete().eq("user_id",userId);
      if(deleteError)throw new ApiError(deleteError.message,400,stage);
      if(projectIds.length){
        const {error:insertError}=await admin.from("project_members").insert(projectIds.map(project_id=>({project_id,user_id:userId,is_active:true,assigned_by:actorId,updated_at:new Date().toISOString()})));
        if(insertError)throw new ApiError(insertError.message,400,stage);
      }
    }

    stage="permission-overrides";
    if(body.replace_permission_overrides===true){
      const {error:clearError}=await admin.from("user_permission_overrides").delete().eq("user_id",userId);
      if(clearError)throw new ApiError(clearError.message,400,stage);
      if(targetRole!=="IT"&&requestedOverrides.length){
        const codes=requestedOverrides.map((item:any)=>String(item.code||"")).filter(Boolean);
        const {data:permissionRows,error:permissionError}=await admin.from("permissions").select("id,code").in("code",codes);
        if(permissionError)throw new ApiError(permissionError.message,400,stage);
        const idByCode=new Map((permissionRows||[]).map((row:any)=>[row.code,row.id]));
        const records=requestedOverrides.filter((item:any)=>idByCode.has(String(item.code))).map((item:any)=>({user_id:userId,permission_id:idByCode.get(String(item.code)),allowed:Boolean(item.allowed),granted_by:actorId,updated_at:new Date().toISOString()}));
        if(records.length){
          const {error:overrideError}=await admin.from("user_permission_overrides").insert(records);
          if(overrideError)throw new ApiError(overrideError.message,400,stage);
        }
      }
    }

    stage="directory";
    const {error:directoryError}=await admin.from("login_directory").upsert({email,full_name:savedProfile.full_name,role:targetRole,is_active:savedProfile.is_active,updated_at:new Date().toISOString()});
    if(directoryError)throw new ApiError(directoryError.message,400,stage);

    const {data:overrides}=await admin.from("user_permission_overrides").select("allowed,permissions(code)").eq("user_id",userId);
    await audit(admin,actorId,isCreate?"USER_CREATED":"USER_UPDATED","profile",userId,previous,{...profile,project_ids:projectIds,permission_overrides:overrides});

    return new Response(JSON.stringify({ok:true,profile,project_ids:projectIds,permission_overrides:overrides||[]}),{status:200,headers:{...corsHeaders,"Content-Type":"application/json"}});
  }catch(error){
    const apiError=error instanceof ApiError?error:new ApiError(error instanceof Error?error.message:String(error),500,stage);
    if(createdAuthId){
      try{
        const url=Deno.env.get("SUPABASE_URL")!;const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
        await admin.auth.admin.deleteUser(createdAuthId);
      }catch(rollbackError){console.error("rollback failed",rollbackError);}
    }
    console.error("admin-user-management failed",{stage:apiError.stage,status:apiError.status,message:apiError.message,details:apiError.details});
    return new Response(JSON.stringify({error:apiError.message,stage:apiError.stage,details:apiError.details??null}),{status:apiError.status,headers:{...corsHeaders,"Content-Type":"application/json"}});
  }
});
