import fs from 'node:fs';
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.bundle.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const phase18=fs.readFileSync(new URL('../supabase/migrations/20260727_018_report_comparison_and_clock.sql',import.meta.url),'utf8');
const phase19=fs.readFileSync(new URL('../supabase/migrations/20260727_019_report_validation_gate.sql',import.meta.url),'utf8');
const phase21=fs.readFileSync(new URL('../supabase/migrations/20260727_020_notifications_activity_center.sql',import.meta.url),'utf8');
const phase22=fs.readFileSync(new URL('../supabase/migrations/20260727_021_equipment_notification_digest.sql',import.meta.url),'utf8');
const phase23=fs.readFileSync(new URL('../supabase/migrations/20260727_022_device_web_notifications.sql',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../qpc-sw.js',import.meta.url),'utf8');
const manifest=fs.readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8');
const checks=[
  ['cache 10.3.0',index.includes('app.bundle.js?v=10.3.0')&&index.includes('styles.css?v=10.3.0')],
  ['perfil universal e IT',app.includes('Mi perfil debe estar disponible para absolutamente todos los usuarios')&&app.includes('window.qpcOpenProfile')],
  ['drawer móvil accesible',app.includes('qpc-mobile-drawer-close')&&css.includes('.qpc-mobile-drawer-close')&&css.includes('qpc-mobile-drawer-open')],
  ['grids móviles normalizados',css.includes('.content .grid[style*="grid-template-columns"]')&&css.includes('grid-template-columns:minmax(0,1fr)!important')],
  ['reloj vivo',app.includes('qpcLiveClock')&&app.includes('setInterval(updateClock,1000)')],
  ['panel comparación',app.includes('Comparar versiones publicadas')&&phase18.includes('reports.library.compare')],
  ['panel validación',app.includes('Validación previa a publicación')&&app.includes('qpc_report_validation_for_period')],
  ['checklist editable',app.includes('qpc_set_report_section_check')&&app.includes('data-p19-save')],
  ['excepción auditada',app.includes('qpc_set_report_validation_override')&&phase19.includes('REPORT_VALIDATION_OVERRIDE_ENABLED')],
  ['bloqueo publicación',phase19.includes('qpc_enforce_report_validation_before_publish')&&phase19.includes('trg_qpc_report_cycle_validation_gate')],
  ['invalidación por cambios',phase19.includes('trg_qpc_report_entries_invalidate_validation')&&phase19.includes('trg_qpc_report_entry_files_invalidate_validation')],
  ['estilos fase 19',css.includes('.p19-validation-card')&&css.includes('.p19-check-row')],
  ['instructivos visibles en solicitud',app.includes('p20-related-doc')&&app.includes('data-p4-view-document')&&app.includes('Visualizar mapeo')],
  ['centro de notificaciones',app.includes('qpcNotificationBell')&&app.includes('qpc_notifications_for_current_user')&&css.includes('.qpc-notification-panel')],
  ['notificaciones RLS y triggers',phase21.includes('qpc_notifications_select_own')&&phase21.includes('trg_qpc_notify_inspection_changes')&&phase21.includes('trg_qpc_notify_report_cycle_changes')],
  ['digest de equipos',phase22.includes('equipment-summary:')&&phase22.includes('metadata')&&app.includes('qpc-equipment-digest-card')&&css.includes('.qpc-equipment-digest-list')],
  ['filtros de notificaciones',app.includes('data-notification-filter')&&css.includes('.qpc-notification-filters')],
  ['manifest PWA',index.includes('manifest.webmanifest')&&manifest.includes('QPC CODELPA')],
  ['service worker push',sw.includes("addEventListener('push'")&&sw.includes('QPC_NOTIFICATION_OPEN')],
  ['preferencias dispositivo',app.includes('qpcDeviceNotifications')&&app.includes('qpc_notification_preferences')&&css.includes('.qpc-device-notification-card')],
  ['suscripciones push',phase23.includes('qpc_push_subscriptions')&&phase23.includes('qpc_notification_for_current_user')],
];
let failed=false;
for(const [name,ok] of checks){console.log(`${ok?'OK':'FAIL'} ${name}`);if(!ok)failed=true;}
if(failed)process.exit(1);
