# DB Exam Trainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local static dark-mode trainer for SQL and theory exam practice using a JSON dataset, heuristic feedback, progress tracking, symbol keyboard, and one-click context copying.

**Architecture:** The app is a static ES module application. `app.js` owns DOM rendering and browser state, while `logic.js` contains pure functions for SQL analysis, theory preview, rubric evaluation, progress summaries, and context generation so behavior can be tested with Node before wiring the UI.

**Tech Stack:** Plain HTML, CSS, JavaScript ES modules, static `exercises.json`, Node's built-in `node:test` runner for logic tests, local HTTP server for browser verification.

---

## File Structure

- Create `index.html`: semantic shell, top controls, workspace, schema panel, feedback areas.
- Create `styles.css`: dark OKLCH theme, two-column product layout, SQL highlighting, theory keyboard, responsive schema drawer, reduced-motion handling.
- Create `logic.js`: pure tested functions for normalization, highlighting tokenization, SQL/theory checks, progress, context copying payload.
- Create `app.js`: load JSON, render exercises, manage UI events, localStorage, clipboard, solution reveal, keyboard insertion.
- Create `exercises.json`: cleaned database schemas and exercise data from the available PDFs.
- Create `tests/logic.test.mjs`: Node tests for the pure behavior.
- Create `package.json`: marks modules and defines `npm test`.

## Task 1: Test Harness And Core Logic API

**Files:**
- Create: `package.json`
- Create: `logic.js`
- Create: `tests/logic.test.mjs`

- [ ] **Step 1: Write failing tests for SQL normalization and clause extraction**

Create `tests/logic.test.mjs` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSql,
  extractSqlFeatures,
  evaluateSqlAnswer,
  renderTheoryPreview,
  evaluateTheoryAnswer,
  buildCopyContext,
  summarizeProgress
} from '../logic.js';

test('normalizes SQL by lowercasing keywords, removing extra whitespace, and trimming semicolons', () => {
  const normalized = normalizeSql(" SELECT  DISTINCT Nome  FROM Utente ; ");
  assert.equal(normalized, 'select distinct nome from utente');
});

test('extracts SQL features used by rubric checks', () => {
  const features = extractSqlFeatures(`
    SELECT DISTINCT s.NomeS, u.Email
    FROM Squadra s
    JOIN Utente u ON s.Email = u.Email
    WHERE u.AnnoNascita IS NULL
    ORDER BY s.NomeS DESC;
  `);

  assert.equal(features.hasDistinct, true);
  assert.deepEqual(features.clauses, ['select', 'from', 'join', 'where', 'order by']);
  assert.equal(features.relations.has('squadra'), true);
  assert.equal(features.relations.has('utente'), true);
  assert.equal(features.usesSubquery, false);
  assert.equal(features.hasNullCheck, true);
  assert.equal(features.orderDirections.has('desc'), true);
});

test('flags required SQL concepts and forbidden subqueries', () => {
  const result = evaluateSqlAnswer(
    `SELECT s.NomeS FROM Squadra s WHERE s.Lega = 'PessiNet12'
     AND s.NomeS IN (SELECT NomeS FROM ComposizioneSquadra);`,
    {
      requiredClauses: ['select', 'from', 'join', 'where', 'order by'],
      forbiddenClauses: ['subquery'],
      requiredRelations: ['squadra', 'composizionesquadra'],
      requiredConcepts: [
        { label: 'Filtra la lega PessiNet12', patterns: ['pessinet12'] },
        { label: 'Ordina per nome squadra decrescente', patterns: ['order by', 'desc'] }
      ]
    }
  );

  assert.equal(result.score < 100, true);
  assert.equal(result.items.find((item) => item.label === 'Clausola join').status, 'missing');
  assert.equal(result.items.find((item) => item.label === 'Vincolo: niente sottoquery').status, 'violation');
  assert.equal(result.items.find((item) => item.label === 'Filtra la lega PessiNet12').status, 'present');
  assert.equal(result.items.find((item) => item.label === 'Ordina per nome squadra decrescente').status, 'missing');
});
```

- [ ] **Step 2: Run tests and verify they fail because `logic.js` does not exist**

Run: `npm test`

Expected: FAIL with module-not-found or missing export errors for `../logic.js`.

- [ ] **Step 3: Create minimal package and logic implementation**

Create `package.json`:

```json
{
  "name": "db-exam-trainer",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.mjs"
  }
}
```

Create `logic.js` with the functions needed by the tests:

```js
const SQL_CLAUSES = ['select', 'from', 'join', 'where', 'group by', 'having', 'order by'];
const SQL_FUNCTIONS = ['count', 'sum', 'avg', 'min', 'max'];
const RELATION_AFTER = /\b(?:from|join)\s+([a-z_][a-z0-9_]*)/gi;

