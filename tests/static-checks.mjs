import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.bundle.js',import.meta.url),'utf8');
const required=['app.bundle.js?v=9.5.0','styles.css?v=9.5.0','data/catalogos.js'];
for(const value of required){if(!html.includes(value))throw new Error(`Falta referencia: ${value}`);}
if(html.includes('equipment_seed.js'))throw new Error('MAIN no debe cargar equipment_seed.js');
if(!app.includes('qpc_set_report_cycle_status'))throw new Error('No se encontró el flujo de revisión de informes');
console.log('V9.5 static checks: OK');
