import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const app=fs.readFileSync(path.join(root,'app.bundle.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sql=fs.readFileSync(path.join(root,'SUPABASE_V9_0_PHASE11.sql'),'utf8');

assert.match(index,/app\.bundle\.js\?v=9\.0\.0/);
assert.match(index,/styles\.css\?v=9\.0\.0/);
assert.match(app,/qpcPrepareMappingAnnotation/);
assert.match(app,/qpc_inspection_resource_files/);
assert.match(app,/qpc_inspection_mapping_annotations/);
assert.match(app,/Integridad de datos/);
assert.match(app,/addPptxSectionDivider/);
assert.match(sql,/create table if not exists public\.qpc_file_links/);
assert.match(sql,/create table if not exists public\.qpc_migration_issues/);
assert.match(sql,/qpc_sync_inspection_resources/);
assert.match(sql,/qpc_data_integrity_summary/);

console.log('V9.0 static checks: OK');
