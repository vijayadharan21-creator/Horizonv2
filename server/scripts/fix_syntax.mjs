// fix_syntax.mjs - fixes the double-backtick syntax error in task-generation.service.js
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = resolve(__dirname, '..', 'service', 'ai', 'task-generation.service.js');

let content = readFileSync(filePath, 'utf8');

// The bad pattern: closing the template literal twice `.`; -> should be just .`;
// Line looks like: use "Unassigned".`;`;
const badPattern = 'use \\"Unassigned\\".`;\`;';

// Find the bad line and fix it
const lines = content.split('\n');
let fixed = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Unassigned') && lines[i].endsWith('\`;\`;')) {
    lines[i] = lines[i].replace('\`;\`;', '\`;');
    fixed = true;
    console.log('Fixed line', i + 1, ':', lines[i].slice(-30));
  }
}

if (fixed) {
  writeFileSync(filePath, lines.join('\n'), 'utf8');
  console.log('Saved successfully.');
} else {
  console.log('Pattern not found — checking manually...');
  // Try alternate detection
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Unassigned') && lines[i].includes('\`;')) {
      console.log('Line', i + 1, JSON.stringify(lines[i].slice(-40)));
    }
  }
}
