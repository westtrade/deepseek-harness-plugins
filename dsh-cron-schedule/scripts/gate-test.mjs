import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBoard, gateVerdict, headingsOf, inspectBoard, sectionTasks } from '../lib/gate.js';
import { normalizeGate, normalizeJob } from '../lib/store.js';

let pass = 0; let fail = 0;
const ok = (label, cond, extra = '') => { if (cond) { pass += 1; return; } fail += 1; console.log('FAIL:', label, extra); };

const board = `---
kanban-plugin: board
---

## Backlog

- [ ] not this one

## Incoming

- [ ] first task
- [ ] second task
- [x] already done

### Sub heading inside incoming

- [ ] a task under a subheading still counts

## Working

- [ ] other column
`;
ok('headings found', JSON.stringify(headingsOf(board)) === JSON.stringify(['Backlog', 'Incoming', 'Working']), JSON.stringify(headingsOf(board)));
ok('frontmatter is not a heading', !headingsOf(board).includes('kanban-plugin: board'));
const incoming = sectionTasks(board, 'Incoming');
ok('open count', incoming.open === 3, String(incoming.open));
ok('closed count', incoming.closed === 1, String(incoming.closed));
ok('other columns excluded', sectionTasks(board, 'Working').open === 1);
ok('case-insensitive heading', sectionTasks(board, 'incoming').open === 3);
ok('missing section is reported', sectionTasks(board, 'Nope').found === false);
ok('an empty column is found but empty', sectionTasks('## Incoming\n\n## Working\n', 'Incoming').found === true && sectionTasks('## Incoming\n\n## Working\n', 'Incoming').open === 0);
ok('code fences are ignored', sectionTasks('## Incoming\n\n```\n- [ ] quoted\n```\n', 'Incoming').open === 0);
ok('asterisk bullets count', sectionTasks('## Incoming\n\n* [ ] a\n', 'Incoming').open === 1);
ok('indented tasks count', sectionTasks('## Incoming\n\n  - [ ] a\n', 'Incoming').open === 1);

// --- gate normalization ---
ok('no gate by default', normalizeJob({ name: 'a', expression: '* * * * *', workspacePath: '/tmp', prompt: 'p' }, undefined, 1).gate === undefined);
ok('null disables', normalizeGate(null) === undefined);
ok('false disables', normalizeGate(false) === undefined);
ok('true uses the defaults', JSON.stringify(normalizeGate(true)) === JSON.stringify({ file: 'TODO.md', heading: 'Incoming' }), JSON.stringify(normalizeGate(true)));
ok('an object carries its settings', JSON.stringify(normalizeGate({ file: '.vscode/TODO.md', heading: 'Review' })) === JSON.stringify({ file: '.vscode/TODO.md', heading: 'Review' }));
ok('a partial object keeps the default file', normalizeGate({ heading: 'Review' }).file === 'TODO.md');
ok('an update keeps the gate when the field is absent', normalizeGate(undefined, { file: 'x.md', heading: 'Y' }).file === 'x.md');
ok('an update can clear the gate', normalizeGate(null, { file: 'x.md', heading: 'Y' }) === undefined);

// --- real files ---
const dir = await mkdtemp(path.join(tmpdir(), 'gate-'));
await writeFile(path.join(dir, 'TODO.md'), board);
const job = (gate) => ({ workspacePath: dir, gate });
ok('default file resolves', (await gateVerdict(job({ file: 'TODO.md', heading: 'Incoming' }))).run === true);
const emptyDir = await mkdtemp(path.join(tmpdir(), 'gate-empty-'));
const missing = await gateVerdict({ workspacePath: emptyDir, gate: { file: 'TODO.md', heading: 'Incoming' } });
ok('a missing file is fatal', missing.run === false && missing.status === 'fatal', JSON.stringify(missing.message));
ok('the fatal message names the path', missing.message.includes('TODO.md'), missing.message);
await writeFile(path.join(emptyDir, 'TODO.md'), '## Incoming\n\n- [x] done only\n');
const empty = await gateVerdict({ workspacePath: emptyDir, gate: { file: 'TODO.md', heading: 'Incoming' } });
ok('an empty column skips', empty.run === false && empty.status === 'skip', JSON.stringify(empty.message));
ok('the skip message names the column', empty.message.includes('Incoming'), empty.message);
await writeFile(path.join(emptyDir, 'TODO.md'), '## Review\n\n- [ ] x\n');
const wrongSection = await gateVerdict({ workspacePath: emptyDir, gate: { file: 'TODO.md', heading: 'Incoming' } });
ok('a renamed column is fatal, not a silent skip', wrongSection.run === false && wrongSection.status === 'fatal', JSON.stringify(wrongSection));
ok('the fatal message lists the real sections', wrongSection.message.includes('Review'), wrongSection.message);
ok('a job without a gate always runs', (await gateVerdict({ workspacePath: emptyDir })).run === true);

// --- create ---
const created = await createBoard({ workspacePath: emptyDir, file: 'board/NEW.md', heading: 'Incoming' });
ok('create makes the folder and file', created.exists === true && created.found === true, JSON.stringify(created));
ok('the created file holds the column', (await readFile(path.join(emptyDir, 'board/NEW.md'), 'utf8')).includes('## Incoming'));
ok('a created empty board skips', (await gateVerdict({ workspacePath: emptyDir, gate: { file: 'board/NEW.md', heading: 'Incoming' } })).status === 'skip');
// Creating must never overwrite a person's board.
const kept = await createBoard({ workspacePath: dir, file: 'TODO.md', heading: 'Incoming' });
ok('create does not overwrite an existing board', kept.open === 3, JSON.stringify(kept));
ok('the original file survived', (await readFile(path.join(dir, 'TODO.md'), 'utf8')).includes('second task'));

// --- inspection ---
const inspected = await inspectBoard({ workspacePath: dir, file: 'TODO.md', heading: 'Incoming' });
ok('inspection reports counts and path', inspected.exists && inspected.open === 3 && inspected.resolvedPath === path.join(dir, 'TODO.md'), JSON.stringify(inspected.resolvedPath));
ok('inspection lists the headings', inspected.headings.length === 3);
ok('an absolute path is honoured', (await inspectBoard({ workspacePath: emptyDir, file: path.join(dir, 'TODO.md'), heading: 'Incoming' })).open === 3);

console.log(`gate: pass=${pass} fail=${fail}`);
