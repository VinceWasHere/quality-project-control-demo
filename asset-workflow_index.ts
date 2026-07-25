import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class ApiError extends Error {
  constructor(public message:string, public status=400, public stage="request", public details?:unknown){super(message);}
}

function reply(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json; charset=utf-8"}});
}
function text(value:unknown){return String(value??"").trim();}
function integer(value:unknown,fallback=0){const parsed=Number.parseInt(String(value??""),10);return Number.isFinite(parsed)?parsed:fallback;}
function bool(value:unknown,fallback=false){return value===undefined?fallback:Boolean(value);}
function dateOrNull(value:unknown){const result=text(value);return /^\d{4}-\d{2}-\d{2}$/.test(result)?result:null;}
function slug(value:unknown){return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"X";}
function versionNumber(label:unknown,fallback=0){const digits=text(label).replace(/[^0-9]/g,"");return digits?Math.max(integer(digits,fallback),0):fallback;}

async function hasPermission(admin:SupabaseClient,userId:string,code:string){
  const {data,error}=await admin.rpc("user_has_permission_for",{p_user_id:userId,p_permission_code:code});
  if(error)throw new ApiError(error.message,500,"permission-check",error);
  return data===true;
}
async function assertPermission(admin:SupabaseClient,userId:string,code:string){
  if(!(await hasPermission(admin,userId,code)))throw new ApiError(`No tiene el permiso requerido: ${code}.`,403,"authorization");
}
async function assertProject(admin:SupabaseClient,userId:string,projectId:string){
  const {data,error}=await admin.rpc("qpc_user_can_access_project",{p_user_id:userId,p_project_id:projectId});
  if(error)throw new ApiError(error.message,500,"project-access",error);
  if(data!==true)throw new ApiError("No tiene acceso al proyecto seleccionado.",403,"project-access");
}
async function audit(admin:SupabaseClient,actorId:string,action:string,entityType:string,entityId:string|null,projectId:string|null,previousData:unknown,newData:unknown){
  const {error}=await admin.from("audit_logs").insert({actor_id:actorId,action,entity_type:entityType,entity_id:entityId,project_id:projectId,previous_data:previousData??null,new_data:newData??null});
  if(error)console.error("audit",error);
}
async function registerFile(admin:SupabaseClient,actorId:string,projectId:string|null,input:any){
  if(!input)return null;
  const storagePath=text(input.storage_path||input.storagePath);
  const externalUrl=text(input.external_url||input.externalUrl);
  if(!storagePath&&!externalUrl)return null;
  const row={
    project_id:projectId||null,
    bucket:storagePath?text(input.bucket||"qpc-attachments"):null,
    storage_path:storagePath||null,
    external_url:externalUrl||null,
    original_name:text(input.original_name||input.originalName||input.fileName||"archivo"),
    mime_type:text(input.mime_type||input.mimeType||input.fileType||"application/octet-stream"),
    size_bytes:input.size_bytes??input.sizeBytes??input.fileSize??null,
    uploaded_by:actorId,
    deleted_at:null,
  };
  if(storagePath){
    const {data,error}=await admin.from("qpc_files").upsert(row,{onConflict:"bucket,storage_path"}).select().single();
    if(error)throw new ApiError(error.message,500,"file-register",error);
    return data;
  }
  const {data:existing,error:findError}=await admin.from("qpc_files").select("*").eq("external_url",externalUrl).is("deleted_at",null).maybeSingle();
  if(findError)throw new ApiError(findError.message,500,"file-register",findError);
  if(existing)return existing;
  const {data,error}=await admin.from("qpc_files").insert(row).select().single();
  if(error)throw new ApiError(error.message,500,"file-register",error);
  return data;
}
async function softDeleteFile(admin:SupabaseClient,fileId:string|null){
  if(!fileId)return null;
  const {data:file,error:findError}=await admin.from("qpc_files").select("*").eq("id",fileId).maybeSingle();
  if(findError)throw new ApiError(findError.message,500,"file-delete",findError);
  if(!file)return null;
  const {error}=await admin.from("qpc_files").update({deleted_at:new Date().toISOString()}).eq("id",fileId);
  if(error)throw new ApiError(error.message,500,"file-delete",error);
  return file.storage_path?{bucket:file.bucket,storage_path:file.storage_path}:null;
}

serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return reply({error:"Método no permitido",stage:"method"},405);

  let stage="bootstrap";
  try{
    const url=Deno.env.get("SUPABASE_URL");
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!serviceKey)throw new ApiError("Faltan secretos internos de Supabase.",500,"environment");
    const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
    if(!token)throw new ApiError("Falta el token de sesión.",401,"authentication");
    const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:userData,error:userError}=await admin.auth.getUser(token);
    if(userError||!userData.user)throw new ApiError("La sesión no es válida.",401,"authentication",userError?.message);
    const actorId=userData.user.id;
    const {data:actor,error:actorError}=await admin.from("profiles").select("id,role,is_active").eq("id",actorId).maybeSingle();
    if(actorError||!actor?.is_active)throw new ApiError("El perfil está inactivo o no existe.",403,"actor-profile",actorError?.message);

    const body=await req.json();
    const action=text(body.action);

    if(action==="equipment_upsert"){
      stage="equipment-upsert";
      const input=body.equipment||{};const projectId=text(input.project_id);
      if(!projectId||!text(input.equipment_code))throw new ApiError("Proyecto y código de equipo son obligatorios.",400,stage);
      await assertProject(admin,actorId,projectId);
      const {data:existing,error:findError}=await admin.from("qpc_equipment").select("*").eq("project_id",projectId).eq("equipment_code",text(input.equipment_code)).maybeSingle();
      if(findError)throw new ApiError(findError.message,500,stage,findError);
      await assertPermission(admin,actorId,existing?"equipment.edit":"equipment.create");
      const row={
        project_id:projectId,equipment_code:text(input.equipment_code),equipment_type:text(input.equipment_type),description:text(input.description),
        brand_model:text(input.brand_model),block_id:input.block_id||null,level_id:input.level_id||null,area_id:input.area_id||null,
        location_text:text(input.location_text),responsible:text(input.responsible),frequency_days:Math.max(integer(input.frequency_days,180),1),
        calibration_required:bool(input.calibration_required,false),verification_required:bool(input.verification_required,true),
        last_calibration_date:dateOrNull(input.last_calibration_date),last_verification_date:dateOrNull(input.last_verification_date),
        observations:text(input.observations),is_active:input.is_active!==false,updated_by:actorId,...(!existing?{created_by:actorId}:{})
      };
      const {data,error}=await admin.from("qpc_equipment").upsert(row,{onConflict:"project_id,equipment_code"}).select().single();
      if(error)throw new ApiError(error.message,500,stage,error);
      await audit(admin,actorId,existing?"equipment.update":"equipment.create","equipment",data.id,projectId,existing,data);
      return reply({ok:true,equipment:data});
    }

    if(action==="equipment_bulk_upsert"){
      stage="equipment-import";const projectId=text(body.project_id);const records=Array.isArray(body.records)?body.records:[];
      if(!projectId||!records.length)throw new ApiError("No hay equipos para importar.",400,stage);
      if(records.length>1000)throw new ApiError("Máximo 1,000 equipos por lote.",413,stage);
      await assertProject(admin,actorId,projectId);await assertPermission(admin,actorId,"equipment.import");
      const rows=records.filter((r:any)=>text(r.equipment_code)).map((r:any)=>({
        project_id:projectId,equipment_code:text(r.equipment_code),equipment_type:text(r.equipment_type),description:text(r.description),brand_model:text(r.brand_model),
        location_text:text(r.location_text),responsible:text(r.responsible),frequency_days:Math.max(integer(r.frequency_days,180),1),
        calibration_required:bool(r.calibration_required,false),verification_required:bool(r.verification_required,true),
        last_calibration_date:dateOrNull(r.last_calibration_date),last_verification_date:dateOrNull(r.last_verification_date),observations:text(r.observations),
        is_active:r.is_active!==false,created_by:actorId,updated_by:actorId
      }));
      const {data,error}=await admin.from("qpc_equipment").upsert(rows,{onConflict:"project_id,equipment_code"}).select("id,equipment_code");
      if(error)throw new ApiError(error.message,500,stage,error);
      await audit(admin,actorId,"equipment.import","equipment",null,projectId,null,{count:data?.length||0});
      return reply({ok:true,count:data?.length||0});
    }

    if(action==="equipment_delete"){
      stage="equipment-delete";await assertPermission(admin,actorId,"equipment.delete");
      const id=text(body.equipment_id);const {data:existing,error:findError}=await admin.from("qpc_equipment").select("*").eq("id",id).maybeSingle();
      if(findError||!existing)throw new ApiError(findError?.message||"Equipo no encontrado.",404,stage,findError);
      await assertProject(admin,actorId,existing.project_id);
      const {error}=await admin.from("qpc_equipment").update({is_active:false,updated_by:actorId}).eq("id",id);
      if(error)throw new ApiError(error.message,500,stage,error);
      await audit(admin,actorId,"equipment.archive","equipment",id,existing.project_id,existing,{...existing,is_active:false});
      return reply({ok:true});
    }

    if(action==="equipment_event"){
      stage="equipment-event";await assertPermission(admin,actorId,"equipment.verify");
      const id=text(body.equipment_id);const eventType=text(body.event_type).toUpperCase();
      if(!["CALIBRATION","VERIFICATION","MAINTENANCE"].includes(eventType))throw new ApiError("Tipo de evento inválido.",400,stage);
      const {data:existing,error:findError}=await admin.from("qpc_equipment").select("*").eq("id",id).maybeSingle();
      if(findError||!existing)throw new ApiError(findError?.message||"Equipo no encontrado.",404,stage,findError);
      await assertProject(admin,actorId,existing.project_id);
      const eventDate=dateOrNull(body.event_date)||new Date().toISOString().slice(0,10);
      const {data:event,error:eventError}=await admin.from("qpc_equipment_events").insert({equipment_id:id,event_type:eventType,event_date:eventDate,performed_by:actorId,notes:text(body.notes)}).select().single();
      if(eventError)throw new ApiError(eventError.message,500,stage,eventError);
      const patch:any={updated_by:actorId};
      if(eventType==="CALIBRATION")patch.last_calibration_date=eventDate;
      if(eventType==="VERIFICATION")patch.last_verification_date=eventDate;
      const {data:updated,error:updateError}=await admin.from("qpc_equipment").update(patch).eq("id",id).select().single();
      if(updateError)throw new ApiError(updateError.message,500,stage,updateError);
      await audit(admin,actorId,`equipment.${eventType.toLowerCase()}`,"equipment",id,existing.project_id,existing,updated);
      return reply({ok:true,event,equipment:updated});
    }

    if(action==="instructive_upsert"){
      stage="instructive-upsert";const input=body.instructive||{};const projectId=text(input.project_id)||null;
      if(projectId)await assertProject(admin,actorId,projectId);
      const code=text(input.document_code);const title=text(input.title);const versionLabel=text(input.version_label)||"V01";
      if(!code||!title)throw new ApiError("Código y título son obligatorios.",400,stage);
      const scope=projectId||"GLOBAL";
      const {data:parent,error:parentError}=await admin.from("qpc_instructives").select("*").eq("project_scope",scope).eq("document_code",code).maybeSingle();
      if(parentError)throw new ApiError(parentError.message,500,stage,parentError);
      await assertPermission(admin,actorId,parent?"instructives.edit":"instructives.create");
      const {data:instructive,error:upsertError}=await admin.from("qpc_instructives").upsert({
        id:input.instructive_id||parent?.id||undefined,project_id:projectId,document_code:code,title,activity:text(input.activity),is_active:true,created_by:parent?.created_by||actorId
      },{onConflict:"project_scope,document_code"}).select().single();
      if(upsertError)throw new ApiError(upsertError.message,500,stage,upsertError);
      const {data:existingVersion,error:versionFindError}=await admin.from("qpc_instructive_versions").select("*,qpc_files(*)").eq("instructive_id",instructive.id).eq("version_label",versionLabel).is("deleted_at",null).maybeSingle();
      if(versionFindError)throw new ApiError(versionFindError.message,500,stage,versionFindError);
      if(!existingVersion)await assertPermission(admin,actorId,"instructives.version");
      const file=await registerFile(admin,actorId,projectId,input.file);
      await admin.from("qpc_instructive_versions").update({lifecycle_status:"OBSOLETO"}).eq("instructive_id",instructive.id).is("deleted_at",null).neq("version_label",versionLabel);
      const versionRow={
        instructive_id:instructive.id,version_number:Math.max(versionNumber(versionLabel,0),0),version_label:versionLabel,lifecycle_status:"VIGENTE",
        file_id:file?.id||existingVersion?.file_id||null,note:text(input.note),uploaded_by:actorId,deleted_at:null
      };
      const {data:version,error:versionError}=await admin.from("qpc_instructive_versions").upsert(versionRow,{onConflict:"instructive_id,version_label"}).select().single();
      if(versionError)throw new ApiError(versionError.message,500,stage,versionError);
      let removeStorage=null;
      if(file?.id&&existingVersion?.file_id&&existingVersion.file_id!==file.id)removeStorage=await softDeleteFile(admin,existingVersion.file_id);
      await audit(admin,actorId,existingVersion?"instructive.update":"instructive.version.create","instructive",instructive.id,projectId,existingVersion,{instructive,version});
      return reply({ok:true,instructive,version,remove_storage:removeStorage});
    }

    if(action==="instructive_delete"){
      stage="instructive-delete";await assertPermission(admin,actorId,"instructives.delete");
      const versionId=text(body.version_id);const {data:version,error:findError}=await admin.from("qpc_instructive_versions").select("*,qpc_instructives(*)").eq("id",versionId).maybeSingle();
      if(findError||!version)throw new ApiError(findError?.message||"Versión no encontrada.",404,stage,findError);
      const projectId=version.qpc_instructives?.project_id||null;if(projectId)await assertProject(admin,actorId,projectId);
      const {error}=await admin.from("qpc_instructive_versions").update({deleted_at:new Date().toISOString(),lifecycle_status:"OBSOLETO"}).eq("id",versionId);
      if(error)throw new ApiError(error.message,500,stage,error);
      const removeStorage=await softDeleteFile(admin,version.file_id);
      const {count}=await admin.from("qpc_instructive_versions").select("id",{count:"exact",head:true}).eq("instructive_id",version.instructive_id).is("deleted_at",null);
      if((count||0)===0)await admin.from("qpc_instructives").update({is_active:false}).eq("id",version.instructive_id);
      await audit(admin,actorId,"instructive.delete","instructive_version",versionId,projectId,version,null);
      return reply({ok:true,remove_storage:removeStorage});
    }

    if(action==="mapping_upsert"){
      stage="mapping-upsert";const input=body.mapping||{};const projectId=text(input.project_id);
      if(!projectId)throw new ApiError("El proyecto es obligatorio.",400,stage);
      await assertProject(admin,actorId,projectId);
      const mappingId=text(input.mapping_id)||null;
      const {data:existing,error:findError}=mappingId
        ? await admin.from("qpc_mappings").select("*").eq("id",mappingId).maybeSingle()
        : await admin.from("qpc_mappings").select("*").eq("project_id",projectId).eq("block_code",text(input.block_code)).eq("level_code",text(input.level_code)).eq("area_name",text(input.area_name)).eq("is_active",true).maybeSingle();
      if(findError)throw new ApiError(findError.message,500,stage,findError);
      await assertPermission(admin,actorId,existing?"mappings.edit":"mappings.create");
      const {data:project,error:projectError}=await admin.from("qpc_projects").select("short_code").eq("id",projectId).single();
      if(projectError)throw new ApiError(projectError.message,500,stage,projectError);
      const baseCode=`MAP-${slug(project.short_code)}-${slug(input.block_code)}-${slug(input.level_code)}`;
      const {data:mapping,error:mappingError}=await admin.from("qpc_mappings").upsert({
        id:existing?.id||undefined,project_id:projectId,block_id:input.block_id||null,level_id:input.level_id||null,area_id:input.area_id||null,
        block_code:text(input.block_code),level_code:text(input.level_code),area_name:text(input.area_name),title:text(input.title)||`Mapeo ${text(input.area_name)}`,
        base_code:baseCode,is_active:true,created_by:existing?.created_by||actorId
      }).select().single();
      if(mappingError)throw new ApiError(mappingError.message,500,stage,mappingError);
      const requestedLabel=text(input.version_label);
      let existingVersion:any=null;
      if(input.version_id){const result=await admin.from("qpc_mapping_versions").select("*,qpc_files(*)").eq("id",input.version_id).maybeSingle();if(result.error)throw new ApiError(result.error.message,500,stage,result.error);existingVersion=result.data;}
      else if(requestedLabel){const result=await admin.from("qpc_mapping_versions").select("*,qpc_files(*)").eq("mapping_id",mapping.id).eq("version_label",requestedLabel).is("deleted_at",null).maybeSingle();if(result.error)throw new ApiError(result.error.message,500,stage,result.error);existingVersion=result.data;}
      const {data:currentVersions,error:versionsError}=await admin.from("qpc_mapping_versions").select("version_number").eq("mapping_id",mapping.id).is("deleted_at",null).order("version_number",{ascending:false}).limit(1);
      if(versionsError)throw new ApiError(versionsError.message,500,stage,versionsError);
      const nextNumber=existingVersion?.version_number||versionNumber(requestedLabel,(currentVersions?.[0]?.version_number||0)+1)||1;
      const versionLabel=requestedLabel||`V${String(nextNumber).padStart(2,"0")}`;
      const file=await registerFile(admin,actorId,projectId,input.file);
      await admin.from("qpc_mapping_versions").update({lifecycle_status:"OBSOLETO"}).eq("mapping_id",mapping.id).is("deleted_at",null).neq("version_label",versionLabel);
      const {data:version,error:versionError}=await admin.from("qpc_mapping_versions").upsert({
        mapping_id:mapping.id,version_number:Math.max(nextNumber,1),version_label:versionLabel,lifecycle_status:"VIGENTE",
        file_id:file?.id||existingVersion?.file_id||null,created_by:existingVersion?.created_by||actorId,deleted_at:null
      },{onConflict:"mapping_id,version_label"}).select().single();
      if(versionError)throw new ApiError(versionError.message,500,stage,versionError);
      let removeStorage=null;if(file?.id&&existingVersion?.file_id&&existingVersion.file_id!==file.id)removeStorage=await softDeleteFile(admin,existingVersion.file_id);
      await audit(admin,actorId,existing?"mapping.update":"mapping.create","mapping",mapping.id,projectId,existing,{mapping,version});
      return reply({ok:true,mapping,version,remove_storage:removeStorage});
    }

    if(action==="mapping_delete"){
      stage="mapping-delete";await assertPermission(admin,actorId,"mappings.delete");
      const mappingId=text(body.mapping_id);const {data:mapping,error:findError}=await admin.from("qpc_mappings").select("*").eq("id",mappingId).maybeSingle();
      if(findError||!mapping)throw new ApiError(findError?.message||"Mapeo no encontrado.",404,stage,findError);
      await assertProject(admin,actorId,mapping.project_id);
      const {data:versions,error:versionsError}=await admin.from("qpc_mapping_versions").select("id,file_id").eq("mapping_id",mappingId).is("deleted_at",null);
      if(versionsError)throw new ApiError(versionsError.message,500,stage,versionsError);
      await admin.from("qpc_mapping_versions").update({deleted_at:new Date().toISOString(),lifecycle_status:"OBSOLETO"}).eq("mapping_id",mappingId).is("deleted_at",null);
      await admin.from("qpc_mappings").update({is_active:false}).eq("id",mappingId);
      const removeStorage=[];for(const version of versions||[]){const file=await softDeleteFile(admin,version.file_id);if(file)removeStorage.push(file);}
      await audit(admin,actorId,"mapping.delete","mapping",mappingId,mapping.project_id,mapping,null);
      return reply({ok:true,remove_storage:removeStorage});
    }

    if(action==="mapping_annotation_save"){
      stage="mapping-annotation";await assertPermission(admin,actorId,"mappings.annotate");
      const input=body.annotation||{};const versionId=text(input.mapping_version_id);
      const {data:version,error:findError}=await admin.from("qpc_mapping_versions").select("id,mapping_id,qpc_mappings(project_id)").eq("id",versionId).maybeSingle();
      if(findError||!version)throw new ApiError(findError?.message||"Versión de mapeo no encontrada.",404,stage,findError);
      const projectId=version.qpc_mappings?.project_id;await assertProject(admin,actorId,projectId);
      const row={mapping_version_id:versionId,inspection_id:input.inspection_id||null,visit_id:input.visit_id||null,strokes:Array.isArray(input.strokes)?input.strokes:[],created_by:actorId};
      const {data,error}=await admin.from("qpc_mapping_annotations").insert(row).select().single();
      if(error)throw new ApiError(error.message,500,stage,error);
      await audit(admin,actorId,"mapping.annotation.save","mapping_annotation",data.id,projectId,null,{stroke_count:row.strokes.length});
      return reply({ok:true,annotation:data});
    }

    throw new ApiError(`Acción no reconocida: ${action}.`,400,"action");
  }catch(error){
    const e=error as ApiError & {code?:string;hint?:string};
    console.error("asset-workflow",{stage:e.stage||stage,error:e});
    return reply({error:e.message||"La operación no pudo completarse",stage:e.stage||stage,details:e.details||null,code:e.code||null,hint:e.hint||null},e.status||400);
  }
});