export function normalizeSql(sql = '') {
  return String(sql)
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/[;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function extractSqlFeatures(sql = '') {
  const normalized = normalizeSql(sql);
  const relations = new Set();
  for (const match of normalized.matchAll(RELATION_AFTER)) {
    relations.add(match[1]);
  }

  return {
    normalized,
    clauses: SQL_CLAUSES.filter((clause) => normalized.includes(clause)),
    relations,
    hasDistinct: /\bselect\s+distinct\b/.test(normalized),
    usesSubquery: /\(\s*select\b/.test(normalized) || /\b(in|exists)\s*\(\s*select\b/.test(normalized),
    hasNullCheck: /\bis\s+null\b|\bis\s+not\s+null\b/.test(normalized),
    aggregateFunctions: new Set(SQL_FUNCTIONS.filter((fn) => new RegExp(`\\b${fn}\\s*\\(`).test(normalized))),
    orderDirections: new Set(['asc', 'desc'].filter((direction) => new RegExp(`\\b${direction}\\b`).test(normalized)))
  };
}

function item(label, status, detail = '') {
  return { label, status, detail };
}

function clauseLabel(clause) {
  return `Clausola ${clause}`;
}

export function evaluateSqlAnswer(answer = '', rubric = {}) {
  const features = extractSqlFeatures(answer);
  const text = features.normalized;
  const items = [];

  for (const clause of rubric.requiredClauses || []) {
    items.push(item(clauseLabel(clause), features.clauses.includes(clause) ? 'present' : 'missing'));
  }

  for (const forbidden of rubric.forbiddenClauses || []) {
    if (forbidden === 'subquery') {
      items.push(item('Vincolo: niente sottoquery', features.usesSubquery ? 'violation' : 'present'));
    }
  }

  for (const relation of rubric.requiredRelations || []) {
    const normalizedRelation = relation.toLowerCase();
    items.push(item(`Relazione ${relation}`, features.relations.has(normalizedRelation) ? 'present' : 'missing'));
  }

  if (rubric.requiresDistinct) {
    items.push(item('DISTINCT richiesto', features.hasDistinct ? 'present' : 'missing'));
  }

  for (const concept of rubric.requiredConcepts || []) {
    const present = (concept.patterns || []).every((pattern) => text.includes(String(pattern).toLowerCase()));
    items.push(item(concept.label, present ? 'present' : 'missing', concept.hint || ''));
  }

  const evaluable = items.filter((entry) => entry.status !== 'unknown');
  const positive = evaluable.filter((entry) => entry.status === 'present').length;
  const score = evaluable.length ? Math.round((positive / evaluable.length) * 100) : 0;

  return { score, items, features };
}

export function renderTheoryPreview(input = '') {
  return String(input);
}

export function evaluateTheoryAnswer() {
  return { score: 0, items: [] };
}

export function buildCopyContext() {
  return '';
}

export function summarizeProgress() {
  return { total: 0, solved: 0, checked: 0, percent: 0 };
}
```

- [ ] **Step 4: Run tests and verify Task 1 passes partially for SQL but fails later theory/context tests only when added**

Run: `npm test`

Expected: PASS for the three SQL tests in Task 1.

## Task 2: Theory Logic, Context Builder, And Progress Model

**Files:**
- Modify: `tests/logic.test.mjs`
- Modify: `logic.js`

- [ ] **Step 1: Add failing tests for theory preview, theory rubric, copy context, and progress**

Append to `tests/logic.test.mjs`:

```js
test('renders theory shortcuts into readable mathematical symbols', () => {
  const preview = renderTheoryPreview(String.raw`\pi_{Nome}(\sigma_{Tipo='Adulto'}(Partecipante)) \and \forall x \exists y x \to y`);
  assert.equal(preview, 'π_{Nome}(σ_{Tipo=\'Adulto\'}(Partecipante)) ∧ ∀ x ∃ y x → y');
});

test('evaluates theory answers using symbols, keywords, and concepts', () => {
  const result = evaluateTheoryAnswer(
    'Uso π e σ con divisione ÷ per ottenere i partecipanti che hanno prenotato tutte le lezioni. Poi spiego la chiave candidata AD.',
    {
      expectedSymbols: ['π', 'σ', '÷'],
      expectedKeywords: ['chiave candidata'],
      expectedConcepts: [
        { label: 'Riconosce quantificazione universale', patterns: ['tutte le lezioni', 'divisione'] },
        { label: 'Cita una chiave candidata', patterns: ['chiave candidata', 'ad'] }
      ]
    }
  );

  assert.equal(result.items.find((entry) => entry.label === 'Simbolo π').status, 'present');
  assert.equal(result.items.find((entry) => entry.label === 'Keyword chiave candidata').status, 'present');
  assert.equal(result.items.find((entry) => entry.label === 'Cita una chiave candidata').status, 'present');
  assert.equal(result.score, 100);
});

test('builds a complete copy context for Codex follow-up', () => {
  const context = buildCopyContext({
    exercise: {
      title: 'SQL 1 - bassa complessita',
      section: 'sql',
      difficulty: 'easy',
      examDate: '2026-01-23',
      prompt: 'Elencare le squadre...',
      solution: 'SELECT ...'
    },
    database: {
      name: 'FantaSanremo',
      relations: [{ name: 'Utente', columns: ['Email', 'Nickname'], primaryKey: ['Email'] }],
      constraints: ['Squadra(Email) referenzia Utente(Email)'],
      notes: ['AnnoNascita puo essere NULL.']
    },
    answer: 'SELECT s.NomeS FROM Squadra s;',
    feedback: [{ label: 'Clausola where', status: 'missing' }],
    includeSolution: true
  });

  assert.match(context, /Esercizio: SQL 1 - bassa complessita/);
  assert.match(context, /Database: FantaSanremo/);
  assert.match(context, /Utente\(Email, Nickname\)/);
  assert.match(context, /Mia risposta:/);
  assert.match(context, /Soluzione ufficiale:/);
  assert.match(context, /Clausola where: missing/);
});

test('summarizes progress by section and percentage', () => {
  const summary = summarizeProgress(
    [
      { id: 'a', section: 'sql' },
      { id: 'b', section: 'sql' },
      { id: 'c', section: 'theory' }
    ],
    {
      a: { checked: true, solved: true },
      b: { checked: true, solved: false }
    }
  );

  assert.equal(summary.total, 3);
  assert.equal(summary.checked, 2);
  assert.equal(summary.solved, 1);
  assert.equal(summary.percent, 33);
  assert.equal(summary.bySection.sql.percent, 50);
  assert.equal(summary.bySection.theory.percent, 0);
});
```

- [ ] **Step 2: Run tests and verify they fail for unimplemented functions**

Run: `npm test`

Expected: FAIL for preview conversion, theory scoring, context content, and progress summary.

- [ ] **Step 3: Implement theory and progress functions**

Update `logic.js` by replacing the placeholder theory/context/progress exports:

```js
const THEORY_SHORTCUTS = new Map([
  ['\\pi', 'π'],
  ['\\sigma', 'σ'],
  ['\\rho', 'ρ'],
  ['\\forall', '∀'],
  ['\\exists', '∃'],
  ['\\and', '∧'],
  ['\\or', '∨'],
  ['\\not', '¬'],
  ['\\to', '→'],
  ['\\join', '⋈'],
  ['\\div', '÷'],
  ['\\union', '∪'],
  ['\\intersect', '∩']
]);

export function renderTheoryPreview(input = '') {
  let output = String(input);
  for (const [shortcut, symbol] of THEORY_SHORTCUTS) {
    output = output.replaceAll(shortcut, symbol);
  }
  return output;
}

export function evaluateTheoryAnswer(answer = '', rubric = {}) {
  const preview = renderTheoryPreview(answer);
  const normalized = preview.toLowerCase();
  const items = [];

  for (const symbol of rubric.expectedSymbols || []) {
    items.push(item(`Simbolo ${symbol}`, preview.includes(symbol) ? 'present' : 'missing'));
  }

  for (const keyword of rubric.expectedKeywords || []) {
    items.push(item(`Keyword ${keyword}`, normalized.includes(keyword.toLowerCase()) ? 'present' : 'missing'));
  }

  for (const concept of rubric.expectedConcepts || []) {
    const present = (concept.patterns || []).every((pattern) => normalized.includes(String(pattern).toLowerCase()));
    items.push(item(concept.label, present ? 'present' : 'missing', concept.hint || ''));
  }

  const positive = items.filter((entry) => entry.status === 'present').length;
  const score = items.length ? Math.round((positive / items.length) * 100) : 0;
  return { score, items, preview };
}

function formatSchema(database) {
  const relations = (database.relations || [])
    .map((relation) => `${relation.name}(${relation.columns.join(', ')})`)
    .join('\n');
  const constraints = (database.constraints || []).join('\n');
  const notes = (database.notes || []).join('\n');
  return [relations, constraints && `Vincoli:\n${constraints}`, notes && `Note:\n${notes}`]
    .filter(Boolean)
    .join('\n\n');
}

export function buildCopyContext({ exercise, database, answer, feedback = [], includeSolution = true }) {
  const feedbackText = feedback.length
    ? feedback.map((entry) => `- ${entry.label}: ${entry.status}${entry.detail ? ` (${entry.detail})` : ''}`).join('\n')
    : '- Nessun feedback ancora generato';

  return [
    `Esercizio: ${exercise.title}`,
    `Sezione: ${exercise.section}`,
    `Difficolta: ${exercise.difficulty}`,
    `Data appello: ${exercise.examDate}`,
    `Database: ${database.name}`,
    '',
    'Schema:',
    formatSchema(database),
    '',
    'Consegna:',
    exercise.prompt,
    '',
    'Mia risposta:',
    answer || '(vuota)',
    '',
    'Feedback:',
    feedbackText,
    includeSolution ? ['', 'Soluzione ufficiale:', exercise.solution || '(non disponibile)'].join('\n') : ''
  ]
    .filter((part) => part !== '')
    .join('\n');
}

export function summarizeProgress(exercises = [], progress = {}) {
  const total = exercises.length;
  const checked = exercises.filter((exercise) => progress[exercise.id]?.checked).length;
  const solved = exercises.filter((exercise) => progress[exercise.id]?.solved).length;
  const bySection = {};

  for (const exercise of exercises) {
    bySection[exercise.section] ??= { total: 0, checked: 0, solved: 0, percent: 0 };
    bySection[exercise.section].total += 1;
    if (progress[exercise.id]?.checked) bySection[exercise.section].checked += 1;
    if (progress[exercise.id]?.solved) bySection[exercise.section].solved += 1;
  }

  for (const section of Object.values(bySection)) {
    section.percent = section.total ? Math.round((section.solved / section.total) * 100) : 0;
  }

  return {
    total,
    checked,
    solved,
    percent: total ? Math.round((solved / total) * 100) : 0,
    bySection
  };
}
```

- [ ] **Step 4: Run tests and verify all logic tests pass**

Run: `npm test`

Expected: PASS for all tests in `tests/logic.test.mjs`.

## Task 3: JSON Dataset

**Files:**
- Create: `exercises.json`

- [ ] **Step 1: Create a focused dataset covering available exams**

Create `exercises.json` with:

```json
{
  "databases": [
    {
      "id": "bloodymary-2025-06-09",
      "name": "BloodyMary",
      "examDate": "2025-06-09",
      "description": "Piattaforma che gestisce referti prodotti da un laboratorio di analisi.",
      "relations": [
        { "name": "UTENTE", "columns": ["Nome", "Cognome", "Eta", "Sesso"], "primaryKey": ["Nome", "Cognome"] },
        { "name": "REFERTO", "columns": ["Nome", "Cognome", "Data", "Analisi", "Valore"], "primaryKey": ["Nome", "Cognome", "Data", "Analisi"] },
        { "name": "ANALISI", "columns": ["Nome", "Tipo", "Digiuno", "Prezzo", "ValoreMin", "ValoreMax"], "primaryKey": ["Nome"] }
      ],
      "constraints": [
        "REFERTO(Nome, Cognome) referenzia UTENTE(Nome, Cognome)",
        "REFERTO(Analisi) referenzia ANALISI(Nome)"
      ],
      "notes": [
        "Data e' una stringa YYYYMMDD.",
        "Eta puo' essere NULL.",
        "Tipo puo' essere ematologia, endocrinologia, biochimica, coagulazione."
      ]
    },
    {
      "id": "deebeecity-2025-07-09",
      "name": "DeeBeeCity",
      "examDate": "2025-07-09",
      "description": "Base di dati sulle strade e sugli edifici della citta DeeBeeCity.",
      "relations": [
        { "name": "STRADA", "columns": ["Nome", "Lunghezza", "SensoUnico"], "primaryKey": ["Nome"] },
        { "name": "INCROCIO", "columns": ["Strada1", "Strada2", "KmStrada1", "KmStrada2"], "primaryKey": ["Strada1", "Strada2"] },
        { "name": "EDIFICIO", "columns": ["Strada", "NumeroCivico", "Km", "Tipo", "Nome*"], "primaryKey": ["Strada", "NumeroCivico"] }
      ],
      "constraints": [
        "INCROCIO(Strada1) e INCROCIO(Strada2) referenziano STRADA(Nome)",
        "EDIFICIO(Strada) referenzia STRADA(Nome)"
      ],
      "notes": [
        "Nome in EDIFICIO puo' essere NULL.",
        "I chilometri sono NUMERIC(4,2).",
        "Per convenzione Strada1 e' la strada principale."
      ]
    },
    {
      "id": "sagrabugliano-2025-09-10",
      "name": "SagraBugliano",
      "examDate": "2025-09-10",
      "description": "Sagra della Pizza all'Ananas con stand, prodotti e ordini.",
      "relations": [
        { "name": "STAND", "columns": ["NumeroStand", "NomeStand", "TipoStand"], "primaryKey": ["NumeroStand"] },
        { "name": "PREZZARIO", "columns": ["NumeroStand", "NomeProdotto", "VeganOK", "GlutenFree", "Prezzo"], "primaryKey": ["NumeroStand", "NomeProdotto"] },
        { "name": "ORDINE", "columns": ["NumeroOrdine", "DataOrdine", "OraOrdine", "TipoPagamento"], "primaryKey": ["NumeroOrdine", "DataOrdine"] },
        { "name": "LINEAORDINE", "columns": ["NumeroOrdine", "DataOrdine", "NumeroStand", "NomeProdotto", "Quantita"], "primaryKey": ["NumeroOrdine", "DataOrdine", "NumeroStand", "NomeProdotto"] }
      ],
      "constraints": [
        "PREZZARIO(NumeroStand) referenzia STAND(NumeroStand)",
        "LINEAORDINE(NumeroOrdine, DataOrdine) referenzia ORDINE(NumeroOrdine, DataOrdine)",
        "LINEAORDINE(NumeroStand, NomeProdotto) referenzia PREZZARIO(NumeroStand, NomeProdotto)"
      ],
      "notes": [
        "Date come AAAAMMGG e orari come HHMMSS.",
        "Tutti gli attributi sono NOT NULL."
      ]
    },
    {
      "id": "nonsolosport-2025-12-17",
      "name": "Non Solo Sport e Non Solo",
      "examDate": "2025-12-17",
      "description": "Frequenza di corsi sportivi, lezioni e prenotazioni.",
      "relations": [
        { "name": "Partecipante", "columns": ["Codice", "Cognome", "Nome", "Tipo*"], "primaryKey": ["Codice"] },
        { "name": "Corso", "columns": ["Codice", "Titolo", "TotaleOre"], "primaryKey": ["Codice"] },
        { "name": "Istruttore", "columns": ["Codice", "Cognome", "Nome", "Qualifica"], "primaryKey": ["Codice"] },
        { "name": "Lezione", "columns": ["Data", "Ora", "Struttura", "Corso", "Istruttore"], "primaryKey": ["Data", "Ora", "Struttura"] },
        { "name": "Prenotazione", "columns": ["Data", "Ora", "Struttura", "Partecipante", "Modalita"], "primaryKey": ["Data", "Ora", "Struttura", "Partecipante"] }
      ],
      "constraints": [
        "Lezione(Corso) referenzia Corso(Codice)",
        "Lezione(Istruttore) referenzia Istruttore(Codice)",
        "Prenotazione(Data, Ora, Struttura) referenzia Lezione(Data, Ora, Struttura)",
        "Prenotazione(Partecipante) referenzia Partecipante(Codice)"
      ],
      "notes": [
        "Tipo assume Adulto, Bambino o NULL.",
        "Modalita assume APP o WEB.",
        "Qualifica assume PROF, DIL, AST, PROV, BOSS."
      ]
    },
    {
      "id": "fantasanremo-2026-01-23",
      "name": "FantaSanremo",
      "examDate": "2026-01-23",
      "description": "Versione semplificata del FantaSanremo con squadre, leghe, cantanti e punteggi.",
      "relations": [
        { "name": "Utente", "columns": ["Email", "Nickname", "Cognome", "Nome", "AnnoNascita*"], "primaryKey": ["Email"] },
        { "name": "Cantante", "columns": ["NomeC", "TitoloCanzone", "Baudi"], "primaryKey": ["NomeC"] },
        { "name": "Squadra", "columns": ["NomeS", "Lega", "Email"], "primaryKey": ["NomeS", "Lega"] },
        { "name": "ComposizioneSquadra", "columns": ["NomeS", "Lega", "NomeC", "Capitano"], "primaryKey": ["NomeS", "Lega", "NomeC"] },
        { "name": "Punteggio", "columns": ["NomeC", "NumeroSerata", "Punti"], "primaryKey": ["NomeC", "NumeroSerata"] }
      ],
      "constraints": [
        "Squadra(Email) referenzia Utente(Email)",
        "ComposizioneSquadra(NomeS, Lega) referenzia Squadra(NomeS, Lega)",
        "ComposizioneSquadra(NomeC) referenzia Cantante(NomeC)",
        "Punteggio(NomeC) referenzia Cantante(NomeC)"
      ],
      "notes": [
        "AnnoNascita puo' essere NULL.",
        "Capitano e' TRUE per uno e un solo cantante per squadra.",
        "NumeroSerata va da 1 a 5."
      ]
    }
  ],
  "exercises": [
    {
      "id": "2025-06-09-sql-1",
      "section": "sql",
      "examDate": "2025-06-09",
      "databaseId": "bloodymary-2025-06-09",
      "difficulty": "easy",
      "title": "SQL 1 - utenti con eta sconosciuta e analisi fuori norma",
      "prompt": "Elencare, senza duplicati e ordinati per cognome e nome, gli utenti di cui non si sa l'eta e che hanno analisi fuori dalla norma. Non usare sottoquery.",
      "solution": "SELECT DISTINCT u.Cognome, u.Nome\nFROM Utente u\nJOIN Referto r ON u.Nome = r.Nome AND u.Cognome = r.Cognome\nJOIN Analisi a ON r.Analisi = a.Nome\nWHERE u.Eta IS NULL AND (r.Valore < a.ValoreMin OR r.Valore > a.ValoreMax)\nORDER BY u.Cognome, u.Nome;",
      "rubric": {
        "requiredClauses": ["select", "from", "join", "where", "order by"],
        "forbiddenClauses": ["subquery"],
        "requiredRelations": ["utente", "referto", "analisi"],
        "requiresDistinct": true,
        "requiredConcepts": [
          { "label": "Eta sconosciuta con IS NULL", "patterns": ["eta", "is null"] },
          { "label": "Confronta valore con intervallo normale", "patterns": ["valore", "valoremin", "valoremax"] },
          { "label": "Ordina per cognome e nome", "patterns": ["order by", "cognome", "nome"] }
        ]
      }
    },
    {
      "id": "2025-06-09-sql-2",
      "section": "sql",
      "examDate": "2025-06-09",
      "databaseId": "bloodymary-2025-06-09",
      "difficulty": "medium",
      "title": "SQL 2 - ricavi 2024 per analisi economiche",
      "prompt": "Trovare, tra le analisi che costano meno di 50 euro, quelle che nel 2024 hanno generato oltre 100 mila euro di ricavi. Mostrare il nome dell'analisi, il ricavo totale e la data in cui e' stata effettuata per l'ultima volta. Non usare sottoquery.",
      "solution": "SELECT a.Nome, SUM(a.Prezzo), MAX(r.Data)\nFROM Referto r\nJOIN Analisi a ON r.Analisi = a.Nome\nWHERE r.Data >= '20240101' AND r.Data <= '20241231' AND a.Prezzo < 50\nGROUP BY a.Nome\nHAVING SUM(a.Prezzo) > 100000;",
      "rubric": {
        "requiredClauses": ["select", "from", "join", "where", "group by", "having"],
        "forbiddenClauses": ["subquery"],
        "requiredRelations": ["referto", "analisi"],
        "requiredConcepts": [
          { "label": "Filtra anno 2024", "patterns": ["20240101", "20241231"] },
          { "label": "Filtra prezzo sotto 50", "patterns": ["prezzo", "50"] },
          { "label": "Calcola ricavo con SUM", "patterns": ["sum", "prezzo"] },
          { "label": "Data ultima con MAX", "patterns": ["max", "data"] },
          { "label": "Soglia ricavi in HAVING", "patterns": ["having", "100000"] }
        ]
      }
    },
    {
      "id": "2025-06-09-sql-3",
      "section": "sql",
      "examDate": "2025-06-09",
      "databaseId": "bloodymary-2025-06-09",
      "difficulty": "hard",
      "title": "SQL 3 - utenti che hanno fatto tutte le analisi senza digiuno",
      "prompt": "Trovare, senza utilizzare operatori aggregati, gli utenti che hanno fatto tutte le analisi per cui non e' richiesto il digiuno. E' possibile utilizzare sottoquery.",
      "solution": "SELECT DISTINCT r.Nome, r.Cognome\nFROM Referto r\nWHERE NOT EXISTS (\n  SELECT *\n  FROM Analisi a\n  WHERE a.Digiuno = FALSE AND a.Nome NOT IN (\n    SELECT r1.Analisi\n    FROM Referto r1\n    WHERE r1.Nome = r.Nome AND r1.Cognome = r.Cognome\n  )\n);",
      "rubric": {
        "requiredClauses": ["select", "from", "where"],
        "requiredRelations": ["referto", "analisi"],
        "requiresDistinct": true,
        "requiredConcepts": [
          { "label": "Usa pattern universale NOT EXISTS", "patterns": ["not exists"] },
          { "label": "Considera analisi senza digiuno", "patterns": ["digiuno", "false"] },
          { "label": "Esclude analisi non fatte dall'utente", "patterns": ["not in", "analisi"] }
        ]
      }
    },
    {
      "id": "2025-07-09-sql-1",
      "section": "sql",
      "examDate": "2025-07-09",
      "databaseId": "deebeecity-2025-07-09",
      "difficulty": "easy",
      "title": "SQL 1 - edifici pubblici vicini a incroci",
      "prompt": "Elencare, in ordine decrescente di nome e strada, tutti gli edifici pubblici di cui si conosce il nome e che sono su una strada che, entro meno di 100 metri di distanza dall'edificio, incrocia una strada secondaria. E' possibile usare ABS(exp). Non usare sottoquery.",
      "solution": "SELECT DISTINCT e.Nome, e.Strada\nFROM Edificio e\nJOIN Incrocio i ON e.Strada = i.Strada1\nWHERE ABS(e.Km - i.KmStrada1) < 0.10\n  AND e.Nome IS NOT NULL\n  AND e.Tipo = 'EdificioPubblico'\nORDER BY e.Nome DESC, e.Strada DESC;",
      "rubric": {
        "requiredClauses": ["select", "from", "join", "where", "order by"],
        "forbiddenClauses": ["subquery"],
        "requiredRelations": ["edificio", "incrocio"],
        "requiresDistinct": true,
        "requiredConcepts": [
          { "label": "Filtra edifici pubblici", "patterns": ["edificiopubblico"] },
          { "label": "Esclude nomi NULL", "patterns": ["nome", "is not null"] },
          { "label": "Distanza inferiore a 0.10 km", "patterns": ["abs", "0.10"] },
          { "label": "Ordina decrescente", "patterns": ["order by", "desc"] }
        ]
      }
    },
    {
      "id": "2025-07-09-sql-2",
      "section": "sql",
      "examDate": "2025-07-09",
      "databaseId": "deebeecity-2025-07-09",
      "difficulty": "medium",
      "title": "SQL 2 - strade a senso unico con molti incroci",
      "prompt": "Trovare le strade a senso unico piu' corte di 5 Km e interessate da piu' di 20 incroci, sia come strada principale che come strada secondaria. Mostrare nome e lunghezza. Non usare sottoquery.",
      "solution": "SELECT s.Nome, s.Lunghezza\nFROM Strada s\nJOIN Incrocio i ON s.Nome = i.Strada1 OR s.Nome = i.Strada2\nWHERE s.SensoUnico = TRUE AND s.Lunghezza < 5\nGROUP BY s.Nome, s.Lunghezza\nHAVING COUNT(*) > 20;",
      "rubric": {
        "requiredClauses": ["select", "from", "join", "where", "group by", "having"],
        "forbiddenClauses": ["subquery"],
        "requiredRelations": ["strada", "incrocio"],
        "requiredConcepts": [
          { "label": "Considera strada principale o secondaria", "patterns": ["strada1", "strada2", "or"] },
          { "label": "Filtra senso unico", "patterns": ["sensounico"] },
          { "label": "Filtra lunghezza sotto 5", "patterns": ["lunghezza", "5"] },
          { "label": "Conta oltre 20 incroci", "patterns": ["having", "count", "20"] }
        ]
      }
    },
    {
      "id": "2025-07-09-sql-3",
      "section": "sql",
      "examDate": "2025-07-09",
      "databaseId": "deebeecity-2025-07-09",
      "difficulty": "hard",
      "title": "SQL 3 - strade residenziali con massimo numero di incroci",
      "prompt": "Tra le strade residenziali, cioe' composte da sole abitazioni, trovare quelle interessate dal maggior numero di incroci. E' possibile utilizzare sottoquery.",
      "solution": "WITH StradeResidenziali AS (\n  SELECT DISTINCT s.Nome\n  FROM Strada s\n  JOIN Edificio e ON s.Nome = e.Strada\n  WHERE e.Tipo = 'Abitazione'\n    AND s.Nome NOT IN (\n      SELECT e2.Strada FROM Edificio e2 WHERE e2.Tipo <> 'Abitazione'\n    )\n), Conteggi AS (\n  SELECT sr.Nome, COUNT(i.Strada1) AS NumIncroci\n  FROM StradeResidenziali sr\n  JOIN Incrocio i ON sr.Nome = i.Strada1 OR sr.Nome = i.Strada2\n  GROUP BY sr.Nome\n)\nSELECT Nome\nFROM Conteggi\nWHERE NumIncroci = (SELECT MAX(NumIncroci) FROM Conteggi);",
      "rubric": {
        "requiredClauses": ["select", "from", "join", "where", "group by"],
        "requiredRelations": ["strada", "edificio", "incrocio"],
        "requiredConcepts": [
          { "label": "Definisce strade con sole abitazioni", "patterns": ["abitazione", "not in"] },
          { "label": "Conta incroci in entrambi i ruoli", "patterns": ["strada1", "strada2", "count"] },
          { "label": "Seleziona il massimo", "patterns": ["max"] }
        ]
      }
    },
    {
      "id": "2025-09-10-sql-1",
      "section": "sql",
      "examDate": "2025-09-10",
      "databaseId": "sagrabugliano-2025-09-10",
      "difficulty": "easy",
      "title": "SQL 1 - stand con prodotti vegan o gluten free non pagati Satispay",
      "prompt": "Elencare nome e tipo degli stand che hanno venduto almeno un prodotto senza glutine o per persone vegane che non e' stato pagato con Satispay. Ordinare per nome stand crescente. Non usare sottoquery.",
      "solution": "SELECT DISTINCT s.NomeStand, s.TipoStand\nFROM Stand s\nJOIN Prezzario p ON s.NumeroStand = p.NumeroStand\nJOIN LineaOrdine l ON p.NumeroStand = l.NumeroStand AND p.NomeProdotto = l.NomeProdotto\nJOIN Ordine o ON l.NumeroOrdine = o.NumeroOrdine AND l.DataOrdine = o.DataOrdine\nWHERE (p.VeganOK = TRUE OR p.GlutenFree = TRUE)\n  AND o.TipoPagamento <> 'Satispay'\nORDER BY s.NomeStand;",
      "rubric": {
        "requiredClauses": ["select", "from", "join", "where", "order by"],
        "forbiddenClauses": ["subquery"],
        "requiredRelations": ["stand", "prezzario", "lineaordine", "ordine"],
        "requiresDistinct": true,
        "requiredConcepts": [
          { "label": "Filtra vegan o gluten free", "patterns": ["veganok", "glutenfree", "or"] },
          { "label": "Esclude Satispay", "patterns": ["satispay"] },
          { "label": "Ordina per NomeStand", "patterns": ["order by", "nomestand"] }
        ]
      }
    },
    {
      "id": "2025-09-10-sql-2",
      "section": "sql",
      "examDate": "2025-09-10",
      "databaseId": "sagrabugliano-2025-09-10",
      "difficulty": "medium",
      "title": "SQL 2 - totale ordine per tipo stand con almeno due stand",
      "prompt": "Per ogni ordine relativo ad almeno due diversi stand dello stesso tipo, indicare il prezzo complessivo pagato, suddiviso per tipo di stand. Non usare sottoquery.",
      "solution": "SELECT l.NumeroOrdine, l.DataOrdine, s.TipoStand, SUM(p.Prezzo * l.Quantita)\nFROM LineaOrdine l\nJOIN Prezzario p ON l.NumeroStand = p.NumeroStand AND l.NomeProdotto = p.NomeProdotto\nJOIN Stand s ON l.NumeroStand = s.NumeroStand\nGROUP BY l.NumeroOrdine, l.DataOrdine, s.TipoStand\nHAVING COUNT(DISTINCT s.NumeroStand) >= 2;",
      "rubric": {
        "requiredClauses": ["select", "from", "join", "group by", "having"],
        "forbiddenClauses": ["subquery"],
        "requiredRelations": ["lineaordine", "prezzario", "stand"],
        "requiredConcepts": [
          { "label": "Calcola prezzo per quantita", "patterns": ["prezzo", "quantita"] },
          { "label": "Raggruppa per ordine e tipo stand", "patterns": ["group by", "numeroordine", "dataordine", "tipostand"] },
          { "label": "Richiede almeno due stand distinti", "patterns": ["count", "distinct", "numerostand", "2"] }
        ]
      }
    },
    {
      "id": "2025-09-10-sql-3",
      "section": "sql",
      "examDate": "2025-09-10",
      "databaseId": "sagrabugliano-2025-09-10",
      "difficulty": "hard",
      "title": "SQL 3 - stand che hanno venduto tutti i prodotti",
      "prompt": "Elencare numero e nome degli stand che hanno venduto tutti i loro prodotti, anche se in ordini diversi. E' possibile utilizzare sottoquery ma non operatori aggregati o insiemistici.",
      "solution": "SELECT s.NumeroStand, s.NomeStand\nFROM Stand s\nWHERE NOT EXISTS (\n  SELECT *\n  FROM Prezzario p\n  WHERE p.NumeroStand = s.NumeroStand\n    AND NOT EXISTS (\n      SELECT *\n      FROM LineaOrdine l\n      WHERE l.NumeroStand = p.NumeroStand\n        AND l.NomeProdotto = p.NomeProdotto\n    )\n);",
      "rubric": {
        "requiredClauses": ["select", "from", "where"],
        "requiredRelations": ["stand", "prezzario", "lineaordine"],
        "requiredConcepts": [
          { "label": "Usa doppio NOT EXISTS", "patterns": ["not exists"] },
          { "label": "Confronta prodotti del prezzario con linee vendute", "patterns": ["prezzario", "lineaordine", "nomeprodotto"] }
        ]
      }
    },
    {
      "id": "2025-12-17-sql-1",
      "section": "sql",
      "examDate": "2025-12-17",
      "databaseId": "nonsolosport-2025-12-17",
      "difficulty": "easy",
      "title": "SQL 1 - corsi prenotati via app da adulti o tipo sconosciuto",
      "prompt": "Elencare, senza ripetizioni, codice e titolo dei corsi con lezioni prenotate tramite app da partecipanti adulti o di tipo sconosciuto. Ordinare per totale ore decrescente e titolo crescente.",
      "solution": "SELECT DISTINCT c.Codice, c.Titolo\nFROM Partecipante par\nJOIN Prenotazione pre ON par.Codice = pre.Partecipante\nJOIN Lezione l ON l.Data = pre.Data AND l.Ora = pre.Ora AND l.Struttura = pre.Struttura\nJOIN Corso c ON l.Corso = c.Codice\nWHERE pre.Modalita = 'APP' AND (par.Tipo = 'Adulto' OR par.Tipo IS NULL)\nORDER BY c.TotaleOre DESC, c.Titolo ASC;",
      "rubric": {
        "requiredClauses": ["select", "from", "join", "where", "order by"],
        "requiredRelations": ["partecipante", "prenotazione", "lezione", "corso"],
        "requiresDistinct": true,
        "requiredConcepts": [
          { "label": "Filtra prenotazioni APP", "patterns": ["modalita", "app"] },
          { "label": "Adulto o tipo sconosciuto", "patterns": ["adulto", "is null"] },
          { "label": "Ordina per ore desc e titolo asc", "patterns": ["totaleore", "desc", "titolo", "asc"] }
        ]
      }
    },
    {
      "id": "2025-12-17-sql-2",
      "section": "sql",
      "examDate": "2025-12-17",
      "databaseId": "nonsolosport-2025-12-17",
      "difficulty": "medium",
      "title": "SQL 2 - istruttori non dilettanti con lezioni oltre 50 adulti",
      "prompt": "Considerando gli istruttori non dilettanti, elencare il codice dell'istruttore e i titoli dei corsi che hanno almeno una lezione con piu' di 50 prenotati adulti. Non usare sottoquery.",
      "solution": "SELECT i.Codice, c.Titolo\nFROM Partecipante par\nJOIN Prenotazione pre ON par.Codice = pre.Partecipante\nJOIN Lezione l ON l.Data = pre.Data AND l.Ora = pre.Ora AND l.Struttura = pre.Struttura\nJOIN Corso c ON l.Corso = c.Codice\nJOIN Istruttore i ON l.Istruttore = i.Codice\nWHERE i.Qualifica <> 'DIL' AND par.Tipo = 'Adulto'\nGROUP BY i.Codice, c.Codice, c.Titolo, pre.Data, pre.Ora, pre.Struttura\nHAVING COUNT(*) > 50;",
      "rubric": {
        "requiredClauses": ["select", "from", "join", "where", "group by", "having"],
        "forbiddenClauses": ["subquery"],
        "requiredRelations": ["partecipante", "prenotazione", "lezione", "corso", "istruttore"],
        "requiredConcepts": [
          { "label": "Esclude dilettanti", "patterns": ["qualifica", "dil"] },
          { "label": "Filtra adulti", "patterns": ["tipo", "adulto"] },
          { "label": "Conta piu di 50 per lezione", "patterns": ["having", "count", "50"] }
        ]
      }
    },
    {
      "id": "2025-12-17-sql-3",
      "section": "sql",
      "examDate": "2025-12-17",
      "databaseId": "nonsolosport-2025-12-17",
      "difficulty": "hard",
      "title": "SQL 3 - corsi professionisti con APP maggiore di WEB in ogni lezione",
      "prompt": "Per ogni istruttore professionista, mostrare il numero di corsi in cui in ogni lezione il numero di partecipanti che hanno prenotato tramite app supera il numero di partecipanti che hanno prenotato tramite sito web.",
      "solution": "WITH NumPartecipantiApp AS (\n  SELECT Data, Ora, Struttura, COUNT(*) AS NumPartApp\n  FROM Prenotazione\n  WHERE Modalita = 'APP'\n  GROUP BY Data, Ora, Struttura\n), NumPartecipantiWeb AS (\n  SELECT Data, Ora, Struttura, COUNT(*) AS NumPartWeb\n  FROM Prenotazione\n  WHERE Modalita = 'WEB'\n  GROUP BY Data, Ora, Struttura\n)\nSELECT i.Codice, COUNT(DISTINCT l.Corso)\nFROM Istruttore i\nJOIN Lezione l ON i.Codice = l.Istruttore\nWHERE i.Qualifica = 'PROF'\n  AND NOT EXISTS (\n    SELECT * FROM Lezione l2\n    WHERE l2.Corso = l.Corso AND l2.Istruttore = i.Codice\n      AND COALESCE((SELECT NumPartApp FROM NumPartecipantiApp a WHERE a.Data = l2.Data AND a.Ora = l2.Ora AND a.Struttura = l2.Struttura), 0)\n       <= COALESCE((SELECT NumPartWeb FROM NumPartecipantiWeb w WHERE w.Data = l2.Data AND w.Ora = l2.Ora AND w.Struttura = l2.Struttura), 0)\n  )\nGROUP BY i.Codice;",
      "rubric": {
        "requiredClauses": ["select", "from", "join", "where", "group by"],
        "requiredRelations": ["istruttore", "lezione", "prenotazione"],
        "requiredConcepts": [
          { "label": "Filtra istruttori professionisti", "patterns": ["qualifica", "prof"] },
          { "label": "Confronta APP e WEB", "patterns": ["app", "web"] },
          { "label": "Richiede condizione per ogni lezione", "patterns": ["not exists"] },
          { "label": "Conta corsi distinti", "patterns": ["count", "distinct", "corso"] }
        ]
      }
    },
    {
      "id": "2026-01-23-sql-1",
      "section": "sql",
      "examDate": "2026-01-23",
      "databaseId": "fantasanremo-2026-01-23",
      "difficulty": "easy",
      "title": "SQL 1 - squadre PessiNet12 con capitani economici o anno ignoto",
      "prompt": "Elencare, tra le squadre che partecipano alla lega PessiNet12, i nomi in ordine alfabetico decrescente delle squadre che hanno come capitani cantanti valutati meno di 15 Baudi o che sono create da utenti che non hanno dichiarato l'anno di nascita. Visualizzare anche nickname ed email. Non usare sottoquery.",
      "solution": "SELECT s.NomeS, u.Nickname, u.Email\nFROM Squadra s\nJOIN ComposizioneSquadra cs ON s.NomeS = cs.NomeS AND s.Lega = cs.Lega\nJOIN Cantante c ON cs.NomeC = c.NomeC\nJOIN Utente u ON s.Email = u.Email\nWHERE s.Lega = 'PessiNet12'\n  AND cs.Capitano = TRUE\n  AND (u.AnnoNascita IS NULL OR c.Baudi < 15)\nORDER BY s.NomeS DESC;",
      "rubric": {
        "requiredClauses": ["select", "from", "join", "where", "order by"],
        "forbiddenClauses": ["subquery"],
        "requiredRelations": ["squadra", "composizionesquadra", "cantante", "utente"],
        "requiredConcepts": [
          { "label": "Filtra la lega PessiNet12", "patterns": ["pessinet12"] },
          { "label": "Considera solo capitani", "patterns": ["capitano"] },
          { "label": "Baudi sotto 15 o anno NULL", "patterns": ["baudi", "15", "annonascita", "is null"] },
          { "label": "Ordina squadre decrescente", "patterns": ["order by", "nomes", "desc"] }
        ]
      }
    },
    {
      "id": "2026-01-23-sql-2",
      "section": "sql",
      "examDate": "2026-01-23",
      "databaseId": "fantasanremo-2026-01-23",
      "difficulty": "medium",
      "title": "SQL 2 - squadre maggiorenni con valore o ampiezza elevati",
      "prompt": "Visualizzare le squadre create da utenti maggiorenni o di eta sconosciuta e che valgono in totale piu' di 100 Baudi o che sono composte da piu' di 7 cantanti. Si usi CURRENTYEAR(). Non usare sottoquery.",
      "solution": "SELECT s.NomeS, s.Lega\nFROM Squadra s\nJOIN ComposizioneSquadra cs ON s.NomeS = cs.NomeS AND s.Lega = cs.Lega\nJOIN Cantante c ON cs.NomeC = c.NomeC\nJOIN Utente u ON s.Email = u.Email\nWHERE u.AnnoNascita IS NULL OR CURRENTYEAR() - u.AnnoNascita >= 18\nGROUP BY s.NomeS, s.Lega\nHAVING COUNT(DISTINCT c.NomeC) > 7 OR SUM(c.Baudi) > 100;",
      "rubric": {
        "requiredClauses": ["select", "from", "join", "where", "group by", "having"],
        "forbiddenClauses": ["subquery"],
        "requiredRelations": ["squadra", "composizionesquadra", "cantante", "utente"],
        "requiredConcepts": [
          { "label": "Maggiorenni o eta sconosciuta", "patterns": ["currentyear", "annonascita", "18", "is null"] },
          { "label": "Somma baudi oltre 100", "patterns": ["sum", "baudi", "100"] },
          { "label": "Piu di 7 cantanti distinti", "patterns": ["count", "distinct", "nomec", "7"] }
        ]
      }
    },
    {
      "id": "2026-01-23-sql-3",
      "section": "sql",
      "examDate": "2026-01-23",
      "databaseId": "fantasanremo-2026-01-23",
      "difficulty": "hard",
      "title": "SQL 3 - squadre vincitrici di ogni lega",
      "prompt": "Visualizzare le squadre vincitrici di ogni lega. Risultano vincitrici le squadre per cui e' massima la somma dei punti conquistati dai cantanti nelle serate del Festival. I punti dei capitani valgono doppio.",
      "solution": "WITH PuntiSquadra AS (\n  SELECT cs.NomeS, cs.Lega,\n         SUM(CASE WHEN cs.Capitano = TRUE THEN p.Punti * 2 ELSE p.Punti END) AS PuntiTot\n  FROM ComposizioneSquadra cs\n  JOIN Punteggio p ON cs.NomeC = p.NomeC\n  GROUP BY cs.NomeS, cs.Lega\n)\nSELECT p.NomeS, p.Lega\nFROM PuntiSquadra p\nWHERE p.PuntiTot = (\n  SELECT MAX(p2.PuntiTot)\n  FROM PuntiSquadra p2\n  WHERE p2.Lega = p.Lega\n);",
      "rubric": {
        "requiredClauses": ["select", "from", "join", "group by", "where"],
        "requiredRelations": ["composizionesquadra", "punteggio"],
        "requiredConcepts": [
          { "label": "Somma punti per squadra", "patterns": ["sum", "punti"] },
          { "label": "Raddoppia punti capitano", "patterns": ["capitano", "2"] },
          { "label": "Trova massimo per lega", "patterns": ["max", "lega"] }
        ]
      }
    },
    {
      "id": "2026-01-23-theory-1",
      "section": "theory",
      "examDate": "2026-01-23",
      "databaseId": "fantasanremo-2026-01-23",
      "difficulty": "easy",
      "title": "Teoria 1 - algebra relazionale e calcolo relazionale",
      "prompt": "A. Esprimere in algebra relazionale l'interrogazione: elencare le email degli utenti con anno di nascita noto che hanno creato una sola squadra. B. Esprimere in calcolo relazionale l'interrogazione: elencare nome e titolo dei cantanti che hanno ottenuto solo punteggi minori di 5 nelle serate in cui hanno partecipato.",
      "solution": "A: proiettare le email degli utenti con AnnoNascita non NULL che compaiono in Squadra e sottrarre gli utenti che compaiono in due squadre diverse. B: usare una formula con quantificazione universale sui punteggi del cantante: per ogni punteggio associato al cantante, Punti < 5.",
      "rubric": {
        "expectedSymbols": ["π", "−", "∀"],
        "expectedKeywords": ["annonascita", "email"],
        "expectedConcepts": [
          { "label": "Esclude utenti con anno nascita NULL", "patterns": ["annonascita"] },
          { "label": "Riconosce una sola squadra tramite differenza o non esistenza di seconda squadra", "patterns": ["squadra"] },
          { "label": "Usa universale per tutti i punteggi", "patterns": ["punti", "5"] }
        ]
      }
    },
    {
      "id": "2025-09-10-theory-2",
      "section": "theory",
      "examDate": "2025-09-10",
      "databaseId": "sagrabugliano-2025-09-10",
      "difficulty": "medium",
      "title": "Teoria 2 - equivalenza di dipendenze funzionali",
      "prompt": "Dimostrare che F1 = {A -> CE, C -> AB, AE -> F} e F2 = {AB -> CE, A -> B, C -> B, C -> AF} sono equivalenti usando le coperture minimali.",
      "solution": "Calcolare una copertura minimale per entrambi gli insiemi, spezzando i conseguenti e rimuovendo attributi o dipendenze ridondanti. Le coperture ottenute coincidono o generano le stesse chiusure, quindi F1 e F2 sono equivalenti.",
      "rubric": {
        "expectedSymbols": ["→"],
        "expectedKeywords": ["copertura minimale", "equivalenti"],
        "expectedConcepts": [
          { "label": "Spezza i conseguenti", "patterns": ["conseguenti"] },
          { "label": "Controlla ridondanza", "patterns": ["ridond"] },
          { "label": "Conclude equivalenza", "patterns": ["equivalent"] }
        ]
      }
    },
    {
      "id": "2025-07-09-theory-3",
      "section": "theory",
      "examDate": "2025-07-09",
      "databaseId": "deebeecity-2025-07-09",
      "difficulty": "hard",
      "title": "Teoria 3 - storia e protocollo 2PL",
      "prompt": "Considerare la storia S = r1(x), r2(x), r3(x), w2(y), w3(x), w1(z), r3(z), w3(z). Dire se S e' compatibile con il protocollo 2PL e giustificare la risposta.",
      "solution": "La storia e' compatibile con 2PL se si puo' aggiungere una sequenza di lock e unlock in cui ogni transazione acquisisce tutti i lock prima di rilasciarne uno e non acquisisce nuovi lock dopo il primo unlock. Una possibile schedulazione con lock condivisi/esclusivi dimostra la compatibilita.",
      "rubric": {
        "expectedSymbols": [],
        "expectedKeywords": ["2pl", "lock", "unlock"],
        "expectedConcepts": [
          { "label": "Distingue fase crescente e calante", "patterns": ["fase"] },
          { "label": "Spiega che non si acquisiscono lock dopo unlock", "patterns": ["unlock", "lock"] },
          { "label": "Conclude compatibilita della storia", "patterns": ["compatib"] }
        ]
      }
    }
  ]
}
```

- [ ] **Step 2: Validate JSON parses**

Run: `node -e "JSON.parse(require('node:fs').readFileSync('exercises.json','utf8')); console.log('json ok')"`

Expected: `json ok`

## Task 4: Static HTML Shell

**Files:**
- Create: `index.html`

- [ ] **Step 1: Create semantic app shell**

Create `index.html`:

```html
<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>DB Exam Trainer</title>
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">DB</span>
          <div>
            <h1>DB Exam Trainer</h1>
            <p id="sessionMeta">Allenamento locale</p>
          </div>
        </div>

        <nav class="segmented" aria-label="Sezione esercizi">
          <button class="segment is-active" type="button" data-section="sql">SQL</button>
          <button class="segment" type="button" data-section="theory">Teoria</button>
        </nav>

        <div class="topbar-controls">
          <label>
            <span>Difficolta</span>
            <select id="difficultySelect">
              <option value="all">Tutte</option>
              <option value="easy">Facile</option>
              <option value="medium">Medio</option>
              <option value="hard">Difficile</option>
            </select>
          </label>
          <label>
            <span>Appello</span>
            <select id="examSelect"></select>
          </label>
        </div>
      </header>

      <main class="workspace">
        <aside class="exercise-rail" aria-label="Esercizi">
          <div class="progress-panel">
            <div class="progress-row">
              <span>Totale</span>
              <strong id="overallProgress">0%</strong>
            </div>
            <div class="progress-track"><span id="overallProgressBar"></span></div>
            <div class="mini-stats" id="miniStats"></div>
          </div>
          <div id="exerciseList" class="exercise-list"></div>
        </aside>

        <section class="exercise-pane" aria-live="polite">
          <div class="exercise-heading">
            <div>
              <p id="exerciseKicker" class="kicker"></p>
              <h2 id="exerciseTitle">Caricamento...</h2>
            </div>
            <div class="exercise-actions">
              <button id="prevExercise" class="icon-button" type="button" title="Esercizio precedente">←</button>
              <button id="nextExercise" class="icon-button" type="button" title="Esercizio successivo">→</button>
            </div>
          </div>

          <div class="prompt-block">
            <h3>Consegna</h3>
            <p id="exercisePrompt"></p>
          </div>

          <div id="sqlEditorBlock" class="answer-block">
            <div class="editor-label">
              <h3>La tua risposta SQL</h3>
              <span>syntax highlighting locale</span>
            </div>
            <div class="sql-editor" id="sqlEditor">
              <pre aria-hidden="true"><code id="sqlHighlight"></code></pre>
              <textarea id="sqlAnswer" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea>
            </div>
          </div>

          <div id="theoryEditorBlock" class="answer-block is-hidden">
            <div class="editor-label">
              <h3>La tua risposta teoria</h3>
              <span>simboli e preview</span>
            </div>
            <div class="symbol-keyboard" id="symbolKeyboard" aria-label="Tastiera simboli"></div>
            <textarea id="theoryAnswer" class="theory-textarea" spellcheck="false"></textarea>
            <div class="preview-block">
              <h3>Preview</h3>
              <div id="theoryPreview" class="theory-preview"></div>
            </div>
          </div>

          <div class="button-row">
            <button id="checkAnswer" class="primary-button" type="button">Verifica</button>
            <button id="toggleSolution" class="secondary-button" type="button">Mostra soluzione</button>
            <button id="copyContext" class="secondary-button" type="button">Copia contesto</button>
            <button id="resetAnswer" class="ghost-button" type="button">Reset</button>
          </div>

          <section id="feedbackPanel" class="feedback-panel" aria-live="polite"></section>
          <section id="solutionPanel" class="solution-panel is-hidden"></section>
        </section>

        <aside class="schema-panel" id="schemaPanel">
          <div class="schema-header">
            <div>
              <p class="kicker">Schema fisso</p>
              <h2 id="databaseName">Database</h2>
            </div>
            <button id="schemaToggle" class="icon-button mobile-only" type="button" title="Mostra o nascondi schema">⇄</button>
          </div>
          <p id="databaseDescription" class="schema-description"></p>
          <div id="schemaRelations" class="schema-relations"></div>
          <div id="schemaConstraints" class="schema-section"></div>
          <div id="schemaNotes" class="schema-section"></div>
        </aside>
      </main>

      <div id="toast" class="toast" role="status" aria-live="polite"></div>
    </div>

    <script type="module" src="./app.js"></script>
  </body>
</html>
```

## Task 5: Styling And Responsive Product UI

**Files:**
- Create: `styles.css`

- [ ] **Step 1: Create complete dark-mode styling**

Create `styles.css` with the OKLCH palette, layout, responsive rules, highlighting classes, keyboard controls, panels, and motion states:

```css
:root {
  color-scheme: dark;
  --bg: oklch(0.095 0 0);
  --surface: oklch(0.145 0.01 280);
  --surface-2: oklch(0.19 0.018 280);
  --surface-3: oklch(0.245 0.025 280);
  --ink: oklch(0.94 0.01 280);
  --muted: oklch(0.72 0.035 260);
  --muted-2: oklch(0.60 0.035 260);
  --primary: oklch(0.58 0.16 280);
  --primary-strong: oklch(0.66 0.18 280);
  --accent: oklch(0.72 0.13 205);
  --success: oklch(0.72 0.14 155);
  --warning: oklch(0.76 0.15 78);
  --danger: oklch(0.66 0.18 28);
  --line: oklch(0.32 0.025 280);
  --focus: oklch(0.78 0.16 205);
  --shadow: 0 8px 24px oklch(0 0 0 / 0.28);
  --radius: 12px;
  --radius-sm: 8px;
  --mono: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  --sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 15px;
  line-height: 1.5;
}

button,
select,
textarea {
  font: inherit;
}

button,
select {
  color: var(--ink);
}

button {
  cursor: pointer;
}

button:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.app-shell {
  min-height: 100vh;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 18px;
  min-height: 76px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--line);
  background: oklch(0.105 0 0 / 0.96);
  backdrop-filter: blur(14px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 236px;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: var(--primary);
  color: white;
  font-weight: 800;
  letter-spacing: 0;
}

h1,
h2,
h3,
p {
  margin: 0;
}

h1 {
  font-size: 1rem;
  line-height: 1.15;
}

h2 {
  font-size: 1.2rem;
  text-wrap: balance;
}

h3 {
  font-size: 0.88rem;
  color: var(--ink);
}

.brand p,
.editor-label span,
.kicker,
.schema-description,
.topbar-controls span {
  color: var(--muted);
}

.segmented {
  display: inline-flex;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
}

.segment {
  min-width: 76px;
  border: 0;
  border-radius: 999px;
  padding: 8px 12px;
  background: transparent;
  color: var(--muted);
  transition: background 180ms ease, color 180ms ease;
}

.segment.is-active {
  background: var(--primary);
  color: white;
}

.topbar-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.topbar-controls label {
  display: grid;
  gap: 3px;
  font-size: 0.78rem;
}

select {
  min-width: 128px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 7px 28px 7px 10px;
  background: var(--surface-2);
}

.workspace {
  display: grid;
  grid-template-columns: minmax(210px, 250px) minmax(420px, 1fr) minmax(300px, 360px);
  gap: 16px;
  align-items: start;
  padding: 16px;
}

.exercise-rail,
.exercise-pane,
.schema-panel {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.exercise-rail,
.schema-panel {
  position: sticky;
  top: 92px;
  max-height: calc(100vh - 108px);
  overflow: auto;
}

.exercise-rail {
  padding: 12px;
}

.progress-panel {
  padding: 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.progress-row,
.mini-stats {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.mini-stats {
  margin-top: 10px;
  color: var(--muted);
  font-size: 0.8rem;
}

.progress-track {
  height: 8px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-3);
}

.progress-track span {
  display: block;
  width: 0%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--primary), var(--accent));
  transition: width 220ms ease-out;
}

.exercise-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.exercise-item {
  width: 100%;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: 10px;
  background: transparent;
  color: var(--muted);
  text-align: left;
  transition: border-color 160ms ease, background 160ms ease, color 160ms ease;
}

.exercise-item:hover,
.exercise-item.is-active {
  border-color: var(--line);
  background: var(--surface-2);
  color: var(--ink);
}

.exercise-item strong {
  display: block;
  margin-bottom: 3px;
  color: inherit;
  font-size: 0.86rem;
  line-height: 1.25;
}

.exercise-item span {
  font-size: 0.76rem;
}

.status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 999px;
  background: var(--muted-2);
}

.status-dot.is-solved {
  background: var(--success);
}

.status-dot.is-checked {
  background: var(--warning);
}

.exercise-pane {
  min-width: 0;
  padding: 18px;
}

.exercise-heading,
.schema-header,
.editor-label {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.kicker {
  margin-bottom: 4px;
  font-size: 0.78rem;
}

.exercise-actions,
.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.icon-button,
.primary-button,
.secondary-button,
.ghost-button {
  border-radius: var(--radius-sm);
  min-height: 38px;
  border: 1px solid var(--line);
  transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
}

.icon-button {
  width: 38px;
  background: var(--surface-2);
}

.primary-button,
.secondary-button,
.ghost-button {
  padding: 0 14px;
}

.primary-button {
  border-color: transparent;
  background: var(--primary);
  color: white;
  font-weight: 700;
}

.secondary-button {
  background: var(--surface-2);
}

.ghost-button {
  background: transparent;
  color: var(--muted);
}

button:hover {
  transform: translateY(-1px);
}

.prompt-block,
.answer-block,
.feedback-panel,
.solution-panel {
  margin-top: 16px;
}

.prompt-block {
  padding: 14px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.prompt-block p {
  max-width: 75ch;
  margin-top: 8px;
  color: var(--ink);
  text-wrap: pretty;
}

.sql-editor {
  position: relative;
  min-height: 250px;
  margin-top: 8px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: oklch(0.115 0.01 280);
}

.sql-editor pre,
.sql-editor textarea {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 14px;
  border: 0;
  font-family: var(--mono);
  font-size: 0.9rem;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow: auto;
}

.sql-editor pre {
  pointer-events: none;
}

.sql-editor textarea {
  resize: none;
  background: transparent;
  color: transparent;
  caret-color: var(--ink);
}

.sql-editor textarea::selection {
  background: oklch(0.42 0.10 280 / 0.42);
}

.tok-keyword {
  color: var(--primary-strong);
  font-weight: 700;
}

.tok-function {
  color: var(--accent);
}

.tok-string {
  color: oklch(0.78 0.13 142);
}

.tok-number {
  color: var(--warning);
}

.tok-comment {
  color: var(--muted-2);
}

.tok-operator {
  color: oklch(0.82 0.10 25);
}

.symbol-keyboard {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.symbol-key {
  min-width: 38px;
  min-height: 34px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  font-family: var(--mono);
}

.symbol-key.template {
  min-width: auto;
  padding: 0 10px;
}

.theory-textarea {
  width: 100%;
  min-height: 190px;
  margin-top: 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 14px;
  resize: vertical;
  background: oklch(0.115 0.01 280);
  color: var(--ink);
  font-family: var(--mono);
  line-height: 1.55;
}

.preview-block {
  margin-top: 10px;
  padding: 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.theory-preview {
  margin-top: 6px;
  min-height: 46px;
  color: var(--ink);
  font-family: var(--mono);
  white-space: pre-wrap;
}

.button-row {
  margin-top: 14px;
}

.feedback-panel {
  display: grid;
  gap: 8px;
}

.feedback-summary,
.feedback-item,
.solution-panel {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 12px;
  background: var(--surface-2);
}

.feedback-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.feedback-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.feedback-item[data-status="present"] strong {
  color: var(--success);
}

.feedback-item[data-status="missing"] strong {
  color: var(--warning);
}

.feedback-item[data-status="violation"] strong {
  color: var(--danger);
}

.solution-panel pre {
  margin: 10px 0 0;
  white-space: pre-wrap;
  color: var(--ink);
  font-family: var(--mono);
}

.schema-panel {
  padding: 14px;
}

.schema-description {
  margin-top: 8px;
}

.schema-relations {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.relation {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 10px;
  background: var(--surface-2);
}

.relation strong {
  display: block;
  margin-bottom: 4px;
  color: var(--accent);
  font-family: var(--mono);
}

.relation code,
.schema-section {
  font-family: var(--mono);
  font-size: 0.82rem;
  color: var(--muted);
}

.schema-section {
  margin-top: 14px;
  white-space: pre-wrap;
}

.toast {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 40;
  min-width: 220px;
  max-width: 340px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  color: var(--ink);
  box-shadow: var(--shadow);
  opacity: 0;
  transform: translateY(10px);
  pointer-events: none;
  transition: opacity 180ms ease, transform 180ms ease;
}

.toast.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.is-hidden {
  display: none !important;
}

.mobile-only {
  display: none;
}

@media (max-width: 1120px) {
  .workspace {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .schema-panel {
    position: fixed;
    top: 88px;
    right: 12px;
    bottom: 12px;
    z-index: 30;
    width: min(360px, calc(100vw - 24px));
    transform: translateX(calc(100% + 16px));
    transition: transform 200ms ease-out;
  }

  .schema-panel.is-open {
    transform: translateX(0);
  }

  .mobile-only {
    display: inline-grid;
  }
}

@media (max-width: 760px) {
  .topbar {
    position: static;
    align-items: stretch;
    flex-direction: column;
  }

  .brand {
    min-width: 0;
  }

  .topbar-controls {
    margin-left: 0;
    align-items: stretch;
  }

  .topbar-controls label,
  .topbar-controls select {
    width: 100%;
  }

  .workspace {
    grid-template-columns: 1fr;
    padding: 10px;
  }

  .exercise-rail {
    position: static;
    max-height: none;
  }

  .exercise-list {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .exercise-heading {
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

## Task 6: Browser App Wiring

**Files:**
- Create: `app.js`
- Modify: `logic.js`

- [ ] **Step 1: Add highlighting and helper exports to `logic.js`**

Add exports:

```js
const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
const SQL_KEYWORDS = new Set([
  'select', 'distinct', 'from', 'join', 'left', 'right', 'inner', 'outer', 'on', 'where',
  'and', 'or', 'not', 'is', 'null', 'group', 'by', 'having', 'order', 'asc', 'desc',
  'with', 'as', 'case', 'when', 'then', 'else', 'end', 'exists', 'in', 'true', 'false'
]);

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPE[char]);
}

export function highlightSql(sql = '') {
  const escaped = escapeHtml(sql);
  return escaped
    .replace(/(--.*$)/gm, '<span class="tok-comment">$1</span>')
    .replace(/('[^']*')/g, '<span class="tok-string">$1</span>')
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>')
    .replace(/\b(count|sum|avg|min|max|coalesce|currentyear|abs)\s*(?=\()/gi, '<span class="tok-function">$1</span>')
    .replace(/\b([a-z_][a-z0-9_]*)\b/gi, (match) => {
      return SQL_KEYWORDS.has(match.toLowerCase()) ? `<span class="tok-keyword">${match}</span>` : match;
    })
    .replace(/(&lt;=|&gt;=|&lt;&gt;|=|&lt;|&gt;|\+|\-|\*)/g, '<span class="tok-operator">$1</span>');
}

export function difficultyLabel(difficulty) {
  return { easy: 'Facile', medium: 'Medio', hard: 'Difficile' }[difficulty] || difficulty;
}
```

- [ ] **Step 2: Create `app.js` with full UI behavior**

Create `app.js`:

```js
import {
  buildCopyContext,
  difficultyLabel,
  evaluateSqlAnswer,
  evaluateTheoryAnswer,
  highlightSql,
  renderTheoryPreview,
  summarizeProgress
} from './logic.js';

const STORAGE_KEY = 'db-exam-trainer-state-v1';
const SYMBOLS = [
  ['π', 'π'], ['σ', 'σ'], ['ρ', 'ρ'], ['⋈', '⋈'], ['÷', '÷'], ['−', '−'], ['∪', '∪'], ['∩', '∩'],
  ['∀', '∀'], ['∃', '∃'], ['¬', '¬'], ['∧', '∧'], ['∨', '∨'], ['⇒', '⇒'], ['→', '→'],
  ['≠', '≠'], ['≤', '≤'], ['≥', '≥'], ['∈', '∈'], ['∉', '∉'], ['⊆', '⊆'],
  ['π_{...}(...)', 'π_{...}(...)', true],
  ['σ_{...}(...)', 'σ_{...}(...)', true],
  ['ρ_{a<-b}(...)', 'ρ_{a<-b}(...)', true],
  ['{ x | ... }', '{ x | ... }', true],
  ['X → Y', 'X → Y', true]
];

const els = {
  sessionMeta: document.querySelector('#sessionMeta'),
  sectionButtons: [...document.querySelectorAll('[data-section]')],
  difficultySelect: document.querySelector('#difficultySelect'),
  examSelect: document.querySelector('#examSelect'),
  overallProgress: document.querySelector('#overallProgress'),
  overallProgressBar: document.querySelector('#overallProgressBar'),
  miniStats: document.querySelector('#miniStats'),
  exerciseList: document.querySelector('#exerciseList'),
  exerciseKicker: document.querySelector('#exerciseKicker'),
  exerciseTitle: document.querySelector('#exerciseTitle'),
  exercisePrompt: document.querySelector('#exercisePrompt'),
  prevExercise: document.querySelector('#prevExercise'),
  nextExercise: document.querySelector('#nextExercise'),
  sqlEditorBlock: document.querySelector('#sqlEditorBlock'),
  sqlHighlight: document.querySelector('#sqlHighlight'),
  sqlAnswer: document.querySelector('#sqlAnswer'),
  theoryEditorBlock: document.querySelector('#theoryEditorBlock'),
  symbolKeyboard: document.querySelector('#symbolKeyboard'),
  theoryAnswer: document.querySelector('#theoryAnswer'),
  theoryPreview: document.querySelector('#theoryPreview'),
  checkAnswer: document.querySelector('#checkAnswer'),
  toggleSolution: document.querySelector('#toggleSolution'),
  copyContext: document.querySelector('#copyContext'),
  resetAnswer: document.querySelector('#resetAnswer'),
  feedbackPanel: document.querySelector('#feedbackPanel'),
  solutionPanel: document.querySelector('#solutionPanel'),
  databaseName: document.querySelector('#databaseName'),
  databaseDescription: document.querySelector('#databaseDescription'),
  schemaRelations: document.querySelector('#schemaRelations'),
  schemaConstraints: document.querySelector('#schemaConstraints'),
  schemaNotes: document.querySelector('#schemaNotes'),
  schemaPanel: document.querySelector('#schemaPanel'),
  schemaToggle: document.querySelector('#schemaToggle'),
  toast: document.querySelector('#toast')
};

const state = {
  data: null,
  section: 'sql',
  difficulty: 'all',
  examDate: 'all',
  currentId: null,
  solutionVisible: false,
  latestFeedback: [],
  progress: {},
  drafts: {}
};

function loadLocalState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    state.section = saved.section || state.section;
    state.difficulty = saved.difficulty || state.difficulty;
    state.examDate = saved.examDate || state.examDate;
    state.currentId = saved.currentId || state.currentId;
    state.progress = saved.progress || {};
    state.drafts = saved.drafts || {};
  } catch {
    showToast('Progressi locali non leggibili, riparto pulito.');
  }
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    section: state.section,
    difficulty: state.difficulty,
    examDate: state.examDate,
    currentId: state.currentId,
    progress: state.progress,
    drafts: state.drafts
  }));
}

async function boot() {
  loadLocalState();
  renderKeyboard();

  try {
    const response = await fetch('./exercises.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
  } catch (error) {
    els.exerciseTitle.textContent = 'Dataset non caricato';
    els.exercisePrompt.textContent = 'Avvia un server locale nella cartella del progetto. Per esempio: python3 -m http.server 5173';
    showToast(`Errore caricamento JSON: ${error.message}`);
    return;
  }

  populateExamSelect();
  bindEvents();
  ensureCurrentExercise();
  render();
}

function populateExamSelect() {
  const dates = [...new Set(state.data.exercises.map((exercise) => exercise.examDate))].sort();
  els.examSelect.innerHTML = `<option value="all">Tutti</option>${dates.map((date) => `<option value="${date}">${date}</option>`).join('')}`;
  els.examSelect.value = dates.includes(state.examDate) ? state.examDate : 'all';
}

function bindEvents() {
  els.sectionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.section = button.dataset.section;
      state.solutionVisible = false;
      ensureCurrentExercise(true);
      saveLocalState();
      render();
    });
  });

  els.difficultySelect.addEventListener('change', () => {
    state.difficulty = els.difficultySelect.value;
    ensureCurrentExercise(true);
    saveLocalState();
    render();
  });

  els.examSelect.addEventListener('change', () => {
    state.examDate = els.examSelect.value;
    ensureCurrentExercise(true);
    saveLocalState();
    render();
  });

  els.sqlAnswer.addEventListener('input', () => {
    saveDraft(els.sqlAnswer.value);
    syncSqlHighlight();
  });

  els.sqlAnswer.addEventListener('scroll', () => {
    const pre = els.sqlHighlight.parentElement;
    pre.scrollTop = els.sqlAnswer.scrollTop;
    pre.scrollLeft = els.sqlAnswer.scrollLeft;
  });

  els.theoryAnswer.addEventListener('input', () => {
    saveDraft(els.theoryAnswer.value);
    syncTheoryPreview();
  });

  els.checkAnswer.addEventListener('click', checkCurrentAnswer);
  els.toggleSolution.addEventListener('click', toggleSolution);
  els.copyContext.addEventListener('click', copyCurrentContext);
  els.resetAnswer.addEventListener('click', resetCurrentAnswer);
  els.prevExercise.addEventListener('click', () => moveExercise(-1));
  els.nextExercise.addEventListener('click', () => moveExercise(1));
  els.schemaToggle.addEventListener('click', () => els.schemaPanel.classList.toggle('is-open'));
}

function filteredExercises() {
  return state.data.exercises.filter((exercise) => {
    return exercise.section === state.section
      && (state.difficulty === 'all' || exercise.difficulty === state.difficulty)
      && (state.examDate === 'all' || exercise.examDate === state.examDate);
  });
}

function ensureCurrentExercise(force = false) {
  const list = filteredExercises();
  if (!list.length) {
    state.currentId = null;
    return;
  }
  if (force || !list.some((exercise) => exercise.id === state.currentId)) {
    state.currentId = list[0].id;
  }
}

function currentExercise() {
  return state.data.exercises.find((exercise) => exercise.id === state.currentId) || null;
}

function currentDatabase() {
  const exercise = currentExercise();
  return state.data.databases.find((database) => database.id === exercise?.databaseId) || null;
}

function render() {
  els.sectionButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.section === state.section);
  });
  els.difficultySelect.value = state.difficulty;
  els.examSelect.value = state.examDate;

  renderProgress();
  renderExerciseList();
  renderCurrentExercise();
}

function renderProgress() {
  const summary = summarizeProgress(state.data.exercises, state.progress);
  els.overallProgress.textContent = `${summary.percent}%`;
  els.overallProgressBar.style.width = `${summary.percent}%`;
  els.miniStats.innerHTML = `<span>${summary.solved}/${summary.total} risolti</span><span>${summary.checked} verificati</span>`;
  els.sessionMeta.textContent = `${summary.checked} verifiche locali`;
}

function renderExerciseList() {
  const list = filteredExercises();
  if (!list.length) {
    els.exerciseList.innerHTML = '<p class="empty-state">Nessun esercizio con questi filtri.</p>';
    return;
  }

  els.exerciseList.innerHTML = list.map((exercise) => {
    const progress = state.progress[exercise.id] || {};
    const dotClass = progress.solved ? 'is-solved' : progress.checked ? 'is-checked' : '';
    return `<button class="exercise-item ${exercise.id === state.currentId ? 'is-active' : ''}" type="button" data-id="${exercise.id}">
      <strong><span class="status-dot ${dotClass}"></span>${exercise.title}</strong>
      <span>${exercise.examDate} · ${difficultyLabel(exercise.difficulty)}</span>
    </button>`;
  }).join('');

  els.exerciseList.querySelectorAll('[data-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.currentId = button.dataset.id;
      state.solutionVisible = false;
      state.latestFeedback = [];
      saveLocalState();
      render();
    });
  });
}

function renderCurrentExercise() {
  const exercise = currentExercise();
  const database = currentDatabase();
  if (!exercise || !database) {
    els.exerciseTitle.textContent = 'Nessun esercizio';
    els.exercisePrompt.textContent = 'Cambia filtri per tornare a un esercizio disponibile.';
    return;
  }

  els.exerciseKicker.textContent = `${exercise.examDate} · ${difficultyLabel(exercise.difficulty)} · ${exercise.section.toUpperCase()}`;
  els.exerciseTitle.textContent = exercise.title;
  els.exercisePrompt.textContent = exercise.prompt;
  els.sqlEditorBlock.classList.toggle('is-hidden', exercise.section !== 'sql');
  els.theoryEditorBlock.classList.toggle('is-hidden', exercise.section !== 'theory');

  const draft = state.drafts[exercise.id] || '';
  if (exercise.section === 'sql') {
    els.sqlAnswer.value = draft;
    syncSqlHighlight();
  } else {
    els.theoryAnswer.value = draft;
    syncTheoryPreview();
  }

  renderFeedback(state.latestFeedback, null);
  renderSolution();
  renderSchema(database);
}

function renderSchema(database) {
  els.databaseName.textContent = database.name;
  els.databaseDescription.textContent = database.description;
  els.schemaRelations.innerHTML = database.relations.map((relation) => {
    const pk = relation.primaryKey?.length ? `PK: ${relation.primaryKey.join(', ')}` : '';
    return `<div class="relation"><strong>${relation.name}</strong><code>${relation.columns.join(', ')}</code><br><code>${pk}</code></div>`;
  }).join('');
  els.schemaConstraints.innerHTML = `<h3>Vincoli</h3>${database.constraints.join('\n')}`;
  els.schemaNotes.innerHTML = `<h3>Note</h3>${database.notes.join('\n')}`;
}

function syncSqlHighlight() {
  els.sqlHighlight.innerHTML = `${highlightSql(els.sqlAnswer.value)}\n`;
}

function syncTheoryPreview() {
  els.theoryPreview.textContent = renderTheoryPreview(els.theoryAnswer.value);
}

function renderKeyboard() {
  els.symbolKeyboard.innerHTML = SYMBOLS.map(([label, value, template]) => {
    return `<button class="symbol-key ${template ? 'template' : ''}" type="button" data-value="${value}">${label}</button>`;
  }).join('');

  els.symbolKeyboard.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => insertAtCursor(els.theoryAnswer, button.dataset.value));
  });
}

function insertAtCursor(textarea, value) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.value = `${textarea.value.slice(0, start)}${value}${textarea.value.slice(end)}`;
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + value.length;
  textarea.dispatchEvent(new Event('input'));
}

function currentAnswer() {
  const exercise = currentExercise();
  return exercise?.section === 'sql' ? els.sqlAnswer.value : els.theoryAnswer.value;
}

function saveDraft(value) {
  const exercise = currentExercise();
  if (!exercise) return;
  state.drafts[exercise.id] = value;
  saveLocalState();
}

function checkCurrentAnswer() {
  const exercise = currentExercise();
  if (!exercise) return;

  const result = exercise.section === 'sql'
    ? evaluateSqlAnswer(currentAnswer(), exercise.rubric)
    : evaluateTheoryAnswer(currentAnswer(), exercise.rubric);

  state.latestFeedback = result.items;
  state.progress[exercise.id] = {
    checked: true,
    solved: result.score >= 80,
    score: result.score,
    updatedAt: new Date().toISOString()
  };
  saveLocalState();
  renderProgress();
  renderExerciseList();
  renderFeedback(result.items, result.score);
  showToast(result.score >= 80 ? 'Ottimo: risposta solida.' : 'Feedback pronto: controlla i punti mancanti.');
}

function renderFeedback(items = [], score = null) {
  if (!items.length) {
    els.feedbackPanel.innerHTML = '';
    return;
  }

  const summary = score === null ? '' : `<div class="feedback-summary"><span>Valutazione euristica</span><strong>${score}%</strong></div>`;
  els.feedbackPanel.innerHTML = `${summary}${items.map((entry) => {
    const label = entry.status === 'present' ? 'Presente' : entry.status === 'violation' ? 'Vincolo violato' : 'Manca';
    return `<div class="feedback-item" data-status="${entry.status}">
      <span>${entry.label}${entry.detail ? `<br><small>${entry.detail}</small>` : ''}</span>
      <strong>${label}</strong>
    </div>`;
  }).join('')}`;
}

function toggleSolution() {
  state.solutionVisible = !state.solutionVisible;
  renderSolution();
}

function renderSolution() {
  const exercise = currentExercise();
  if (!exercise || !state.solutionVisible) {
    els.solutionPanel.classList.add('is-hidden');
    els.toggleSolution.textContent = 'Mostra soluzione';
    return;
  }

  els.solutionPanel.classList.remove('is-hidden');
  els.toggleSolution.textContent = 'Nascondi soluzione';
  els.solutionPanel.innerHTML = `<h3>Soluzione ufficiale</h3><pre>${exercise.solution}</pre>`;
}

async function copyCurrentContext() {
  const exercise = currentExercise();
  const database = currentDatabase();
  if (!exercise || !database) return;

  const context = buildCopyContext({
    exercise,
    database,
    answer: currentAnswer(),
    feedback: state.latestFeedback,
    includeSolution: true
  });

  try {
    await navigator.clipboard.writeText(context);
    showToast('Contesto copiato.');
  } catch {
    window.prompt('Copia manualmente il contesto:', context);
  }
}

function resetCurrentAnswer() {
  const exercise = currentExercise();
  if (!exercise) return;
  state.drafts[exercise.id] = '';
  state.latestFeedback = [];
  saveLocalState();
  renderCurrentExercise();
  showToast('Risposta svuotata.');
}

function moveExercise(delta) {
  const list = filteredExercises();
  const index = list.findIndex((exercise) => exercise.id === state.currentId);
  const next = list[index + delta];
  if (!next) return;
  state.currentId = next.id;
  state.latestFeedback = [];
  state.solutionVisible = false;
  saveLocalState();
  render();
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove('is-visible'), 2200);
}

boot();
```

## Task 7: Verification And Browser Run

**Files:**
- No new files expected.

- [ ] **Step 1: Run automated tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('node:fs').readFileSync('exercises.json','utf8')); console.log('json ok')"`

Expected: `json ok`.

- [ ] **Step 3: Start local server**

Run: `python3 -m http.server 5173`

Expected: server listens at `http://localhost:5173/`.

- [ ] **Step 4: Open and inspect in browser**

Use the in-app browser at `http://localhost:5173/`.

Expected:

- SQL and Teoria tabs switch correctly.
- Difficulty and exam filters update the exercise list.
- Schema stays visible on desktop.
- SQL highlighting appears while typing.
- Theory keyboard inserts symbols at cursor.
- Theory preview converts shortcuts.
- Verifica shows rubric feedback.
- Progress persists after reload.
- Copia contesto copies a complete block.
- No visible overlap at desktop and narrow widths.

- [ ] **Step 5: Stop only unnecessary foreground sessions**

If the server is running in a managed session needed by the user, leave it running and report the URL. If a verification-only temporary server is no longer needed, stop it cleanly with Ctrl-C in that session.
