import fs from 'node:fs';
const app=fs.readFileSync(new URL('../app.bundle.js',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/admin-user-management/index.ts',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../SUPABASE_V9_4_PHASE15.sql',import.meta.url),'utf8');
const checks=[
  ['dropdown no llena contraseña',!app.includes("password.value=DEMO_PASSWORD")&&!app.includes("p.value=DEMO_PASSWORD")],
  ['mensaje explica palomita',app.includes('Pulse la palomita del correo')],
  ['correo editable y sincronizado',app.includes('previous_email:selected?.email')&&edge.includes('users.email.update')],
  ['recuperación IT',edge.includes('recover_it_account')&&edge.includes('generate_it_recovery_codes')&&sql.includes('qpc_it_recovery_codes')],
  ['copia de periodos',app.includes('qpc_clone_report_period_content')&&sql.includes('qpc_clone_report_period_content')],
  ['organización de láminas',app.includes('qpc_save_report_slide_plan')&&sql.includes('qpc_report_slide_plan')],
  ['vista previa completa',app.includes("qpcExportPdfP5?.('complete')")],
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);
