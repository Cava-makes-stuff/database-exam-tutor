import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeSql,
  extractSqlFeatures,
  evaluateSqlAnswer,
  renderTheoryPreview,
  evaluateTheoryAnswer,
  buildCopyContext,
  summarizeProgress,
  highlightSql,
  difficultyLabel,
  renderTheoryPreviewHtml,
  renderRelationSchemaHtml
} from '../logic.js';

test('normalizes SQL by lowercasing keywords, removing extra whitespace, and trimming semicolons', () => {
  const normalized = normalizeSql(' SELECT  DISTINCT Nome  FROM Utente ; ');
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

test('renders theory shortcuts into readable mathematical symbols', () => {
  const preview = renderTheoryPreview(String.raw`\pi_{Nome}(\sigma_{Tipo='Adulto'}(Partecipante)) \and \forall x \exists y x \to y`);
  assert.equal(preview, 'π_{Nome}(σ_{Tipo=\'Adulto\'}(Partecipante)) ∧ ∀ x ∃ y x → y');
});

test('renders theory preview HTML with safe formatted subscripts and operators', () => {
  const html = renderTheoryPreviewHtml(String.raw`\pi_{Nome, Cognome}(\sigma_{Tipo='Adulto'}(Partecipante)) R_{1} X -> Y`);
  assert.match(html, /<span class="math-op">π<sub>Nome, Cognome<\/sub><\/span>/);
  assert.match(html, /<span class="math-op">σ<sub>Tipo=&#039;Adulto&#039;<\/sub><\/span>/);
  assert.match(html, /R<sub>1<\/sub>/);
  assert.match(html, /X → Y/);
  assert.doesNotMatch(html, /<script>/);
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
  assert.match(context, /Soluzione dei prof:/);
  assert.match(context, /Clausola where: missing/);
});

test('copy context prefers the professor solution when it is available', () => {
  const context = buildCopyContext({
    exercise: {
      title: 'Teoria 1 - algebra',
      section: 'theory',
      difficulty: 'easy',
      examDate: '2026-01-23',
      prompt: 'Scrivere la query in algebra relazionale.',
      solution: 'Riassunto euristico della soluzione.',
      profSolution: 'Soluzione pura dei prof con formula completa.'
    },
    database: {
      name: 'FantaSanremo',
      relations: [{ name: 'Utente', columns: ['Email'], primaryKey: ['Email'] }],
      constraints: [],
      notes: []
    },
    answer: 'π_Email(Utente)',
    feedback: [],
    includeSolution: true
  });

  assert.match(context, /Soluzione dei prof:/);
  assert.match(context, /Soluzione pura dei prof con formula completa/);
  assert.doesNotMatch(context, /Riassunto euristico della soluzione/);
});

test('renders schema columns with primary keys highlighted inline', () => {
  const html = renderRelationSchemaHtml({
    name: 'Utente',
    columns: ['Email', 'Nickname'],
    primaryKey: ['Email']
  });

  assert.match(html, /<strong>Utente<\/strong>/);
  assert.match(html, /class="schema-column is-pk"[^>]*>Email<\/span>/);
  assert.match(html, /aria-label="Email, chiave primaria"/);
  assert.match(html, /class="schema-column"[^>]*>Nickname<\/span>/);
  assert.doesNotMatch(html, /PK:/);
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

test('highlights SQL keywords, functions, strings, and numbers as HTML spans', () => {
  const highlighted = highlightSql("SELECT SUM(Prezzo) FROM Analisi WHERE Tipo = 'biochimica' AND Prezzo < 50");
  assert.match(highlighted, /class="tok-keyword">SELECT/);
  assert.match(highlighted, /class="tok-function">SUM/);
  assert.match(highlighted, /class="tok-string">&#039;biochimica&#039;/);
  assert.match(highlighted, /class="tok-number">50/);
});

test('returns Italian labels for difficulty values', () => {
  assert.equal(difficultyLabel('easy'), 'Facile');
  assert.equal(difficultyLabel('medium'), 'Medio');
  assert.equal(difficultyLabel('hard'), 'Difficile');
});

test('dataset includes all three theory exercises for every available exam', () => {
  const data = JSON.parse(readFileSync(new URL('../exercises.json', import.meta.url), 'utf8'));
  const theory = data.exercises.filter((exercise) => exercise.section === 'theory');
  const dates = [...new Set(data.databases.map((database) => database.examDate))].sort();

  assert.equal(theory.length, dates.length * 3);
  for (const date of dates) {
    const exercisesForDate = theory.filter((exercise) => exercise.examDate === date);
    assert.deepEqual(
      exercisesForDate.map((exercise) => exercise.difficulty).sort(),
      ['easy', 'hard', 'medium']
    );
  }
});

test('dataset includes a professor solution for every theory exercise', () => {
  const data = JSON.parse(readFileSync(new URL('../exercises.json', import.meta.url), 'utf8'));
  const missing = data.exercises
    .filter((exercise) => exercise.section === 'theory' && !exercise.profSolution?.trim())
    .map((exercise) => exercise.id);

  assert.deepEqual(missing, []);
});
