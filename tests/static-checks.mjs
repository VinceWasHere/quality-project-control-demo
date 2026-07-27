import fs from 'node:fs';
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.bundle.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const phase18=fs.readFileSync(new URL('../supabase/migrations/20260727_018_report_comparison_and_clock.sql',import.meta.url),'utf8');
const phase19=fs.readFileSync(new URL('../supabase/migrations/20260727_019_report_validation_gate.sql',import.meta.url),'utf8');
const checks=[
  ['cache 9.9.0',index.includes('app.bundle.js?v=9.9.0')&&index.includes('styles.css?v=9.9.0')],
  ['reloj vivo',app.includes('qpcLiveClock')&&app.includes('setInterval(updateClock,1000)')],
  ['panel comparación',app.includes('Comparar versiones publicadas')&&phase18.includes('reports.library.compare')],
  ['panel validación',app.includes('Validación previa a publicación')&&app.includes('qpc_report_validation_for_period')],
  ['checklist editable',app.includes('qpc_set_report_section_check')&&app.includes('data-p19-save')],
  ['excepción auditada',app.includes('qpc_set_report_validation_override')&&phase19.includes('REPORT_VALIDATION_OVERRIDE_ENABLED')],
  ['bloqueo publicación',phase19.includes('qpc_enforce_report_validation_before_publish')&&phase19.includes('trg_qpc_report_cycle_validation_gate')],
  ['invalidación por cambios',phase19.includes('trg_qpc_report_entries_invalidate_validation')&&phase19.includes('trg_qpc_report_entry_files_invalidate_validation')],
  ['estilos fase 19',css.includes('.p19-validation-card')&&css.includes('.p19-check-row')],
  ['instructivos visibles en solicitud',app.includes('p20-related-doc')&&app.includes('data-p4-view-document')&&app.includes('Visualizar mapeo')],
];
let failed=false;
for(const [name,ok] of checks){console.log(`${ok?'OK':'FAIL'} ${name}`);if(!ok)failed=true;}
if(failed)process.exit(1);
