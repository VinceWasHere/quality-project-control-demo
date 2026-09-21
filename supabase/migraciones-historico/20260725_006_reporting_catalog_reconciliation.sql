-- Quality Project Control MAIN V8.6 · Fase 7
-- Integridad de datos, catálogo relacional de talleres/planillas y recuperación de calificaciones históricas.
-- Ejecutar después de V8.0 a V8.4. Idempotente y no destructiva.

begin;

create extension if not exists pgcrypto;

-- 1. Catálogo relacional de talleres y planillas
create table if not exists public.qpc_workshops (
  id text primary key,
  name text not null unique,
  objective numeric(7,3) not null default 0,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qpc_inspection_templates (
  id text primary key,
  workshop_id text not null references public.qpc_workshops(id) on delete restrict,
  title text not null,
  activity text not null,
  stage text not null default 'General',
  version text not null default 'V01',
  objective numeric(7,3) not null default 0,
  source_name text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qpc_template_criteria (
  template_id text not null references public.qpc_inspection_templates(id) on delete cascade,
  criterion_id text not null,
  name text not null,
  description text not null default '',
  guide text not null default '',
  weight numeric(10,3) not null default 0,
  response_type text not null default '',
  options jsonb not null default '[]'::jsonb,
  is_visit_criterion boolean not null default false,
  source_row integer,
  sort_order integer not null default 0,
  primary key(template_id,criterion_id)
);

alter table public.qpc_inspections add column if not exists workshop_id text references public.qpc_workshops(id) on delete set null;
alter table public.qpc_inspection_visits add column if not exists workshop_id text references public.qpc_workshops(id) on delete set null;
create index if not exists qpc_inspections_workshop_idx on public.qpc_inspections(project_id,workshop_id,requested_date desc);
create index if not exists qpc_visits_workshop_idx on public.qpc_inspection_visits(workshop_id,finished_at desc);

insert into public.qpc_workshops(id,name,objective,sort_order,is_active) values
  ('WS-01','Hormigonado',95,1,true),
  ('WS-02','Post Hormigonado',95,2,true),
  ('WS-03','Acero - Columnas y Muros',95,3,true),
  ('WS-04','Acero - Losas Estructurales',95,4,true),
  ('WS-05','Acero - Vigas y Fundaciones',95,5,true),
  ('WS-06','Encofrado - Columnas y Muros',95,6,true),
  ('WS-07','Encofrado - Losas y Vigas',95,7,true),
  ('WS-08','Prefabricados',95,8,true),
  ('WS-09','Mampostería',90,9,true),
  ('WS-10','Pañete',95,10,true),
  ('WS-11','Torta de Piso',92,11,true),
  ('WS-12','Área de Ligados',90,12,true),
  ('WS-13','Colocación de Pisos',95,13,true),
  ('WS-14','Revestimiento Vertical',95,14,true),
  ('WS-15','Derretido',95,15,true),
  ('WS-16','Pintura',95,16,true),
  ('WS-17','Drywall - Muros',95,17,true),
  ('WS-18','Drywall - Techos',95,18,true),
  ('WS-19','Fino de Techo',95,19,true),
  ('WS-20','Impermeabilización',95,20,true),
  ('WS-21','Carpintería - Madera, Aluminio y Vidrio',95,21,true),
  ('WS-22','Preentrega de Áreas',95,22,true)
on conflict(id) do update set name=excluded.name,objective=excluded.objective,sort_order=excluded.sort_order,is_active=true,updated_at=now();

insert into public.qpc_inspection_templates(id,workshop_id,title,activity,stage,version,objective,source_name,sort_order,is_active) values
  ('TPL-01','WS-01','1. Control Hormigonado','Hormigonado','General','V01',95,'Rev. Planillas SAP V01 (1).xlsx',1,true),
  ('TPL-02','WS-02','2. Post Hormigonado','Post Hormigonado','General','V01',95,'Rev. Planillas SAP V01 (1).xlsx',2,true),
  ('TPL-03','WS-03','3. Acero Columnas y muros','Acero - Columnas y Muros','General','V01',95,'Rev. Planillas SAP V01 (1).xlsx',3,true),
  ('TPL-04','WS-04','4. Acero Losas','Acero - Losas Estructurales','General','V01',95,'Rev. Planillas SAP V01 (1).xlsx',4,true),
  ('TPL-05','WS-05','5. Acero Vigas y Fundaciones','Acero - Vigas y Fundaciones','General','V01',95,'Rev. Planillas SAP V01 (1).xlsx',5,true),
  ('TPL-06','WS-06','6. Encofrado columnas y muros','Encofrado - Columnas y Muros','General','V01',95,'Rev. Planillas SAP V01 (1).xlsx',6,true),
  ('TPL-07','WS-07','7. Encofrado losas y vigas','Encofrado - Losas y Vigas','General','V01',95,'Rev. Planillas SAP V01 (1).xlsx',7,true),
  ('TPL-08','WS-08','8. Sistema de viguetillas','Prefabricados','General','V01',95,'Rev. Planillas SAP V01 (1).xlsx',8,true),
  ('TPL-09','WS-09','9. Mampostería','Mampostería','General','V01',90,'Rev. Planillas SAP V01 (1).xlsx',9,true),
  ('TPL-10','WS-10','10. Control Pañete Liberacion','Pañete','Liberación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',10,true),
  ('TPL-11','WS-10','11. Control Pañete Seguimiento','Pañete','Seguimiento','V01',95,'Rev. Planillas SAP V01 (1).xlsx',11,true),
  ('TPL-12','WS-10','12. Control Pañete Terminado','Pañete','Terminación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',12,true),
  ('TPL-13','WS-11','13. Torta de Piso Liberacion','Torta de Piso','Liberación','V01',92,'Rev. Planillas SAP V01 (1).xlsx',13,true),
  ('TPL-14','WS-11','14. Torta de Piso Terminado','Torta de Piso','Seguimiento','V01',92,'Rev. Planillas SAP V01 (1).xlsx',14,true),
  ('TPL-15','WS-12','15. Control áreas de ligado','Área de Ligados','General','V01',90,'Rev. Planillas SAP V01 (1).xlsx',15,true),
  ('TPL-16','WS-13','16. Colocación de Pisos Liberacion','Colocación de Pisos','Liberación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',16,true),
  ('TPL-17','WS-13','17. Colocación de Pisos Seguimiento','Colocación de Pisos','Seguimiento','V01',95,'Rev. Planillas SAP V01 (1).xlsx',17,true),
  ('TPL-18','WS-13','18. Colocación de Pisos Terminado','Colocación de Pisos','Terminación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',18,true),
  ('TPL-19','WS-14','19 Revestimiento Liberacion','Revestimiento Vertical','Liberación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',19,true),
  ('TPL-20','WS-14','20. Revestimiento Seguimiento','Revestimiento Vertical','Seguimiento','V01',95,'Rev. Planillas SAP V01 (1).xlsx',20,true),
  ('TPL-21','WS-14','21. Revestimiento Terminado','Revestimiento Vertical','Terminación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',21,true),
  ('TPL-22','WS-15','22. Colocación de Derretido Liberacion','Derretido','Liberación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',22,true),
  ('TPL-23','WS-15','23. Colocación de Derretido Seguimiento','Derretido','Seguimiento','V01',95,'Rev. Planillas SAP V01 (1).xlsx',23,true),
  ('TPL-24','WS-15','24. Colocación de Derretido  Terminado','Derretido','Terminación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',24,true),
  ('TPL-25','WS-16','25. Colocación de Pintura Liberacion','Pintura','Liberación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',25,true),
  ('TPL-26','WS-16','26. Colocación de Pintura Seguimiento','Pintura','Seguimiento','V01',95,'Rev. Planillas SAP V01 (1).xlsx',26,true),
  ('TPL-27','WS-16','27. Colocación de Pintura Terminado','Pintura','Terminación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',27,true),
  ('TPL-28','WS-17','28. Drywall  muro Liberacion','Drywall - Muros','Liberación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',28,true),
  ('TPL-29','WS-17','29. Drywall  muro Seguimiento','Drywall - Muros','Seguimiento','V01',95,'Rev. Planillas SAP V01 (1).xlsx',29,true),
  ('TPL-30','WS-17','30. Drywall  muro Terminado','Drywall - Muros','Terminación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',30,true),
  ('TPL-31','WS-18','31. Drywall  techo Liberacion','Drywall - Techos','Liberación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',31,true),
  ('TPL-32','WS-18','32. Drywall  techo Seguimiento','Drywall - Techos','Seguimiento','V01',95,'Rev. Planillas SAP V01 (1).xlsx',32,true),
  ('TPL-33','WS-18','33. Drywall  techo Terminado','Drywall - Techos','Terminación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',33,true),
  ('TPL-34','WS-19','34. fino de techo Liberacion','Fino de Techo','Liberación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',34,true),
  ('TPL-35','WS-19','35. fino de techo Terminado','Fino de Techo','Terminación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',35,true),
  ('TPL-36','WS-20','36. impermeabilizante Liberacion','Impermeabilización','Liberación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',36,true),
  ('TPL-37','WS-20','37. Impermeabilizante Terminado','Impermeabilización','Terminación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',37,true),
  ('TPL-38','WS-21','38. Carpinteria M.AL.&V. Liberacion','Carpintería - Madera, Aluminio y Vidrio','Liberación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',38,true),
  ('TPL-39','WS-21','39. Carpinteria  Terminado','Carpintería - Madera, Aluminio y Vidrio','Terminación','V01',95,'Rev. Planillas SAP V01 (1).xlsx',39,true),
  ('TPL-40','WS-22','4. Pre entregad de areas','Preentrega de Áreas','General','V01',95,'Rev. Planillas SAP V01 (1).xlsx',40,true)
on conflict(id) do update set workshop_id=excluded.workshop_id,title=excluded.title,activity=excluded.activity,stage=excluded.stage,version=excluded.version,objective=excluded.objective,source_name=excluded.source_name,sort_order=excluded.sort_order,is_active=true,updated_at=now();

insert into public.qpc_template_criteria(template_id,criterion_id,name,description,guide,weight,response_type,options,is_visit_criterion,source_row,sort_order) values
  ('TPL-01','T01-C01','Cubicación In Situ?','Cubicación in situ realizada por el ingeniero a cargo  y el suplidor de concreto','',7.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,8,1),
  ('TPL-01','T01-C02','Cubicación de Plano?','Cubicación realizada por control de planos.','',7.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,2),
  ('TPL-01','T01-C03','Plano para Mapeo?','Se utiliza para crear un mapa del hormigón a verter, se ubican los elementos ...','Muy malo= Desorden total en el área. ;  Malo=no cumple con la limpieza, tiene...',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,3),
  ('TPL-01','T01-C04','Limpieza General?','Limpieza del área: alambres, maderas, exceso de agregado fino, plásticos, vid...','Muy malo= No hay ningún tipo de acceso ; Malo= acceso no se encuentra en cond...',5.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,11,4),
  ('TPL-01','T01-C05','Acceso a Bomba y/o camiones','Acceso sin obstáculos y camino en buenas condiciones para el ingreso de bomba...','Muy malo= no hay iluminación ; Malo= iluminación  deficiente, no cubre toda e...',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,12,5),
  ('TPL-01','T01-C06','Iluminación?','La necesaria para tener una buena visibilidad para transitar y  ver los eleme...','',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,13,6),
  ('TPL-01','T01-C07','Previsión para vibrado?','Previsión de electricidad para vibrador y presencia de vibradores suficientes.','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,7),
  ('TPL-01','T01-C08','Previsión para mojado?','Previsión de tomas de agua para el mojado y curado previo y post hormigonado ...','',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,15,8),
  ('TPL-01','T01-C09','Facilidad para colocación?','Acceso seguro y con facilidad suficiente para la colocación','Muy malo= no se ha retirado el concreto del acero ; Malo= se retiro el concre...',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,9),
  ('TPL-01','T01-C10','Limpieza concreto endurecido?','Limpieza del concreto endurecido en el acero del elemento','',5.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,17,10),
  ('TPL-01','T01-C11','Listo para inspeccion 1ra vez','Se utiliza para crear un mapa del hormigón a verter, se ubican los elementos ...','Muy malo= Desorden total en el área. ;  Malo=no cumple con la limpieza, tiene...',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,18,11),
  ('TPL-01','T01-C12','Listo para inspeccion 2da vez','Se utiliza para crear un mapa del hormigón a verter, se ubican los elementos ...','Muy malo= Desorden total en el área. ;  Malo=no cumple con la limpieza, tiene...',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,19,12),
  ('TPL-02','T02-C01','Mapeo realizado y entregado?','Mapeo realizado y entregado en un plazo máximo de 24 horas','',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-02','T02-C02','Curado de elementos?','Saturación con agua durante los primeros tres (3) días o aplicación de producto','Muy malo: no se realizó; Malo: se realizó a destiempo y sólo un día; Regular: se realizo a destiempo y sólo por dos días; Bueno: se realizo a tiempo por dos días;  Muy bueno: se garantizó el curado de la totalidad de la superficie estando cubierto y húmedo durante los tres días de curado o se utilizó curador químico',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-02','T02-C03','Cumplimiento plazo de desencofrado?','Cumplir con plazos de desencofrado: Columnas y Muros: 24hr; Vigas y Losas <3m: 4 días; Vigas y losas > 3m: 7 días; Vuelos 7 días
Nota: se debe verificar en el caso de losas y vigas los resultados de las roturas de probetas, si cumple se procede de lo contrario no se puede proceder','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-02','T02-C04','Calidad de colocacion sin defectos','','',25.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-02','T02-C05','Reparación adecuada','Reparación aplicando el método y los materiales correctos','Muy malo: área sin reparar; Malo: más de la mitad del área sin reparar; Regular: la mitad del área sin reparar; Bueno: reparaciones realizadas con algunas observaciones de acabado y/o procedimiento;  Muy bueno: toda el área reparada; Nota: las reparaciones deben cumplir con los estándares de calidad que indique el Instructivo.',20.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-03','T03-C01','Acero libre de impurezas?','Verificar la correcta ubicación del acero con respecto al replanteo del encofrado.','',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-03','T03-C02','Dimension y separacion de Acero Transversal?','1. Verificar la correcta dimensión del acero transversal; 2. Tipo y longitud de ganchos.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-03','T03-C03','Replanteo del elemento? (con hilo y puntos claros)','Verificar la correcta ubicación del acero con respecto al replanteo del encofrado.','Muy malo: El acero vertical está afuera de la ubicación del replanteo y/o no tiene puntos de referencia ; Malo: El acero vertical está ubicado justo sobre el eje del replanteo, dejando el acero sin recubrimiento y/o no se obervan todos los puntos de referencia ; Regular: El acero vertical esta ubicado a 1 cm del eje del replanteo, quedando un 1 cm de recubrimiento; Bueno: El acero vertical está ubicado a 2 cm del eje del  replanteo, quedando 2cm para el recubrimiento ; Muy Bueno: El acero vertical está ubicado a igual distancia en todos los ejes del replanteo, este cumple con el recubrimiento establecido por los planos en todos sus ejes referenciados',15.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-03','T03-C04','Acero longitudinal?','Verificar la correcta ubicación del acero con respecto al replanteo del encofrado.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-03','T03-C05','Longitud de gancho y longitud de desarrollo','Verificar el correcto empalme tomando en consideración el tipo de acero del elemento.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-03','T03-C06','Ubicación de empalmes?','Verificar la ubicación del empalme según planos','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-03','T03-C07','Prevision de solaple para siguiente tramo?','Espesor, ubicación y cantidad de Previsión de Calzos y recubrimiento? correctos','Muy Malo: No tiene Previsión de Calzos y recubrimiento? de ningún tipo ; Malo: No cumple con el espesor indicado ; Regular: No cumple con la cantidad necesaria ; Bueno: Cumple con el espesor y cantidad, con adecuaciones realizadas durante la inspección; Muy Bueno: Cumple con el espesor, cantidad y/o ubicación de Previsión de Calzos y recubrimiento?, sin adecuaciones realizadas durante la inspección',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-03','T03-C08','Longitud de empalme?','Verificar el correcto empalme tomando en consideración el tipo de acero del elemento.','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-03','T03-C09','Previsión de Calzos y recubrimiento?','Espesor, ubicación y cantidad de Previsión de Calzos y recubrimiento? correctos','Muy Malo: No tiene Previsión de Calzos y recubrimiento? de ningún tipo ; Malo: No cumple con el espesor indicado ; Regular: No cumple con la cantidad necesaria ; Bueno: Cumple con el espesor y cantidad, con adecuaciones realizadas durante la inspección; Muy Bueno: Cumple con el espesor, cantidad y/o ubicación de Previsión de Calzos y recubrimiento?, sin adecuaciones realizadas durante la inspección',15.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-03','T03-C10','Listo para inspeccion 1ra vez','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,18,10),
  ('TPL-03','T03-C11','Listo para inspeccion 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,19,11),
  ('TPL-04','T04-C01','Acero libre de impurezas?','','',5.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-04','T04-C02','Armado principal según tipo de losa','Verificar tipo de losa dependiendo de ubicación, la cual definirá la posición del camellado y la longitud de desarrollo','',10.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-04','T04-C03','Ganchos y/o longitud de desarrollo','1. Verificar el tipo de gancho y su dimensión.  2. Verificar longitud de Desarrollo','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-04','T04-C04','Bastones (diametro y espaciamiento)','Verificar longitud, diámetro y espaciamiento de bastones.','',5.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-04','T04-C05','Separación y diametro (acero principal)','Revision de espaciamiento y diametros de acero principal.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-04','T04-C06','Armado adicional (diametro y espaciamiento)','Verificar longitud, diámetro y espaciamiento de bastones.','',10.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-04','T04-C07','Armado completo de nodos','Revision de cantidad de estribos y distribucion de varillas en el nodo.','',10.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-04','T04-C08','Limpieza nodos','Verificar la correcta limpieza de los nodos.','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-04','T04-C09','Longitud de empalmes','1. Verificar el tipo de gancho y su dimensión.  2. Verificar longitud de Desarrollo','',5.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-04','T04-C10','Espesor de losa y recubrimiento','Espesor, ubicacion y cantidad de Previsión de Calzos y recubrimiento?','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,18,10),
  ('TPL-04','T04-C11','Bovedillas de foam (tamaño y fijacion)','Verificar longitud, diámetro y espaciamiento de bastones.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,19,11),
  ('TPL-04','T04-C12','Adicionales en huecos','Verificar tipo de losa dependiendo de ubicación, la cual definirá la posición del camellado y la longitud de desarrollo','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,20,12),
  ('TPL-04','T04-C13','Previsión de Calzos y recubrimiento?','Espesor, ubicacion y cantidad de Previsión de Calzos y recubrimiento?','',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,21,13),
  ('TPL-04','T04-C14','Listo para inspeccion 1ra vez','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,22,14),
  ('TPL-04','T04-C15','Listo para inspeccion 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,23,15),
  ('TPL-05','T05-C01','Acero libre de impurezas?','','',5.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-05','T05-C02','Ganchos y/o longitud de desarrollo','1. Verificar el tipo de gancho y su dimensión.  2. Verificar longitud de Desarrollo','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-05','T05-C03','Bastones (diametro y espaciamiento)','Verificar longitud, diámetro y espaciamiento de bastones.','Muy malo: no se colocaron ; Malo: se colocaron pero no cumple con diámetro y espaciamiento ; Regular: se colocaron, cumple con espaciamiento pero no con diámetro o viceversa ; Bueno: cumple con el espaciamiento y  con diámetro pero les falto colocar en algunas áreas ; Muy bueno: se colocaron, cumple con el espaciamiento, diámetro y  con la ubicación',5.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-05','T05-C04','Separación y diametro (acero principal)','Revision de diametro, espaciamiento y longitud de acero adicional','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-05','T05-C05','Armado adicional (diametro y longitud)','Verificar espaciamiento y diametro de acero tranversal','',12.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-05','T05-C06','Dimension y separacion de Acero Transversal?','Verificar la separacion del acero inferior y superior','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-05','T05-C07','Empalme superior en zonas adecuadas','Verificar la correcta ubicación de empalmes de acero negativo y positivo.','',6.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-05','T05-C08','Empalme inferior en zonas adecuadas','Verificar la correcta ubicación de empalmes de acero negativo y positivo.','',6.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-05','T05-C09','Longitud del empalmes','Verificar longitud del empalme','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-05','T05-C10','Alineación dentro del encofrado','Correcta ubicación del elemento dentro del encofrado','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,18,10),
  ('TPL-05','T05-C11','Espesor de fundacion y recubrimiento','Espesor, ubicacion y cantidad de Previsión de Calzos y recubrimiento?','Muy Malo: No tiene Previsión de Calzos y recubrimiento? de ningún tipo ; Malo: No cumple con el espesor indicado ; Regular: No cumple con la cantidad necesaria ; Bueno: Cumple con el espesor y cantidad, con adecuaciones realizadas durante la inspección; Muy Bueno: Cumple con el espesor, cantidad y/o ubicación de Previsión de Calzos y recubrimiento?, sin adecuaciones realizadas durante la inspección',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,19,11),
  ('TPL-05','T05-C12','Limpieza de fondos y nodos','','',10.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,20,12),
  ('TPL-05','T05-C13','Previsión de Calzos y recubrimiento?','Espesor, ubicacion y cantidad de Previsión de Calzos y recubrimiento?','Muy Malo: No tiene Previsión de Calzos y recubrimiento? de ningún tipo ; Malo: No cumple con el espesor indicado ; Regular: No cumple con la cantidad necesaria ; Bueno: Cumple con el espesor y cantidad, con adecuaciones realizadas durante la inspección; Muy Bueno: Cumple con el espesor, cantidad y/o ubicación de Previsión de Calzos y recubrimiento?, sin adecuaciones realizadas durante la inspección',5.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,21,13),
  ('TPL-05','T05-C14','Listo para inspeccion 1ra vez','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,22,14),
  ('TPL-05','T05-C15','Listo para inspeccion 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,23,15),
  ('TPL-06','T06-C01','Estado y condición de madera o molde','Verificar las condicion del material utilizado como encofrado. Madera en buenas condiciones. Que tenga buena composición y sin grietas','Muy malo: La madera se encuentra descompuesta, con grietas y deformación ; Malo: La madera se encuentra con grietas y deformación ; Regular: La madera se encuentra con grietas  ; Buena: Mas de la mitad del área de la madera se encuentra sin  grietas y deformación ; Muy Buena: La madera se encuentra con muy buena composición y sin grietas.',15.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-06','T06-C02','Limpieza y aplicacion de desmoldante en superficie de contacto','','',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-06','T06-C03','Replanteo, posicionamiento y linealidad horizontal','Correcta ubicación y dimensión del elemento.','Muy malo: La madera esta fuera del replanteo de los puntos topográficos o ejes de charrancha ;  Malo: La madera esta encima del replanteo de los puntos topográficos o ejes de charrancha ; Regular: La madera esta entre 1 y 2 cm del replanteo de los puntos topográficos o ejes de charrancha ; Bueno: La madera esta entre 0.5 y 1 cm del replanteo de los puntos topográficos o ejes de charrancha ; Muy Bueno: La madera esta según el replanteo de los puntos topográficos o ejes de charrancha.',5.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-06','T06-C04','Plomo del elemento','Verificar la verticalidad de los elementos.','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-06','T06-C05','Separacion de tranques de madera','Verificar las condicion del material utilizado como encofrado. Madera en buenas condiciones. Que tenga buena composición y sin grietas','Muy malo: La madera se encuentra descompuesta, con grietas y deformación ; Malo: La madera se encuentra con grietas y deformación ; Regular: La madera se encuentra con grietas  ; Buena: Mas de la mitad del área de la madera se encuentra sin  grietas y deformación ; Muy Buena: La madera se encuentra con muy buena composición y sin grietas.',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-06','T06-C06','Tranques, corbatas y cuñas resistente a carga','Revisar el debido amarre y/o tranque de los elementos. Esto consta de costados ; abrazaderas, espaciadas a no más de 80 cm ; 
 Barrotes asegurados con alambre, mínimo a 10 cm ; Largueros o candados de seguridad.','Muy Malo: No cumple con el debido amarre y/o tranque de los elementos ; Malo:  No cumple con la distancia de los  amarre y/o tranque de los elementos ; Regular: tiene colocado los tranques pero están un poco flojos( no están bien ajustados); Bueno: mas de la mitad del elemento cumple con el debido amarre y/o tranque de los elementos ; Muy Bueno: toda la zona de encofrado cumple con el debido amarre y/o tranque de los elementos.',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-06','T06-C07','Arriostramiento triangulado','Verificar el arrostramiento que asegura la posición y verticalidad del elemento. Esto consta Vientos y/o soporte lateral que mantienen la alineación de la columna o muro.','Muy Malo: El encofrado no tiene  Vientos y/o soporte lateral que mantienen la alineación de la columna o muro ; Malo: El encofrado no tiene vientos y/o soportes a la distancia establecida en planos y no tienen suficiente rigidez para evitar que se mueva la columna o muro; Regular: El encofrado no tiene vientos y /o soportes a la distancia establecida para mantener la linealidad de la columna o muro ; Bueno: Mas de la mitad del encofrado tiene vientos y/o soportes a la distancia establecida y con rigidez suficiente para garantizar la linealidad de la columna o muro ; Muy Bueno: El encofrado tiene vientos y/o soportes a la distancia establecida y con rigidez suficiente para garantizar la linealidad de la columna o muro',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-06','T06-C08','Sellado de juntas','Revisar la unión de las partes del encofrado. Libre de franjas abiertas y huecos','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-06','T06-C09','Aprobacion de instalaciones','Revisar la unión de las partes del encofrado. Libre de franjas abiertas y huecos','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-06','T06-C10','Listo para inspeccion 1ra vez','Verificar las condicion del material utilizado como encofrado. Madera en buenas condiciones. Que tenga buena composición y sin grietas','Muy malo: La madera se encuentra descompuesta, con grietas y deformación ; Malo: La madera se encuentra con grietas y deformación ; Regular: La madera se encuentra con grietas  ; Buena: Mas de la mitad del área de la madera se encuentra sin  grietas y deformación ; Muy Buena: La madera se encuentra con muy buena composición y sin grietas.',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,18,10),
  ('TPL-06','T06-C11','Listo para inspeccion 2da vez','Verificar las condicion del material utilizado como encofrado. Madera en buenas condiciones. Que tenga buena composición y sin grietas','Muy malo: La madera se encuentra descompuesta, con grietas y deformación ; Malo: La madera se encuentra con grietas y deformación ; Regular: La madera se encuentra con grietas  ; Buena: Mas de la mitad del área de la madera se encuentra sin  grietas y deformación ; Muy Buena: La madera se encuentra con muy buena composición y sin grietas.',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,19,11),
  ('TPL-07','T07-C01','Estado y condición de madera o molde','Verificar las condicion del material utilizado como encofrado. Madera en buenas condiciones. Que tenga buena composición y sin grietas','Muy malo: La madera se encuentra descompuesta, con grietas y deformación ; Malo: La madera se encuentra con grietas y deformación ; Regular: La madera se encuentra con grietas  ; Buena: Mas de la mitad del área de la madera se encuentra sin  grietas y deformación ; Muy Buena: La madera se encuentra con muy buena composición y sin grietas.',10.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-07','T07-C02','Limpieza y aplicacion de desmoldante en superficie de contacto','','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-07','T07-C03','Linealidad y escuadra','Verificar la correcta linealidad y escuadra de los elementos.','Muy malo: El encofrado no esta linealmente correcto con relación a los ejes topográficos o de charrancha ; Malo: El encofrado presenta curvatura en diferentes puntos con relación a los ejes topográficos o de charrancha ; Regular: Aproximadamente la mitad del encofrado esta alineada con relación a los ejes topográficos o de charrancha ; Bueno: Mas de la mitad del encofrado cumple linealmente con relación a los ejes topográficos o de charrancha ; Muy Bueno: El encofrado esta linealmente correcto con relación a los ejes topográficos o de charrancha.',10.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-07','T07-C04','Niveles de llenado de guardera','Revisar la unión de las partes del encofrado. Libre de franjas abiertas y huecos.','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-07','T07-C05','Cotas de fondos','Verificar las cotas del encofrado de vigas, dinteles y losas.','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-07','T07-C06','Plomo y alineacion de Nodos','Verificar el correcto apoyo(En caso de ser sobre el suelo, los puntales no deben asentarse directamente al mismo y deben realizarse sobre pisos que garanticen la estabilidad del sistema de apuntalamiento) y amarre (Losa de altura > 6 metros) de los puntales.','Muy Malo: No cumple con el apoyo indicado sobre el suelo (uso de tablones)  y sujetos a restricción del suelo. Malo: Están apoyados sobre suelo de ( hormigón ) pero no están estables ni sujetos al suelo ; Regular: están apoyados sobre terreno, están nivelados pero se uso enlates 2x4, en vez de tablones; Bueno: Esta apoyado sobre los tablones y nivelados pero falta sujetarlos a la madera ( clavarlos ) Muy Bueno: Cumple con el correcto apoyo y amarre (aplica en losa de altura > 6 metros) de los puntales.',7.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-07','T07-C07','Trabes y amarre de guarderas resistente a carga','Revisar amarre y/o tranque de elementos para mantener restringidas las secciones de los elementos.','',10.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-07','T07-C08','Andamios de cargas( apoyo y amarre)','Verificar el correcto apoyo(En caso de ser sobre el suelo, los puntales no deben asentarse directamente al mismo y deben realizarse sobre pisos que garanticen la estabilidad del sistema de apuntalamiento) y amarre (Losa de altura > 6 metros) de los puntales.','Muy Malo: No cumple con el apoyo indicado sobre el suelo (uso de tablones)  y sujetos a restricción del suelo. Malo: Están apoyados sobre suelo de ( hormigón ) pero no están estables ni sujetos al suelo ; Regular: están apoyados sobre terreno, están nivelados pero se uso enlates 2x4, en vez de tablones; Bueno: Esta apoyado sobre los tablones y nivelados pero falta sujetarlos a la madera ( clavarlos ) Muy Bueno: Cumple con el correcto apoyo y amarre (aplica en losa de altura > 6 metros) de los puntales.',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-07','T07-C09','Dimensión y espaciamiento de puntales','Verificar el espaciamiento maximo y diametro minimo de los puntales','',5.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-07','T07-C10','Apoyo y amarre de puntales','Verificar el correcto apoyo(En caso de ser sobre el suelo, los puntales no deben asentarse directamente al mismo y deben realizarse sobre pisos que garanticen la estabilidad del sistema de apuntalamiento) y amarre (Losa de altura > 6 metros) de los puntales.','Muy Malo: No cumple con el apoyo indicado sobre el suelo (uso de tablones)  y sujetos a restricción del suelo. Malo: Están apoyados sobre suelo de ( hormigón ) pero no están estables ni sujetos al suelo ; Regular: están apoyados sobre terreno, están nivelados pero se uso enlates 2x4, en vez de tablones; Bueno: Esta apoyado sobre los tablones y nivelados pero falta sujetarlos a la madera ( clavarlos ) Muy Bueno: Cumple con el correcto apoyo y amarre (aplica en losa de altura > 6 metros) de los puntales.',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,18,10),
  ('TPL-07','T07-C11','Prevision de tranques para juntas constructivas','','',7.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,19,11),
  ('TPL-07','T07-C12','Sellado de juntas y huecos','Revisar la unión de las partes del encofrado. Libre de franjas abiertas y huecos.','',5.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,20,12),
  ('TPL-07','T07-C13','Aprobacion de instalaciones','Verificar el correcto apoyo(En caso de ser sobre el suelo, los puntales no deben asentarse directamente al mismo y deben realizarse sobre pisos que garanticen la estabilidad del sistema de apuntalamiento) y amarre (Losa de altura > 6 metros) de los puntales.','Muy Malo: No cumple con el apoyo indicado sobre el suelo (uso de tablones)  y sujetos a restricción del suelo. Malo: Están apoyados sobre suelo de ( hormigón ) pero no están estables ni sujetos al suelo ; Regular: están apoyados sobre terreno, están nivelados pero se uso enlates 2x4, en vez de tablones; Bueno: Esta apoyado sobre los tablones y nivelados pero falta sujetarlos a la madera ( clavarlos ) Muy Bueno: Cumple con el correcto apoyo y amarre (aplica en losa de altura > 6 metros) de los puntales.',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,21,13),
  ('TPL-07','T07-C14','Listo para inspeccion 1ra vez','Verificar las condicion del material utilizado como encofrado. Madera en buenas condiciones. Que tenga buena composición y sin grietas','Muy malo: La madera se encuentra descompuesta, con grietas y deformación ; Malo: La madera se encuentra con grietas y deformación ; Regular: La madera se encuentra con grietas  ; Buena: Mas de la mitad del área de la madera se encuentra sin  grietas y deformación ; Muy Buena: La madera se encuentra con muy buena composición y sin grietas.',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,22,14),
  ('TPL-07','T07-C15','Listo para inspeccion 2da vez','Verificar las condicion del material utilizado como encofrado. Madera en buenas condiciones. Que tenga buena composición y sin grietas','Muy malo: La madera se encuentra descompuesta, con grietas y deformación ; Malo: La madera se encuentra con grietas y deformación ; Regular: La madera se encuentra con grietas  ; Buena: Mas de la mitad del área de la madera se encuentra sin  grietas y deformación ; Muy Buena: La madera se encuentra con muy buena composición y sin grietas.',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,23,15),
  ('TPL-08','T08-C01','Viguetillas certificadas','','',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-08','T08-C02','Serparacion de viguetillas','Revisar la unión de las partes del encofrado. Libre de franjas abiertas y huecos.','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-08','T08-C03','Conectores de viguetillas','Verificar las cotas del encofrado de vigas, dinteles y losas.','',5.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-08','T08-C04','Bovedillas de foam','Revisar la unión de las partes del encofrado. Libre de franjas abiertas y huecos.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-08','T08-C05','Apoyo de vigetillas sobre superficie asegurada (6cm min)','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-08','T08-C06','Cotas de fondos','Verificar las cotas del encofrado de vigas, dinteles y losas.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-08','T08-C07','Niveles de llenado de guardera y topping','Revisar dimensiones de vigas y posicion de guarderas de vuelos o guarderas de vigas perimetrales','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-08','T08-C08','Dimensión y espaciamiento de puntales','Verificar el espaciamiento maximo y diametro minimo de los puntales','Muy Malo: No cumple con el apoyo indicado sobre el suelo (uso de tablones)  y sujetos a restricción del suelo. Malo: Están apoyados sobre suelo de ( hormigón ) pero no están estables ni sujetos al suelo ; Regular: están apoyados sobre terreno, están nivelados pero se uso enlates 2x4, en vez de tablones; Bueno: Esta apoyado sobre los tablones y nivelados pero falta sujetarlos a la madera ( clavarlos ) Muy Bueno: Cumple con el correcto apoyo y amarre (aplica en losa de altura > 6 metros) de los puntales.',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-08','T08-C09','Apoyo y amarre de puntales','Verificar el correcto apoyo(En caso de ser sobre el suelo, los puntales no deben asentarse directamente al mismo y deben realizarse sobre pisos que garanticen la estabilidad del sistema de apuntalamiento) y amarre (Losa de altura > 6 metros) de los puntales.','',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-08','T08-C10','Sellado de juntas y huecos','Revisar la unión de las partes del encofrado. Libre de franjas abiertas y huecos.','',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,18,10),
  ('TPL-08','T08-C11','Listo para inspeccion 1ra vez','Verificar las condicion del material utilizado como encofrado. Madera en buenas condiciones. Que tenga buena composición y sin grietas','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,19,11),
  ('TPL-08','T08-C12','Listo para inspeccion 2da vez','Verificar las condicion del material utilizado como encofrado. Madera en buenas condiciones. Que tenga buena composición y sin grietas','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,20,12),
  ('TPL-09','T09-C01','Organización de Materiales','Amontonados en condiciones optimas','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-09','T09-C02','Replanteo (1ra Línea)','Revisar el replanteo cumpla con las dimensiones especificadas.','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-09','T09-C03','Dimensionamiento y replanteo de puertas y ventanas','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-09','T09-C04','Refuerzo vertical (Bastones)','Verificar el espaciamiento y que estén ubicados en el centro del hueco, cruces armados según detalle y empalmes no menores de 30cms','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-09','T09-C05','Refuerzo horizontal (Serpentinas)','Revisar que estén colocadas a la separacion especificada con ganchos en los extremos y ancladas en columnas o huecos.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-09','T09-C06','Nivel de Lineas de Blocks','Las líneas de blocks colocadas a nivel','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-09','T09-C07','Espesor y llenado de Juntas','Llenado de huecos cada tres (3) líneas, hasta la mitad de última línea de block.','',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-09','T09-C08','Llenado de huecos a 3 lineas','Llenado de huecos cada tres (3) líneas, hasta la mitad de última línea de block.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-09','T09-C09','Verticalidad y linealidad de Muros','Verificar la verticalidad del muro. No mayor a 0.5cm','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-09','T09-C10','Anclaje de muros pandereta','Verificar la verticalidad del muro. No mayor a 0.5cm','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,18,10),
  ('TPL-09','T09-C11','Limpieza del area','Limpieza al momento de la inspeccion. (Inicio, durante o al final de la colocacion)','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,19,11),
  ('TPL-09','T09-C12','Listo para inspeccion 1ra vez','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,20,12),
  ('TPL-09','T09-C13','Listo para inspeccion 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,21,13),
  ('TPL-10','T10-C01','Limpieza del area general','Dejar el área limpia. Sin escombros ni rastros de mezcla.','',5.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-10','T10-C02','Preparación previa','Limpieza, fraguache, picar abultamiento, repello, lavar la pared, retirar: clavos, madera, etc..','Muy Malo: No cumple con la limpieza, fraguache, picar abultamiento, repello, lavar la pared, retirar: clavos, madera, etc. ; Malo: no cumple con picar abultamiento y retirar madera ; Regular: no cumple con retirar clavos y madera ; Bueno: cumple con tener la pared lavada, libre de madera y clavos ; Muy Bueno: Cumple con la limpieza, fraguache, picar abultamiento, repello, lavar la pared, retirar: clavos, madera, etc.',15.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-10','T10-C03','Aprobacion de instalaciones','Malla de fibra o galvanizada colocada en ranuras acuñadas de instalaciones.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-10','T10-C04','Puntos de maestras referenciados','Puntos para maestras referencias de ejes topográficos','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-10','T10-C05','Refuerzos en acuñes de instalaciones','Malla de fibra o galvanizada colocada en ranuras acuñadas de instalaciones.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-10','T10-C06','Refuerzo metalico entre mampostería y hormigón','Malla de fibra o galvanizada colocada entre elementos de mampostería y de hormigón armado (Si aplica)','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-10','T10-C07','Reglas para rastrear en condiciones','Reglas y/o perfiles utilizados para rastrear en buenas condiciones','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-10','T10-C08','Mochetas listas segun dimensiones','Reglas y/o perfiles utilizados para rastrear en buenas condiciones','',15.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-10','T10-C09','Proteccion de pañete y areas previas terminadas','Puntos para maestras referencias de ejes topográficos','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-10','T10-C10','Listo para inspeccion 1ra vez','Limpieza, fraguache, picar abultamiento, repello, lavar la pared, retirar: clavos, madera, etc..','Muy Malo: No cumple con la limpieza, fraguache, picar abultamiento, repello, lavar la pared, retirar: clavos, madera, etc. ; Malo: no cumple con picar abultamiento y retirar madera ; Regular: no cumple con retirar clavos y madera ; Bueno: cumple con tener la pared lavada, libre de madera y clavos ; Muy Bueno: Cumple con la limpieza, fraguache, picar abultamiento, repello, lavar la pared, retirar: clavos, madera, etc.',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,18,10),
  ('TPL-10','T10-C11','Listo para inspeccion 2da vez','Reutilización de mezcla haciendo uso de tiras de plancha de Plywood y/o plástico.','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,19,11),
  ('TPL-11','T11-C01','Reutilización de mezcla','Reutilización de mezcla haciendo uso de tiras de plancha de Plywood y/o plástico.','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,8,1),
  ('TPL-11','T11-C02','Maestras: Altura y espaciamiento','Maestras realizadas a toda altura del muro y a un espaciamiento no mayor a 1.50m.','',25.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,2),
  ('TPL-11','T11-C03','Área a pañetar humedecida','Correcto humedecimiento de la superficie a pañetar','',15.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,10,3),
  ('TPL-11','T11-C04','Condiciones de trabajo (agua, luz, material)','','',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,4),
  ('TPL-11','T11-C05','Terminacion adecuada en el tiempo requerido','','',25.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,12,5),
  ('TPL-11','T11-C06','Ejecucion sin incumplimientos 1 visita','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,6),
  ('TPL-11','T11-C07','Correcciones listas 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,7),
  ('TPL-12','T12-C01','Revision de ondulaciones con perfil metalico','','',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,8,1),
  ('TPL-12','T12-C02','Escuadras y cantos rectos','Escuadras y cantos realizados correctamente','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,2),
  ('TPL-12','T12-C03','Acabado de superficie segun determinacion de plano','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,3),
  ('TPL-12','T12-C04','Ausencia de ahuecamiento','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,4),
  ('TPL-12','T12-C05','Estrias por fraguado','Puntos para maestras referencias de ejes topográficos','',20.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,12,5),
  ('TPL-12','T12-C06','Limpieza final','Dejar el área limpia. Sin escombros ni rastros de mezcla.','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,6),
  ('TPL-12','T12-C07','Liberacion en 1era revision','Limpieza, fraguache, picar abultamiento, repello, lavar la pared, retirar: clavos, madera, etc..','inconforme',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,7),
  ('TPL-12','T12-C08','liberacion en 2da revision','Limpieza, fraguache, picar abultamiento, repello, lavar la pared, retirar: clavos, madera, etc..','inconforme',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,15,8),
  ('TPL-13','T13-C01','Pañete terminado','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-13','T13-C02','Aprobacion de tuberías e instalaciones','','',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-13','T13-C03','Limpieza previa del área','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-13','T13-C04','Perfiles y herramientas necesarias','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-13','T13-C05','Marcas de niveles topograficos identificados','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-13','T13-C06','Prevision de areas con desnivel y pendientes','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-13','T13-C07','Nivel superior de maestra sin ondulaciones','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-13','T13-C08','Maestras alineadas sin curvas','','',5.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-13','T13-C09','Separación entre maestras','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-13','T13-C10','Área Clausurada','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,18,10),
  ('TPL-13','T13-C11','Listo para inspeccion 1ra vez','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,19,11),
  ('TPL-13','T13-C12','Listo para inspeccion 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,20,12),
  ('TPL-14','T14-C01','Humedecimiento previo al vaciado','','',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-14','T14-C02','Prevision de iluminacion','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-14','T14-C03','Terminación de la superficie final frotada','La terminación de la torta es tipo frotada. Sin orificios y/o oquedades.','',25.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-14','T14-C04','Terminacion de superficie sin ondulaciones','La terminación de la torta es tipo frotada. Sin orificios y/o oquedades.','',20.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-14','T14-C05','Curado','El área esta debidamente clausurada. Evitando el paso de personas y/o equipos.','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-14','T14-C06','Limpieza final del area','El área esta previamente lavada, sin exceso de mezclas o cualquier otro material que afecte la adherencia.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-14','T14-C07','Ejecucion sin incumplimientos 1 visita','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-14','T14-C08','Correcciones listas 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-15','T15-C01','Dosificación colocada','Dosificación colocada en el área de ligado. Visible para uso del personal.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-15','T15-C02','Uso de dosificación','Se esta aplicando debidamente la dosificación suministrada','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-15','T15-C03','Calidad del almacenamiento de los agregados','Agregados libre de contaminación y divididos por blocks o algo similar.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-15','T15-C04','Fundas de conglomerante en paletas','Fundas de cemento, cementín, pegón, etc. colocadas encima de paleta(s).','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-15','T15-C05','Calidad aparente del agua','Agua libre de contaminación, ni uso de aguas con contenido salino','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-15','T15-C06','Herramientas a utilizar en buen estado','Se tienen las herramientas necesarias para ligar y dosificar la mezcla adecuadamente','',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-15','T15-C07','Base contra contaminacion para la mezcla','La mezcla se realiza sobre una base de Plywood o algo similar. Evitando la contaminación y/o daño a lo existente.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-15','T15-C08','Prevision de proteccion  para materiales','Lona en condiciones de uso dobladas o cubriendo los materiales necesarios','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-15','T15-C09','Fundas usadas organizadas','Fundas usadas colocadas en un mismo lugar o tanque de basura, cuidando la imagen del área','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-15','T15-C10','Área con limpieza óptima','El área de ligado se encuentra limpia y/o organizada. Creando una imagen sobresaliente.','Muy Malo: No cumple, el área esta en total desorden y suciedad ; Malo: no cumple, el área esta con mezcla alrededor del ligadero; Regular: no cumple, el área esta con rastros de mezcla y agua posada; Bueno: cumple con tener el área sin rastros de mezcla y ordenada; Muy Bueno: Cumple con tener el área de ligado  limpia y/o organizada.',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,18,10),
  ('TPL-15','T15-C11','Ejecucion sin incumplimientos 1 visita','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,19,11),
  ('TPL-15','T15-C12','Correcciones listas 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,20,12),
  ('TPL-16','T16-C01','Superficie limpia','','',15.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-16','T16-C02','Herramientas de trabajo completas y adecuadas.','Limpieza de piezas y juntas previo al secado del pegamento.','Muy Malo: No cumple con la limpieza de piezas y juntas previo al secado del pegamento ; Malo: no cumple las piezas tienen la juntas sucias ; Regular: no cumple las piezas están sucias ; Bueno: cumple las juntas están limpias ; Muy Bueno: Cumple con la limpieza de piezas y juntas previo al secado del pegamento.',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-16','T16-C03','Materiales  y piezas organizadas  en el área','Materiales y piezas organizadas en el área a utilizar','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-16','T16-C04','Clasificacion de piezas','Limpieza de piezas y juntas previo al secado del pegamento.','Muy Malo: No cumple con la limpieza de piezas y juntas previo al secado del pegamento ; Malo: no cumple las piezas tienen la juntas sucias ; Regular: no cumple las piezas están sucias ; Bueno: cumple las juntas están limpias ; Muy Bueno: Cumple con la limpieza de piezas y juntas previo al secado del pegamento.',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-16','T16-C05','Área clausurada','El área esta debidamente clausurada. Evitando el paso de personas y/o equipos','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-16','T16-C06','Marcas de niveles topograficos identificados','Maestra ubicada según lo definido en plano o por el cliente.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-16','T16-C07','Chequeo de niveles de control','Revisión del nivel de piso a partir del nivel topográfico.','',10.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-16','T16-C08','Replanteo según lo especificado','Maestra ubicada según lo definido en plano o por el cliente.','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-16','T16-C09','Listo para inspeccion 1ra vez','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,17,9),
  ('TPL-16','T16-C10','Listo para inspeccion 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,18,10),
  ('TPL-17','T17-C01','Uso de llana dentada','Uso de llana dentada para la aplicación del pegamento.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-17','T17-C02','Uso de separadores','Uso de separadores según se especifica en los planos, cliente o tipo de piso.','',7.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-17','T17-C03','Doble encolado completo','Aplicación de adhesivo tanto a la superficie como a la pieza. Ambos cubriendo toda el área.','',12.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-17','T17-C04','Direccion de encolado','Aplicación de adhesivo tanto a la superficie como a la pieza. Ambos cubriendo toda el área.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-17','T17-C05','Uso de hilos guías y nivel de mano','Uso de hilos guías y nivel de mano para evitar tropezones y otros desperfectos.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-17','T17-C06','Materiales  y piezas organizadas  en el área','Materiales y piezas organizadas en el área a utilizar','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-17','T17-C07','Revision de tropezones y juntas','Limpieza de piezas y juntas previo al secado del pegamento.','',15.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-17','T17-C08','Superficie humedecida','Torta de piso limpia y humedecida','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-17','T17-C09','Verificacion de tipo y diseño de piso','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-17','T17-C10','Ejecucion sin incumplimientos 1 visita','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,18,10),
  ('TPL-17','T17-C11','Correcciones listas 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,19,11),
  ('TPL-18','T18-C01','Revision de piezas huecas','Limpieza de piezas y juntas previo al secado del pegamento.','Muy Malo: No cumple con la limpieza de piezas y juntas previo al secado del pegamento ; Malo: no cumple las piezas tienen la juntas sucias ; Regular: no cumple las piezas están sucias ; Bueno: cumple las juntas están limpias ; Muy Bueno: Cumple con la limpieza de piezas y juntas previo al secado del pegamento.',15.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-18','T18-C02','Revision de tropezones','Uso de separadores según se especifica en los planos, cliente o tipo de piso.','',20.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-18','T18-C03','Chequeo de pendientes','Revisión del nivel de piso a partir del nivel topográfico.','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-18','T18-C04','Prevision de proteccion de piso','Espesor de pegón entre 3 y 4mm','Muy Malo: No cumple con el espesor de pegón entre 3 y 4mm ; Malo: no cumple, el espesor de pegón es mayor de 5 mm; Regular: no cumple en algunas zonas el pegón es mayor de 4mm; Bueno: cumple el pegón tiene un espesor de 4mm; Muy Bueno: Cumple con el espesor de pegón de 3mm',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-18','T18-C05','Limpieza de piezas y juntas','Limpieza de piezas y juntas previo al secado del pegamento.','Muy Malo: No cumple con la limpieza de piezas y juntas previo al secado del pegamento ; Malo: no cumple las piezas tienen la juntas sucias ; Regular: no cumple las piezas están sucias ; Bueno: cumple las juntas están limpias ; Muy Bueno: Cumple con la limpieza de piezas y juntas previo al secado del pegamento.',15.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-18','T18-C06','Colocacion de chazos completas','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-18','T18-C07','Organización de sobrantes y chazos','Limpieza de piezas y juntas previo al secado del pegamento.','Muy Malo: No cumple con la limpieza de piezas y juntas previo al secado del pegamento ; Malo: no cumple las piezas tienen la juntas sucias ; Regular: no cumple las piezas están sucias ; Bueno: cumple las juntas están limpias ; Muy Bueno: Cumple con la limpieza de piezas y juntas previo al secado del pegamento.',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-18','T18-C08','Liberacion en 1era revision','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-18','T18-C09','liberacion en 2da revision','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-19','T19-C01','Pañete completo, a plomo y escuadra','','',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-19','T19-C02','Limpieza de superficie','Limpieza de piezas y juntas previo al secado del pegamento.','Muy Malo: No cumple con la limpieza de piezas y juntas previo al secado del pegamento ; Malo: no cumple las piezas tienen la juntas sucias ; Regular: no cumple las piezas están sucias ; Bueno: cumple las juntas están limpias ; Muy Bueno: Cumple con la limpieza de piezas y juntas previo al secado del pegamento.',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-19','T19-C03','Plano para despiece','Uso de separadores según se especifica en los planos, cliente o tipo de piso.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-19','T19-C04','Tipo de pegon adecuado','Espesor de pegón entre 3 y 4mm','Muy Malo: No cumple con el espesor de pegón entre 3 y 4mm ; Malo: no cumple, el espesor de pegón es mayor de 5 mm; Regular: no cumple en algunas zonas el pegón es mayor de 4mm; Bueno: cumple el pegón tiene un espesor de 4mm; Muy Bueno: Cumple con el espesor de pegón de 3mm',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-19','T19-C05','Clasificacion de Piezas','Limpieza de piezas y juntas previo al secado del pegamento.','Muy Malo: No cumple con la limpieza de piezas y juntas previo al secado del pegamento ; Malo: no cumple las piezas tienen la juntas sucias ; Regular: no cumple las piezas están sucias ; Bueno: cumple las juntas están limpias ; Muy Bueno: Cumple con la limpieza de piezas y juntas previo al secado del pegamento.',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-19','T19-C06','Materiales  y herramientas organizadas  en el área','Materiales y piezas organizadas en el área a utilizar','',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-19','T19-C07','Replanteo según lo especificado','Maestra ubicada según lo definido en plano o por el cliente.','',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-19','T19-C08','Prevision de proteccion de piso','Espesor de pegón entre 3 y 4mm','Muy Malo: No cumple con el espesor de pegón entre 3 y 4mm ; Malo: no cumple, el espesor de pegón es mayor de 5 mm; Regular: no cumple en algunas zonas el pegón es mayor de 4mm; Bueno: cumple el pegón tiene un espesor de 4mm; Muy Bueno: Cumple con el espesor de pegón de 3mm',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-19','T19-C09','Colocacion de hilos guias','Uso de hilos guías y nivel de mano para evitar tropezones y otros desperfectos.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-19','T19-C10','Iluminacion apropiada','','',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,18,10),
  ('TPL-19','T19-C11','Listo para inspeccion 1ra vez','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,19,11),
  ('TPL-19','T19-C12','Listo para inspeccion 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,20,12),
  ('TPL-20','T20-C01','Uso de llana dentada','','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-20','T20-C02','Uso de dosificacion y pegon adecuado','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-20','T20-C03','Uso de separadores','','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-20','T20-C04','Doble encolado, aplicado en lado corto de la pieza','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-20','T20-C05','Uso de hilos guías y nivel de mano','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-20','T20-C06','Materiales  y piezas organizadas  en el área','','',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-20','T20-C07','Revision de tropezones y juntas','','',15.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-20','T20-C08','Limpieza de juntas','','',15.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-20','T20-C09','Verificacion de tipo y diseño','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-20','T20-C10','Ejecucion sin incumplimientos 1 visita','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,18,10),
  ('TPL-20','T20-C11','Correcciones listas 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,19,11),
  ('TPL-21','T21-C01','Revision de piezas huecas','Limpieza de piezas y juntas previo al secado del pegamento.','',15.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-21','T21-C02','Revision de tropezones y quillados','Limpieza de piezas y juntas previo al secado del pegamento.','',20.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-21','T21-C03','Cortes delicados en accesorios','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-21','T21-C04','Medida de huecos','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-21','T21-C05','Limpieza de piezas y juntas','Limpieza de piezas y juntas previo al secado del pegamento.','',15.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-21','T21-C06','Colocacion de chazos completos','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-21','T21-C07','Organización de sobrantes y chazos','Limpieza de piezas y juntas previo al secado del pegamento.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-21','T21-C08','Liberacion en 1era revision','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-21','T21-C09','liberacion en 2da revision','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-22','T22-C01','Área clausurada','El área esta debidamente clausurada. Evitando el paso de personas','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-22','T22-C02','Dosificacion y tono de color colocada','Dosificación adecuada para la aplicación del producto','',30.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-22','T22-C03','Disposicion de herramientas completas','Dosificación adecuada para la aplicación del producto','',35.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-22','T22-C04','Limpieza y remosion de polvillo','El piso esta limpio. Sin ninguna sustancia que afecte la aplicación del derretido','',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-22','T22-C05','Listo para inspeccion 1ra vez','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,13,5),
  ('TPL-22','T22-C06','Listo para inspeccion 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,14,6),
  ('TPL-23','T23-C01','Consistencia adecuada de producto','','',40.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-23','T23-C02','Uso Taladro para mezclar producto','','',25.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-23','T23-C03','Metodología de aplicación correcta','','',35.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-23','T23-C04','Ejecucion sin incumplimientos 1 visita','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-23','T23-C05','Correcciones listas 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-24','T24-C01','Juntas terminadas según lo requerido (grumos, altura de llenado)','Juntas llenas (si aplica) y con la terminación correcta','',80.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-24','T24-C02','Limpieza final el mismo dia','Limpieza final correcta. Sin dejar manchas y excesos de derretido','',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-24','T24-C03','Liberacion en 1era revision','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-24','T24-C04','liberacion en 2da revision','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-25','T25-C01','Superficie terminada (lijada/pañetada)','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-25','T25-C02','Huecos terminados y corregidos','Juntas llenas (si aplica) y con la terminación correcta','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-25','T25-C03','Aplicación de piedra','Dosificación adecuada para la aplicación del producto','',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-25','T25-C04','Superficie sin polvo o humedad','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-25','T25-C05','Imprimante aplicado','El piso esta limpio. Sin ninguna sustancia que afecte la aplicación del derretido','Muy Malo: No cumple al tener presencia de piezas huecas; Malo: Alrededor de tercera cuarta parte no cumple al tener presencia de piezas huecas; Regular: Alrededor de la mitad no cumple al tener presencia de piezas huecas; Bueno: Alrededor de la tercera cuarta parte cumple al no tener presencia de piezas huecas; Muy Bueno: no hay piezas huecas.',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-25','T25-C06','Zocalos masillados, protegidos y limpios','','',15.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-25','T25-C07','Proteccion de accesorios y recortes','','',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-25','T25-C08','Recortes completados','','',0.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-25','T25-C09','Herramientas completas y en buen estado','','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-25','T25-C10','Tipo de pintura identificado','','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,18,10),
  ('TPL-25','T25-C11','Listo para inspeccion 1ra vez','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,19,11),
  ('TPL-25','T25-C12','Listo para inspeccion 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,20,12),
  ('TPL-26','T26-C01','Proteccion de piso','','',30.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,8,1),
  ('TPL-26','T26-C02','Cobertura de pared completa y en orden','','',25.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,2),
  ('TPL-26','T26-C03','Metodologia de Aplicación (MW)','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,3),
  ('TPL-26','T26-C04','Condicion de Herramientas.','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,4),
  ('TPL-26','T26-C05','Textura','','',20.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,12,5),
  ('TPL-26','T26-C06','Ejecucion sin incumplimientos 1 visita','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,6),
  ('TPL-26','T26-C07','Correcciones listas 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,7),
  ('TPL-27','T27-C01','Textura y cobertura adecuado','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,3,1),
  ('TPL-27','T27-C02','Texturizado apropiado','','',25.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,4,2),
  ('TPL-27','T27-C03','Culminacion completa del area','Juntas sin presencia de polvo, humedad, pegón y/o cualquier otro materiales que afecte el derretido).','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,5,3),
  ('TPL-27','T27-C04','Limpieza de accesorios','El piso esta limpio. Sin ninguna sustancia que afecte la aplicación del derretido','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,6,4),
  ('TPL-27','T27-C05','Area libre de restos de pintura','','',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,7,5),
  ('TPL-27','T27-C06','Recortes completados','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,8,6),
  ('TPL-27','T27-C07','Liberacion en 1era revision','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,7),
  ('TPL-27','T27-C08','liberacion en 2da revision','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,8),
  ('TPL-28','T28-C01','Calibre de estructura','Verificar la presencia de piezas huecas','Muy Malo: No cumple al tener  presencia de tropezones; Malo: Alrededor de la tercera cuarta parte del área no cumple al tener  presencia de tropezones; Regular: Alrededor de la mitad del área no cumple al tener  presencia de tropezones; Bueno: Alrededor de la tercera cuarta parte del área cumple al no tener  presencia de tropezones; Muy Bueno: cumple al no tener  presencia de tropezones',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-28','T28-C02','Replanteo a escuadra segun medidas','Juntas llenas (si aplica) y con la terminación correcta','',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-28','T28-C03','Plomo de estructura','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-28','T28-C04','Anclaje a losa de piso y losa de techo','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-28','T28-C05','Separacion de parales segun distribucion','','',5.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-28','T28-C06','Solaples de perfiles 30cm','','',7.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-28','T28-C07','Tornillos y clavos adecuados','','',5.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-28','T28-C08','Rrefuerzos para accesorios','','',7.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-28','T28-C09','Aislante de sonidos/temperatura','','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-28','T28-C10','Medidas de cajillos, facias, nichos, ventanas','Aplicación de 1ra mano de derretido liquido (No aplica para revestimientos) y 2da mano de derretido densa','Muy Malo: No cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Malo: Alrededor de la tercera cuarta parte del área no cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Regular: Alrededor de mitad del área no cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Bueno: Alrededor de la tercera cuarta parte del área cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Muy Bueno: Cumple con tener las juntas llenas (si aplica) y con la terminación correcta',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,18,10),
  ('TPL-28','T28-C11','Utilizacion de plantillas para elementos curvos','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,19,11),
  ('TPL-28','T28-C12','Instalaciones electricas y plomeria completa','','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,20,12),
  ('TPL-28','T28-C13','Listo para inspeccion 1ra vez','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,21,13),
  ('TPL-28','T28-C14','Listo para inspeccion 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,22,14),
  ('TPL-29','T29-C01','Tipo de plancha segun zona','Aplicación de 1ra mano de derretido liquido (No aplica para revestimientos) y 2da mano de derretido densa','',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,1),
  ('TPL-29','T29-C02','Colocacion deplanchas trabadas','Dosificación adecuada para la aplicación del producto','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,2),
  ('TPL-29','T29-C03','Calzado de plancha 3cm sobre piso terminado','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,3),
  ('TPL-29','T29-C04','Colocacion de esquineros alineados','Dosificación adecuada para la aplicación del producto','',15.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,13,4),
  ('TPL-29','T29-C05','Separacion de tornillos','Verificar la presencia de tropezones.','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,5),
  ('TPL-29','T29-C06','Cortes y union de juntas','Juntas sin presencia de polvo, humedad, pegón y/o cualquier otro materiales que afecte el derretido).','',7.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,15,6),
  ('TPL-29','T29-C07','profundidad de tornillos','Verificar la presencia de tropezones.','',7.5,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,16,7),
  ('TPL-29','T29-C08','Barrera protectora de agua','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,17,8),
  ('TPL-29','T29-C09','Ejecucion sin incumplimientos 1 visita','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,18,9),
  ('TPL-29','T29-C10','Correcciones listas 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,19,10),
  ('TPL-30','T30-C01','Masillado corecto de esquineros','Verificar la presencia de piezas huecas','Muy Malo: No cumple al tener  presencia de tropezones; Malo: Alrededor de la tercera cuarta parte del área no cumple al tener  presencia de tropezones; Regular: Alrededor de la mitad del área no cumple al tener  presencia de tropezones; Bueno: Alrededor de la tercera cuarta parte del área cumple al no tener  presencia de tropezones; Muy Bueno: cumple al no tener  presencia de tropezones',20.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-30','T30-C02','Masillado correcto de tornillos','Verificar la presencia de tropezones.','Muy Malo: No cumple al tener  presencia de piezas quilladas; Malo: Alrededor de la tercera cuarta parte del área no cumple al tener  presencia de piezas quilladas; Regular: Alrededor de la mitad del área no cumple al tener  presencia de piezas quilladas; Bueno: Alrededor de la tercera cuarta parte del área cumple al no tener  presencia de piezas quilladas; Muy Bueno: cumple al no tener  presencia de piezas quilladas.',15.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-30','T30-C03','Cinta y masilla  en juntas segun lo requerido','Juntas llenas (si aplica) y con la terminación correcta','',15.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-30','T30-C04','Colocacion de plenum','Dosificación adecuada para la aplicación del producto','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-30','T30-C05','Lijado y termiancion requerida','Juntas llenas (si aplica) y con la terminación correcta','',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-30','T30-C06','Limpieza del area','Juntas sin presencia de polvo, humedad, pegón y/o cualquier otro materiales que afecte el derretido).','Muy Malo: No cumple al tener presencia de piezas huecas; Malo: Alrededor de tercera cuarta parte no cumple al tener presencia de piezas huecas; Regular: Alrededor de la mitad no cumple al tener presencia de piezas huecas; Bueno: Alrededor de la tercera cuarta parte cumple al no tener presencia de piezas huecas; Muy Bueno: no hay piezas huecas.',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-30','T30-C07','Liberacion en 1era revision','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-30','T30-C08','liberacion en 2da revision','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-31','T31-C01','Calibre de estructura','Verificar la presencia de piezas huecas','Muy Malo: No cumple al tener  presencia de tropezones; Malo: Alrededor de la tercera cuarta parte del área no cumple al tener  presencia de tropezones; Regular: Alrededor de la mitad del área no cumple al tener  presencia de tropezones; Bueno: Alrededor de la tercera cuarta parte del área cumple al no tener  presencia de tropezones; Muy Bueno: cumple al no tener  presencia de tropezones',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-31','T31-C02','Nivel de replanteo de estructura','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-31','T31-C03','Linealidad de parales','El piso esta limpio. Sin ninguna sustancia que afecte la aplicación del derretido','',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-31','T31-C04','Anclajes de soporte al techo','Verificar la presencia de tropezones.','Muy Malo: No cumple al tener  presencia de piezas quilladas; Malo: Alrededor de la tercera cuarta parte del área no cumple al tener  presencia de piezas quilladas; Regular: Alrededor de la mitad del área no cumple al tener  presencia de piezas quilladas; Bueno: Alrededor de la tercera cuarta parte del área cumple al no tener  presencia de piezas quilladas; Muy Bueno: cumple al no tener  presencia de piezas quilladas.',15.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-31','T31-C05','Separacion de parales segun distribucion','','',10.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-31','T31-C06','Solaples de perfiles 30cm','','',7.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-31','T31-C07','Tornillos y clavos adecuados','','',5.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-31','T31-C08','Rrefuerzos para accesorios','','',7.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-31','T31-C09','Medidas de cajillos, facias, nichos, huecos','Verificar la presencia de piezas huecas','Muy Malo: No cumple al tener  presencia de tropezones; Malo: Alrededor de la tercera cuarta parte del área no cumple al tener  presencia de tropezones; Regular: Alrededor de la mitad del área no cumple al tener  presencia de tropezones; Bueno: Alrededor de la tercera cuarta parte del área cumple al no tener  presencia de tropezones; Muy Bueno: cumple al no tener  presencia de tropezones',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-31','T31-C10','Utilizacion de plantillas para elementos curvos','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,18,10),
  ('TPL-31','T31-C11','Instalaciones electricas y plomeria completa','','',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,19,11),
  ('TPL-31','T31-C12','Listo para inspeccion 1ra vez','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,20,12),
  ('TPL-31','T31-C13','Listo para inspeccion 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,21,13),
  ('TPL-32','T32-C01','Tipo de plancha segun zona','Aplicación de 1ra mano de derretido liquido (No aplica para revestimientos) y 2da mano de derretido densa','',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-32','T32-C02','Colocacion deplanchas trabadas','Dosificación adecuada para la aplicación del producto','',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-32','T32-C03','Colocacion de esquineros alineados','Dosificación adecuada para la aplicación del producto','',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-32','T32-C04','Separacion de tornillos','Verificar la presencia de tropezones.','Muy Malo: No cumple al tener  presencia de tropezones; Malo: Alrededor de la tercera cuarta parte del área no cumple al tener  presencia de tropezones; Regular: Alrededor de la mitad del área no cumple al tener  presencia de tropezones; Bueno: Alrededor de la tercera cuarta parte del área cumple al no tener  presencia de tropezones; Muy Bueno: cumple al no tener  presencia de tropezones',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-32','T32-C05','Cortes y union de juntas','Juntas sin presencia de polvo, humedad, pegón y/o cualquier otro materiales que afecte el derretido).','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-32','T32-C06','Profundidad de tornillos','Verificar la presencia de tropezones.','Muy Malo: No cumple al tener  presencia de tropezones; Malo: Alrededor de la tercera cuarta parte del área no cumple al tener  presencia de tropezones; Regular: Alrededor de la mitad del área no cumple al tener  presencia de tropezones; Bueno: Alrededor de la tercera cuarta parte del área cumple al no tener  presencia de tropezones; Muy Bueno: cumple al no tener  presencia de tropezones',15.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-32','T32-C07','Ejecucion sin incumplimientos 1 visita','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-32','T32-C08','Correcciones listas 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-33','T33-C01','Masillado corecto de esquineros','Verificar la presencia de piezas huecas','Muy Malo: No cumple al tener presencia de piezas huecas; Malo: Alrededor de tercera cuarta parte no cumple al tener presencia de piezas huecas; Regular: Alrededor de la mitad no cumple al tener presencia de piezas huecas; Bueno: Alrededor de la tercera cuarta parte cumple al no tener presencia de piezas huecas; Muy Bueno: no hay piezas huecas.',20.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-33','T33-C02','Masillado correcto de tornillos','Verificar la presencia de tropezones.','Muy Malo: No cumple al tener  presencia de tropezones; Malo: Alrededor de la tercera cuarta parte del área no cumple al tener  presencia de tropezones; Regular: Alrededor de la mitad del área no cumple al tener  presencia de tropezones; Bueno: Alrededor de la tercera cuarta parte del área cumple al no tener  presencia de tropezones; Muy Bueno: cumple al no tener  presencia de tropezones',20.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-33','T33-C03','Cinta y masilla  en juntas segun lo requerido','Juntas llenas (si aplica) y con la terminación correcta','Muy Malo: No cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Malo: Alrededor de la tercera cuarta parte del área no cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Regular: Alrededor de mitad del área no cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Bueno: Alrededor de la tercera cuarta parte del área cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Muy Bueno: Cumple con tener las juntas llenas (si aplica) y con la terminación correcta',25.0,'1 a 3','[{"label":"Inconforme","factor":0},{"label":"Regular","factor":0.5},{"label":"Conforme","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-33','T33-C04','Lijado y termiancion requerida','Juntas llenas (si aplica) y con la terminación correcta','Muy Malo: No cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Malo: Alrededor de la tercera cuarta parte del área no cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Regular: Alrededor de mitad del área no cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Bueno: Alrededor de la tercera cuarta parte del área cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Muy Bueno: Cumple con tener las juntas llenas (si aplica) y con la terminación correcta',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-33','T33-C05','Limpieza del area','Juntas sin presencia de polvo, humedad, pegón y/o cualquier otro materiales que afecte el derretido).','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-33','T33-C06','Liberacion en 1era revision','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-33','T33-C07','liberacion en 2da revision','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-34','T34-C01','Pasantes acunados con grout','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-34','T34-C02','Lineas de nivel para verificacion de pendietes','Aplicación de 1ra mano de derretido liquido (No aplica para revestimientos) y 2da mano de derretido densa','Muy Malo: No cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Malo: Alrededor de la tercera cuarta parte del área no cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Regular: Alrededor de mitad del área no cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Bueno: Alrededor de la tercera cuarta parte del área cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Muy Bueno: Cumple con tener las juntas llenas (si aplica) y con la terminación correcta',5.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-34','T34-C03','Limatesas y limaoyas con flujo hacia desagues','','',15.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-34','T34-C04','Limpieza de objetos indeseados','Juntas sin presencia de polvo, humedad, pegón y/o cualquier otro materiales que afecte el derretido).','Muy Malo: No cumple al tener presencia de piezas huecas; Malo: Alrededor de tercera cuarta parte no cumple al tener presencia de piezas huecas; Regular: Alrededor de la mitad no cumple al tener presencia de piezas huecas; Bueno: Alrededor de la tercera cuarta parte cumple al no tener presencia de piezas huecas; Muy Bueno: no hay piezas huecas.',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-34','T34-C05','Control de espesores (minimo 4cm)','','',15.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-34','T34-C06','Colocacion de Malla para desniveles de foam','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-34','T34-C07','Prevision de Agua para curado','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-34','T34-C08','Panete previendo 20cm desde el punto mas alto del fino','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-34','T34-C09','tapado de cazoletas','Aplicación de 1ra mano de derretido liquido (No aplica para revestimientos) y 2da mano de derretido densa','Muy Malo: No cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Malo: Alrededor de la tercera cuarta parte del área no cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Regular: Alrededor de mitad del área no cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Bueno: Alrededor de la tercera cuarta parte del área cumple con tener las juntas llenas (si aplica) y con la terminación correcta; Muy Bueno: Cumple con tener las juntas llenas (si aplica) y con la terminación correcta',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-34','T34-C10','Listo para inspeccion 1ra vez','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,18,10),
  ('TPL-34','T34-C11','Listo para inspeccion 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,19,11),
  ('TPL-35','T35-C01','Terminacion frotada de superficie','','',25.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,10,1),
  ('TPL-35','T35-C02','Realizacion de Zabaleta','Juntas sin presencia de polvo, humedad, pegón y/o cualquier otro materiales que afecte el derretido).','Muy Malo: No cumple al tener presencia de piezas huecas; Malo: Alrededor de tercera cuarta parte no cumple al tener presencia de piezas huecas; Regular: Alrededor de la mitad no cumple al tener presencia de piezas huecas; Bueno: Alrededor de la tercera cuarta parte cumple al no tener presencia de piezas huecas; Muy Bueno: no hay piezas huecas.',15.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,11,2),
  ('TPL-35','T35-C03','Ausencia de grietas','Verificar la presencia de tropezones.','Muy Malo: No cumple al tener  presencia de piezas quilladas; Malo: Alrededor de la tercera cuarta parte del área no cumple al tener  presencia de piezas quilladas; Regular: Alrededor de la mitad del área no cumple al tener  presencia de piezas quilladas; Bueno: Alrededor de la tercera cuarta parte del área cumple al no tener  presencia de piezas quilladas; Muy Bueno: cumple al no tener  presencia de piezas quilladas.',30.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,3),
  ('TPL-35','T35-C04','Prueba de estanqueidada liberada','Verificar la existencia de piezas quilladas','',30.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,4),
  ('TPL-35','T35-C05','Liberacion en 1era revision','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,5),
  ('TPL-35','T35-C06','liberacion en 2da revision','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,15,6),
  ('TPL-36','T36-C01','Pendientes y niveles adecuados','','',25.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-36','T36-C02','Colocacion y acune de cazoletas','Aplicación de 1ra mano de derretido liquido (No aplica para revestimientos) y 2da mano de derretido densa','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-36','T36-C03','Grietas y fisuras tratadas','El área esta debidamente clausurada. Evitando el paso de personas','Muy Malo: No cumple al tener  presencia de piezas quilladas; Malo: Alrededor de la tercera cuarta parte del área no cumple al tener  presencia de piezas quilladas; Regular: Alrededor de la mitad del área no cumple al tener  presencia de piezas quilladas; Bueno: Alrededor de la tercera cuarta parte del área cumple al no tener  presencia de piezas quilladas; Muy Bueno: cumple al no tener  presencia de piezas quilladas.',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-36','T36-C04','Terminacion de estructuras de soportes, Panete y/o revestimeinto','','',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-36','T36-C05','Encuentro de esquinas completas (zabaletas si aplica)','','',10.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-36','T36-C06','Limpieza general e superficie','Limpieza final correcta. Sin dejar manchas y excesos de derretido','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-36','T36-C07','Listo para inspeccion 1ra vez','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,15,7),
  ('TPL-36','T36-C08','Listo para inspeccion 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,16,8),
  ('TPL-37','T37-C01','Cobertura total del produtco','Existencia y uso del taladro correcto para mezclar el producto','',35.0,'1 a 5','[{"label":"Muy Malo","factor":0},{"label":"Malo","factor":0.25},{"label":"Regular","factor":0.5},{"label":"Bueno","factor":0.75},{"label":"Muy Bueno","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,8,1),
  ('TPL-37','T37-C02','Prueba de estanquidad superada','El área esta debidamente clausurada. Evitando el paso de personas','',50.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,2),
  ('TPL-37','T37-C03','Limpiza del area','Juntas sin presencia de polvo, humedad, pegón y/o cualquier otro materiales que afecte el derretido).','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,3),
  ('TPL-37','T37-C04','Liberacion en 1era revision','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,4),
  ('TPL-37','T37-C05','liberacion en 2da revision','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,5),
  ('TPL-38','T38-C01','Pañete terminado','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-38','T38-C02','Rectificacion de Hueco con premarco','Dosificación adecuada para la aplicación del producto','',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-38','T38-C03','Imprimante aplicado','El piso esta limpio. Sin ninguna sustancia que afecte la aplicación del derretido','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-38','T38-C04','Piso completado','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-38','T38-C05','Replanteo del elemento','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-38','T38-C06','Estructuras de apoyo completa','Aplicación de 1ra mano de derretido liquido (No aplica para revestimientos) y 2da mano de derretido densa','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-38','T38-C07','Techos, cajillos, cortineros colinadantes terminados correctamente.','','',10.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-38','T38-C08','Listo para inspeccion 1ra vez','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,16,8),
  ('TPL-38','T38-C09','Listo para inspeccion 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,17,9),
  ('TPL-39','T39-C01','Plomo y nivel','','',20.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-39','T39-C02','Funcionamiento adecuado','Dosificación adecuada para la aplicación del producto','Muy Malo: No cumple al tener  presencia de piezas quilladas; Malo: Alrededor de la tercera cuarta parte del área no cumple al tener  presencia de piezas quilladas; Regular: Alrededor de la mitad del área no cumple al tener  presencia de piezas quilladas; Bueno: Alrededor de la tercera cuarta parte del área cumple al no tener  presencia de piezas quilladas; Muy Bueno: cumple al no tener  presencia de piezas quilladas.',25.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-39','T39-C03','Accesorios completos','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-39','T39-C04','Sellado de bordes y juntas (entre mocheta premarco y marco)','','',15.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-39','T39-C05','Condiciones del elemento','','',25.0,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-39','T39-C06','Ejecucion sin incumplimientos 1 visita','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-39','T39-C07','Correcciones listas 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-40','T40-C01','Recortes de pintura','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,9,1),
  ('TPL-40','T40-C02','Retoques de masilla','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,10,2),
  ('TPL-40','T40-C03','Derretido vacios revestimientos','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,11,3),
  ('TPL-40','T40-C04','Derretido vacios piso','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,12,4),
  ('TPL-40','T40-C05','Terminacion alrededor cubre faltas','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,13,5),
  ('TPL-40','T40-C06','Limpieza de materiales','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,14,6),
  ('TPL-40','T40-C07','Ecuentro pared-pared','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,15,7),
  ('TPL-40','T40-C08','Encuentro techo pared','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,16,8),
  ('TPL-40','T40-C09','Encuentro pared zocalo','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,17,9),
  ('TPL-40','T40-C10','Huecos de luces','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,18,10),
  ('TPL-40','T40-C11','Huecos de cajas electricas','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,19,11),
  ('TPL-40','T40-C12','Pachos de pintura','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,20,12),
  ('TPL-40','T40-C13','Zocalos completa','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,21,13),
  ('TPL-40','T40-C14','Accesorios de ducha completo y funcionando','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,22,14),
  ('TPL-40','T40-C15','Accesorios de lavamanos completos y funcioando','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,23,15),
  ('TPL-40','T40-C16','Funcionamiento Inodoro','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,24,16),
  ('TPL-40','T40-C17','Funcionamiento de jacuzzi','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,25,17),
  ('TPL-40','T40-C18','Funcionamiento de Puerta Principal','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,26,18),
  ('TPL-40','T40-C19','Accesorios de Puertas Principal completos y funcionando','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,27,19),
  ('TPL-40','T40-C20','Funcionamiento de Puerta Inodoro','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,28,20),
  ('TPL-40','T40-C21','Accesorios de Puerta Inodoro completos y funcionando','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,29,21),
  ('TPL-40','T40-C22','Funcionamiento de Puerta Ducha','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,30,22),
  ('TPL-40','T40-C23','Accesorios de Puerta ducha completos y funcionando','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,31,23),
  ('TPL-40','T40-C24','Funcionamiento de Puerta Conecting','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,32,24),
  ('TPL-40','T40-C25','Accesorios de Puertas Conecting completos y funcionando','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,33,25),
  ('TPL-40','T40-C26','Funcionamiento de Balconera','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,34,26),
  ('TPL-40','T40-C27','Espaldar de cama y accesorios','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,35,27),
  ('TPL-40','T40-C28','Sensor de movimiento','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,36,28),
  ('TPL-40','T40-C29','Sensor de puertas','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,37,29),
  ('TPL-40','T40-C30','Luces completas y funcionando','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,38,30),
  ('TPL-40','T40-C31','Rejilla de piso ducha','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,39,31),
  ('TPL-40','T40-C32','Rejilla de piso balcon','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,40,32),
  ('TPL-40','T40-C33','Rejilla de inspeccion','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,41,33),
  ('TPL-40','T40-C34','Rejilla de aire acondicionado','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,42,34),
  ('TPL-40','T40-C35','Baranda de balcones','','',2.0,'1 a 2','[{"label":"Incompleto","factor":0},{"label":"Deficiente","factor":0.5},{"label":"Completo","factor":1},{"label":"N/A","factor":null}]'::jsonb,false,43,35),
  ('TPL-40','T40-C36','Listo para inspeccion 1ra vez','','',13.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,44,36),
  ('TPL-40','T40-C37','Listo para inspeccion 2da vez','','',28.5,'SI / NO','[{"label":"Sí","factor":1},{"label":"No","factor":0},{"label":"N/A","factor":null}]'::jsonb,true,45,37)
on conflict(template_id,criterion_id) do update set name=excluded.name,description=excluded.description,guide=excluded.guide,weight=excluded.weight,response_type=excluded.response_type,options=excluded.options,is_visit_criterion=excluded.is_visit_criterion,source_row=excluded.source_row,sort_order=excluded.sort_order;

-- Catálogo de solo lectura para usuarios autenticados. Las escrituras operativas se incorporarán mediante funciones seguras.
alter table public.qpc_workshops enable row level security;
alter table public.qpc_inspection_templates enable row level security;
alter table public.qpc_template_criteria enable row level security;
drop policy if exists qpc_workshops_select on public.qpc_workshops;
create policy qpc_workshops_select on public.qpc_workshops for select to authenticated using (is_active=true or public.current_user_has_permission('settings.manage'));
drop policy if exists qpc_templates_select on public.qpc_inspection_templates;
create policy qpc_templates_select on public.qpc_inspection_templates for select to authenticated using (is_active=true or public.current_user_has_permission('settings.manage'));
drop policy if exists qpc_template_criteria_select on public.qpc_template_criteria;
create policy qpc_template_criteria_select on public.qpc_template_criteria for select to authenticated using (true);
grant select on public.qpc_workshops,public.qpc_inspection_templates,public.qpc_template_criteria to authenticated;

-- 2. Resolución centralizada del taller/etapa a partir de la planilla
create or replace function public.qpc_resolved_activity(p_activity text,p_template_id text)
returns text language sql stable set search_path=public as $$
  select coalesce(
    case when upper(trim(coalesce(p_activity,''))) in ('','MIGRADO','MIGRADOS','SIN TALLER ASIGNADO') then null else trim(p_activity) end,
    (select t.activity from public.qpc_inspection_templates t where t.id=p_template_id),
    'Taller pendiente de asociar'
  );
$$;

create or replace function public.qpc_resolved_stage(p_stage text,p_template_id text)
returns text language sql stable set search_path=public as $$
  select coalesce(nullif(trim(coalesce(p_stage,'')),''),(select t.stage from public.qpc_inspection_templates t where t.id=p_template_id),'General');
$$;

-- 3. Reimportar/actualizar todas las visitas del respaldo app_state.
-- La migración anterior solo consideraba FINALIZADA cuando el texto coincidía exactamente;
-- aquí también se reconoce finishedAt o un puntaje final como evidencia de cierre.
insert into public.qpc_inspection_visits(
  legacy_id,inspection_id,visit_number,visit_type,template_id,workshop_id,activity,stage,template_snapshot,answers_snapshot,notes_snapshot,
  started_by,finished_by,started_at,finished_at,status,technical_score,preparation_score,final_score,objective,decision,general_observation
)
select
  nullif(src.v->>'id',''),i.id,coalesce(nullif(src.v->>'number','')::integer,src.ordinality::integer),
  case when lower(coalesce(src.v->>'stage','')) similar to '%(cierre|termin)%' then 'CIERRE'
       when coalesce(nullif(src.v->>'number','')::integer,src.ordinality::integer)=1 then 'LIBERACION' else 'SEGUIMIENTO' end,
  coalesce(nullif(src.v->>'templateId',''),i.template_id,'UNKNOWN'),t.workshop_id,
  coalesce(nullif(src.v->>'activity',''),t.activity,public.qpc_resolved_activity(i.activity,i.template_id)),
  coalesce(nullif(src.v->>'stage',''),t.stage,public.qpc_resolved_stage(i.stage,i.template_id)),
  jsonb_build_object('id',t.id,'title',t.title,'activity',t.activity,'stage',t.stage,'objective',t.objective),
  coalesce(src.v->'answers','{}'::jsonb),coalesce(src.v->'notes','{}'::jsonb),
  coalesce(public.qpc_profile_id_from_legacy(src.v->>'startedBy'),i.assigned_quality_id,i.closed_by,i.requested_by),
  coalesce(public.qpc_profile_id_from_legacy(src.v->>'finishedBy'),i.closed_by,i.assigned_quality_id),
  coalesce(nullif(src.v->>'startedAt','')::timestamptz,i.created_at),
  coalesce(nullif(src.v->>'finishedAt','')::timestamptz,i.closed_at,case when nullif(src.v->>'finalScore','') is not null then i.updated_at end),
  case when upper(coalesce(src.v->>'status',''))='FINALIZADA' or nullif(src.v->>'finishedAt','') is not null or nullif(src.v->>'finalScore','') is not null then 'FINALIZADA' else 'EN_PROCESO' end,
  nullif(src.v->>'technicalScore','')::numeric,nullif(src.v->>'visitScore','')::numeric,nullif(src.v->>'finalScore','')::numeric,
  coalesce(nullif(src.v->>'objective','')::numeric,t.objective,i.objective,0),nullif(src.v->>'decision',''),coalesce(src.v->>'generalObservation','')
from public.qpc_inspections i
cross join lateral jsonb_array_elements(coalesce(i.source_snapshot->'visitEvaluations','[]'::jsonb)) with ordinality src(v,ordinality)
left join public.qpc_inspection_templates t on t.id=coalesce(nullif(src.v->>'templateId',''),i.template_id)
on conflict(inspection_id,visit_number) do update set
  legacy_id=coalesce(public.qpc_inspection_visits.legacy_id,excluded.legacy_id),
  template_id=excluded.template_id,workshop_id=coalesce(excluded.workshop_id,public.qpc_inspection_visits.workshop_id),
  activity=excluded.activity,stage=excluded.stage,
  template_snapshot=coalesce(public.qpc_inspection_visits.template_snapshot,excluded.template_snapshot),
  answers_snapshot=case when excluded.answers_snapshot<>'{}'::jsonb then excluded.answers_snapshot else public.qpc_inspection_visits.answers_snapshot end,
  notes_snapshot=case when excluded.notes_snapshot<>'{}'::jsonb then excluded.notes_snapshot else public.qpc_inspection_visits.notes_snapshot end,
  finished_by=coalesce(excluded.finished_by,public.qpc_inspection_visits.finished_by),
  finished_at=coalesce(excluded.finished_at,public.qpc_inspection_visits.finished_at),
  status=case when excluded.status='FINALIZADA' then 'FINALIZADA' else public.qpc_inspection_visits.status end,
  technical_score=coalesce(excluded.technical_score,public.qpc_inspection_visits.technical_score),
  preparation_score=coalesce(excluded.preparation_score,public.qpc_inspection_visits.preparation_score),
  final_score=coalesce(excluded.final_score,public.qpc_inspection_visits.final_score),
  objective=case when excluded.objective>0 then excluded.objective else public.qpc_inspection_visits.objective end,
  decision=coalesce(excluded.decision,public.qpc_inspection_visits.decision),
  general_observation=case when excluded.general_observation<>'' then excluded.general_observation else public.qpc_inspection_visits.general_observation end,
  updated_at=now();

-- 4. Reparar asociación de planillas/talleres en inspecciones y visitas.
with candidates as (
  select i.id,coalesce(
    case when exists(select 1 from public.qpc_inspection_templates t where t.id=nullif(i.source_snapshot->>'templateId','')) then nullif(i.source_snapshot->>'templateId','') end,
    (select v.template_id from public.qpc_inspection_visits v join public.qpc_inspection_templates t on t.id=v.template_id where v.inspection_id=i.id order by v.visit_number desc limit 1)
  ) as template_id
  from public.qpc_inspections i
  where i.template_id='UNKNOWN' or not exists(select 1 from public.qpc_inspection_templates t where t.id=i.template_id)
)
update public.qpc_inspections i set template_id=c.template_id,updated_at=now()
from candidates c where c.id=i.id and c.template_id is not null;

update public.qpc_inspections i set
  workshop_id=t.workshop_id,
  activity=t.activity,
  stage=case when upper(trim(coalesce(i.activity,''))) in ('','MIGRADO','MIGRADOS','SIN TALLER ASIGNADO') then t.stage else public.qpc_resolved_stage(i.stage,i.template_id) end,
  objective=case when coalesce(i.objective,0)<=0 then t.objective else i.objective end,
  updated_at=now()
from public.qpc_inspection_templates t
where t.id=i.template_id and (
  i.workshop_id is distinct from t.workshop_id or upper(trim(coalesce(i.activity,''))) in ('','MIGRADO','MIGRADOS','SIN TALLER ASIGNADO') or coalesce(i.objective,0)<=0
);

update public.qpc_inspection_visits v set
  workshop_id=t.workshop_id,activity=t.activity,
  stage=case when upper(trim(coalesce(v.activity,''))) in ('','MIGRADO','MIGRADOS','SIN TALLER ASIGNADO') then t.stage else public.qpc_resolved_stage(v.stage,v.template_id) end,
  objective=case when coalesce(v.objective,0)<=0 then t.objective else v.objective end,
  status=case when v.status='EN_PROCESO' and (v.finished_at is not null or v.final_score is not null) then 'FINALIZADA' else v.status end,
  finished_at=case when v.status='EN_PROCESO' and v.final_score is not null and v.finished_at is null then coalesce(i.closed_at,i.updated_at) else v.finished_at end,
  updated_at=now()
from public.qpc_inspection_templates t,public.qpc_inspections i
where t.id=v.template_id and i.id=v.inspection_id;

-- 5. Crear una visita histórica resumida solo cuando una inspección tiene puntaje pero ninguna visita finalizada.
insert into public.qpc_inspection_visits(
  legacy_id,inspection_id,visit_number,visit_type,template_id,workshop_id,activity,stage,template_snapshot,answers_snapshot,notes_snapshot,
  started_by,finished_by,started_at,finished_at,status,technical_score,preparation_score,final_score,objective,decision,general_observation
)
select
  'RECONCILED-'||i.id::text,i.id,1,case when i.status='CERRADA' then 'CIERRE' else 'LIBERACION' end,
  i.template_id,i.workshop_id,public.qpc_resolved_activity(i.activity,i.template_id),public.qpc_resolved_stage(i.stage,i.template_id),
  jsonb_build_object('id',t.id,'title',t.title,'activity',t.activity,'stage',t.stage,'objective',t.objective,'origin','reconciled-summary'),
  '{}'::jsonb,'{}'::jsonb,coalesce(i.closed_by,i.assigned_quality_id,i.requested_by),coalesce(i.closed_by,i.assigned_quality_id),
  i.created_at,coalesce(i.closed_at,i.updated_at), 'FINALIZADA',i.current_technical_score,i.current_preparation_score,i.current_final_score,
  coalesce(nullif(i.objective,0),t.objective,0),coalesce(i.latest_decision,case i.status when 'CERRADA' then 'Cerrada' when 'LIBERADA' then 'Liberada' when 'CON_OBSERVACIONES' then 'Con observaciones' when 'NO_LIBERADA' then 'No liberada' else i.status end),
  'Visita histórica resumida creada por la reconciliación V8.6. No contiene detalle de criterios cuando el respaldo original no lo suministró.'
from public.qpc_inspections i
left join public.qpc_inspection_templates t on t.id=i.template_id
where i.current_final_score is not null
  and not exists(select 1 from public.qpc_inspection_visits v where v.inspection_id=i.id and v.status='FINALIZADA')
on conflict(inspection_id,visit_number) do nothing;

-- 6. Materializar las respuestas históricas desde answers_snapshot usando el catálogo de criterios.
insert into public.qpc_visit_answers(
  visit_id,criterion_id,criterion_name,criterion_stage,weight,is_visit_criterion,selected_label,factor,observation,points_earned,points_lost,is_na,sort_order
)
select
  v.id,c.criterion_id,c.name,coalesce(nullif(v.stage,''),t.stage),c.weight,c.is_visit_criterion,
  v.answers_snapshot->>c.criterion_id,choice.factor,coalesce(v.notes_snapshot->>c.criterion_id,''),
  case when upper(trim(coalesce(v.answers_snapshot->>c.criterion_id,''))) in ('N/A','NA','NO APLICA') or choice.factor is null then null else c.weight*choice.factor end,
  case when upper(trim(coalesce(v.answers_snapshot->>c.criterion_id,''))) in ('N/A','NA','NO APLICA') or choice.factor is null then null else c.weight-(c.weight*choice.factor) end,
  upper(trim(coalesce(v.answers_snapshot->>c.criterion_id,''))) in ('N/A','NA','NO APLICA'),c.sort_order
from public.qpc_inspection_visits v
join public.qpc_inspection_templates t on t.id=v.template_id
join public.qpc_template_criteria c on c.template_id=t.id
left join lateral (
  select case when jsonb_typeof(opt->'factor')='number' then (opt->>'factor')::numeric else null end as factor
  from jsonb_array_elements(c.options) opt
  where opt->>'label'=v.answers_snapshot->>c.criterion_id limit 1
) choice on true
where v.status='FINALIZADA' and v.answers_snapshot ? c.criterion_id and coalesce(v.answers_snapshot->>c.criterion_id,'')<>''
on conflict(visit_id,criterion_id) do update set
  criterion_name=excluded.criterion_name,criterion_stage=excluded.criterion_stage,weight=excluded.weight,
  is_visit_criterion=excluded.is_visit_criterion,selected_label=excluded.selected_label,factor=excluded.factor,
  observation=excluded.observation,points_earned=excluded.points_earned,points_lost=excluded.points_lost,is_na=excluded.is_na,sort_order=excluded.sort_order,updated_at=now();

-- Completar puntajes faltantes a partir del detalle recuperado, sin reemplazar valores históricos existentes.
with scores as (
  select visit_id,
    100*sum(points_earned) filter(where not is_na and not is_visit_criterion)/nullif(sum(weight) filter(where not is_na and not is_visit_criterion),0) as technical,
    coalesce(100*sum(points_earned) filter(where not is_na and is_visit_criterion)/nullif(sum(weight) filter(where not is_na and is_visit_criterion),0),100) as preparation,
    100*sum(points_earned) filter(where not is_na)/nullif(sum(weight) filter(where not is_na),0) as final
  from public.qpc_visit_answers group by visit_id
)
update public.qpc_inspection_visits v set
  technical_score=coalesce(v.technical_score,s.technical),preparation_score=coalesce(v.preparation_score,s.preparation),
  final_score=coalesce(v.final_score,s.final),updated_at=now()
from scores s where s.visit_id=v.id;

-- Recalcular el acumulado de cada inspección con todas las visitas finalizadas.
with aggregates as (
  select inspection_id,avg(technical_score) as technical,avg(preparation_score) as preparation,avg(final_score) as final,
    max(finished_at) as last_finished_at,(array_agg(decision order by visit_number desc) filter(where decision is not null))[1] as last_decision
  from public.qpc_inspection_visits where status='FINALIZADA' group by inspection_id
)
update public.qpc_inspections i set
  current_technical_score=a.technical,current_preparation_score=a.preparation,current_final_score=a.final,
  latest_decision=coalesce(a.last_decision,i.latest_decision),
  closed_at=case when i.status='CERRADA' then coalesce(i.closed_at,a.last_finished_at) else i.closed_at end,
  updated_at=now()
from aggregates a where a.inspection_id=i.id;

-- 7. Completar la interconexión del exportable PPTX agregado en V8.5.
alter table public.qpc_export_runs drop constraint if exists qpc_export_runs_format_check;
alter table public.qpc_export_runs add constraint qpc_export_runs_format_check check (export_format in ('CSV','PDF','PPTX'));

create or replace function public.qpc_log_export(
  p_project_id text,p_report_kind text,p_export_format text,p_period_mode text,p_period_value text,
  p_filters jsonb default '{}'::jsonb,p_row_count integer default 0,p_file_id uuid default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_id uuid; v_permission text;
begin
  if v_actor is null then raise exception 'Sesión no válida'; end if;
  if not public.qpc_user_can_access_project(v_actor,p_project_id) then raise exception 'No tiene acceso al proyecto'; end if;
  v_permission:=case upper(p_export_format) when 'CSV' then 'exports.csv' when 'PDF' then 'exports.pdf' when 'PPTX' then 'exports.pdf' else null end;
  if v_permission is null then raise exception 'Formato no permitido'; end if;
  if not public.user_has_permission_for(v_actor,v_permission) then raise exception 'No tiene permiso para exportar en este formato'; end if;
  if p_period_mode not in ('week','month') then raise exception 'Periodo no permitido'; end if;
  insert into public.qpc_export_runs(project_id,actor_id,report_kind,export_format,period_mode,period_value,filters,row_count,file_id)
  values(p_project_id,v_actor,coalesce(nullif(trim(p_report_kind),''),'unknown'),upper(p_export_format),p_period_mode,p_period_value,coalesce(p_filters,'{}'::jsonb),greatest(coalesce(p_row_count,0),0),p_file_id)
  returning id into v_id;
  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,new_data)
  values(p_project_id,v_actor,'report.exported','export',v_id::text,jsonb_build_object('kind',p_report_kind,'format',upper(p_export_format),'period_mode',p_period_mode,'period_value',p_period_value,'row_count',p_row_count,'filters',coalesce(p_filters,'{}'::jsonb)));
  return v_id;
end; $$;
revoke all on function public.qpc_log_export(text,text,text,text,text,jsonb,integer,uuid) from public,anon;
grant execute on function public.qpc_log_export(text,text,text,text,text,jsonb,integer,uuid) to authenticated;

-- 8. Vistas de reporting robustas: incluyen inspecciones con puntaje aunque el detalle histórico estuviera incompleto.
-- Se eliminan y recrean porque PostgreSQL no permite cambiar el nombre u orden
-- de las columnas de una vista mediante CREATE OR REPLACE VIEW.
drop view if exists public.qpc_reporting_integrity;
drop view if exists public.qpc_reporting_answers;
drop view if exists public.qpc_reporting_visits;
drop view if exists public.qpc_reporting_inspections;

create or replace view public.qpc_reporting_inspections with (security_invoker=true) as
select
  i.id as inspection_id,i.request_code,i.closure_code,i.project_id,pr.name as project_name,pr.short_code as project_short_code,
  i.template_id,i.workshop_id,t.title as template_title,public.qpc_resolved_activity(i.activity,i.template_id) as activity,
  public.qpc_resolved_stage(i.stage,i.template_id) as stage,i.location_text,i.requested_date,i.requested_time,i.status,
  coalesce(nullif(i.objective,0),t.objective,0) as objective,i.current_technical_score as technical_score,
  i.current_preparation_score as preparation_score,i.current_final_score as final_score,i.latest_decision,i.requested_by,
  coalesce(exec.full_name,exec.email,'Usuario histórico') as execution_name,exec.email as execution_email,exec.execution_area,
  i.assigned_quality_id,assigned.full_name as assigned_quality_name,i.closed_by,closer.full_name as closed_by_name,i.closed_at,
  coalesce(vs.visit_count,0)::integer as visit_count,vs.first_visit_decision,coalesce(vs.first_visit_decision='Liberada',false) as first_visit_released,
  vs.last_finished_at,coalesce(i.closed_at,vs.last_finished_at,i.updated_at,i.created_at) as completed_at,
  coalesce(i.closed_at,vs.last_finished_at,i.updated_at,i.created_at)::date as completed_date
from public.qpc_inspections i
join public.qpc_projects pr on pr.id=i.project_id
left join public.qpc_inspection_templates t on t.id=i.template_id
left join public.profiles exec on exec.id=i.requested_by
left join public.profiles assigned on assigned.id=i.assigned_quality_id
left join public.profiles closer on closer.id=i.closed_by
left join lateral (
  select count(*) filter(where v.status='FINALIZADA') as visit_count,max(v.finished_at) filter(where v.status='FINALIZADA') as last_finished_at,
         (array_agg(v.decision order by v.visit_number) filter(where v.status='FINALIZADA' and v.visit_number=1))[1] as first_visit_decision
  from public.qpc_inspection_visits v where v.inspection_id=i.id
) vs on true
where i.current_final_score is not null;

create or replace view public.qpc_reporting_visits with (security_invoker=true) as
select
  v.id as visit_id,v.inspection_id,i.request_code,i.closure_code,i.project_id,pr.name as project_name,pr.short_code as project_short_code,
  i.location_text,i.requested_date,i.requested_by,coalesce(exec.full_name,exec.email,'Usuario histórico') as execution_name,
  exec.email as execution_email,exec.execution_area,v.visit_number,v.visit_type,v.template_id,v.workshop_id,t.title as template_title,
  public.qpc_resolved_activity(v.activity,v.template_id) as activity,public.qpc_resolved_stage(v.stage,v.template_id) as stage,
  v.started_by,starter.full_name as started_by_name,v.finished_by,finisher.full_name as quality_name,v.started_at,v.finished_at,
  coalesce(v.finished_at,i.closed_at,i.updated_at)::date as completed_date,v.status,v.technical_score,v.preparation_score,v.final_score,
  coalesce(nullif(v.objective,0),t.objective,i.objective,0) as objective,v.decision,v.general_observation
from public.qpc_inspection_visits v
join public.qpc_inspections i on i.id=v.inspection_id
join public.qpc_projects pr on pr.id=i.project_id
left join public.qpc_inspection_templates t on t.id=v.template_id
left join public.profiles exec on exec.id=i.requested_by
left join public.profiles starter on starter.id=v.started_by
left join public.profiles finisher on finisher.id=v.finished_by
where v.status='FINALIZADA';

create or replace view public.qpc_reporting_answers with (security_invoker=true) as
select
  a.id as answer_id,a.visit_id,v.inspection_id,i.request_code,i.closure_code,i.project_id,pr.name as project_name,i.location_text,
  i.requested_by,coalesce(exec.full_name,exec.email,'Usuario histórico') as execution_name,exec.execution_area,v.visit_number,v.visit_type,
  v.template_id,v.workshop_id,public.qpc_resolved_activity(v.activity,v.template_id) as activity,
  public.qpc_resolved_stage(v.stage,v.template_id) as stage,v.finished_at,coalesce(v.finished_at,i.closed_at,i.updated_at)::date as completed_date,
  v.final_score as visit_final_score,coalesce(nullif(v.objective,0),t.objective,i.objective,0) as visit_objective,
  a.criterion_id,a.criterion_name,a.criterion_stage,a.weight,a.is_visit_criterion,a.selected_label,a.factor,a.observation,
  a.points_earned,a.points_lost,a.is_na,a.sort_order
from public.qpc_visit_answers a
join public.qpc_inspection_visits v on v.id=a.visit_id and v.status='FINALIZADA'
join public.qpc_inspections i on i.id=v.inspection_id
join public.qpc_projects pr on pr.id=i.project_id
left join public.qpc_inspection_templates t on t.id=v.template_id
left join public.profiles exec on exec.id=i.requested_by;

-- 9. Diagnóstico visible para IT/Presidencia. La migración intenta dejar esta vista en cero incidencias.
create or replace view public.qpc_reporting_integrity with (security_invoker=true) as
select i.project_id,i.id as inspection_id,i.request_code,'UNKNOWN_TEMPLATE'::text as issue_type,'La planilla no existe en el catálogo relacional.'::text as detail
from public.qpc_inspections i left join public.qpc_inspection_templates t on t.id=i.template_id where t.id is null
union all
select i.project_id,i.id,i.request_code,'UNRESOLVED_WORKSHOP','No fue posible recuperar el nombre real del taller.'
from public.qpc_inspections i where public.qpc_resolved_activity(i.activity,i.template_id)='Taller pendiente de asociar'
union all
select i.project_id,i.id,i.request_code,'SCORED_WITHOUT_FINAL_VISIT','La inspección tiene puntaje, pero no una visita finalizada.'
from public.qpc_inspections i where i.current_final_score is not null and not exists(select 1 from public.qpc_inspection_visits v where v.inspection_id=i.id and v.status='FINALIZADA')
union all
select i.project_id,i.id,i.request_code,'FINAL_VISIT_WITHOUT_CRITERIA','La visita está finalizada, pero no contiene detalle recuperable de criterios.'
from public.qpc_inspections i join public.qpc_inspection_visits v on v.inspection_id=i.id and v.status='FINALIZADA'
where v.answers_snapshot<>'{}'::jsonb and not exists(select 1 from public.qpc_visit_answers a where a.visit_id=v.id);

grant select on public.qpc_reporting_inspections,public.qpc_reporting_visits,public.qpc_reporting_answers,public.qpc_reporting_integrity to authenticated;

insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,new_data)
select null,p.id,'data.reconciliation.phase7','system','V8.6',jsonb_build_object(
  'workshops',(select count(*) from public.qpc_workshops),
  'templates',(select count(*) from public.qpc_inspection_templates),
  'criteria',(select count(*) from public.qpc_template_criteria),
  'reporting_inspections',(select count(*) from public.qpc_reporting_inspections),
  'integrity_issues',(select count(*) from public.qpc_reporting_integrity)
)
from public.profiles p where p.role='IT' and p.is_active=true
  and not exists(select 1 from public.audit_logs a where a.action='data.reconciliation.phase7' and a.entity_id='V8.6')
order by p.created_at limit 1;

commit;

select 'talleres' as objeto,count(*) as registros from public.qpc_workshops
union all select 'planillas',count(*) from public.qpc_inspection_templates
union all select 'criterios catálogo',count(*) from public.qpc_template_criteria
union all select 'inspecciones calificables',count(*) from public.qpc_reporting_inspections
union all select 'visitas finalizadas',count(*) from public.qpc_reporting_visits
union all select 'respuestas recuperadas',count(*) from public.qpc_reporting_answers
union all select 'incidencias pendientes',count(*) from public.qpc_reporting_integrity;
