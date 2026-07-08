import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeSql,
  extractSqlFeatures,
  evaluateSqlAnswer,
  renderTheoryPreview,
  buildCopyContext,
  summarizeProgress,
  highlightSql,
  difficultyLabel,
  renderTheoryPreviewHtml,
  renderRelationSchemaHtml,
  getTheoryKeyboard,
  renderProfessorSolutionHtml,
  applyEditorKey
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
  const html = renderTheoryPreviewHtml(String.raw`\pi_{Nome, Cognome}(\sigma_{Tipo='Adulto'}(Partecipante)) R_{1} X -> Y ⋈_{R.id=S.id} \times`);
  assert.match(html, /<span class="math-op">π<sub>Nome, Cognome<\/sub><\/span>/);
  assert.match(html, /<span class="math-op">σ<sub>Tipo=&#039;Adulto&#039;<\/sub><\/span>/);
  assert.match(html, /<span class="math-op">⋈<sub>R.id=S.id<\/sub><\/span>/);
  assert.match(html, /R<sub>1<\/sub>/);
  assert.match(html, /X → Y/);
  assert.match(html, /×/);
  assert.doesNotMatch(html, /<script>/);
});

test('returns focused theory keyboards by exercise type', () => {
  const relational = getTheoryKeyboard({ theoryType: 'relational' }).map((key) => key.label);
  const dependencies = getTheoryKeyboard({ theoryType: 'dependencies' }).map((key) => key.label);
  const transactions = getTheoryKeyboard({ theoryType: 'transactions' }).map((key) => key.label);

  assert.equal(relational.includes('×'), true);
  assert.equal(relational.includes('⋈_{...}'), true);
  assert.equal(dependencies.includes('X → Y'), true);
  assert.equal(dependencies.includes('A+'), true);
  assert.equal(transactions.includes('LS(x)'), true);
  assert.equal(transactions.includes('LX(x)'), true);
});

test('surrounds the selected text with typed bracket or quote pairs', () => {
  const result = applyEditorKey({
    value: 'SELECT Nome FROM Utente',
    selectionStart: 7,
    selectionEnd: 11,
    key: '('
  });

  assert.equal(result.handled, true);
  assert.equal(result.value, 'SELECT (Nome) FROM Utente');
  assert.equal(result.selectionStart, 8);
  assert.equal(result.selectionEnd, 12);

  const quoted = applyEditorKey({
    value: 'Nome',
    selectionStart: 0,
    selectionEnd: 4,
    key: '"'
  });

  assert.equal(quoted.value, '"Nome"');
  assert.equal(quoted.selectionStart, 1);
  assert.equal(quoted.selectionEnd, 5);
});

test('inserts a tab character at the caret', () => {
  const result = applyEditorKey({
    value: 'SELECT Nome',
    selectionStart: 7,
    selectionEnd: 7,
    key: 'Tab'
  });

  assert.equal(result.handled, true);
  assert.equal(result.value, 'SELECT \tNome');
  assert.equal(result.selectionStart, 8);
  assert.equal(result.selectionEnd, 8);
});

test('adds an indented blank line when pressing enter inside matching brackets', () => {
  const result = applyEditorKey({
    value: '  ()',
    selectionStart: 3,
    selectionEnd: 3,
    key: 'Enter'
  });

  assert.equal(result.handled, true);
  assert.equal(result.value, '  (\n  \t\n  )');
  assert.equal(result.selectionStart, 7);
  assert.equal(result.selectionEnd, 7);
});

test('indents a new line when pressing enter inside an open bracket scope', () => {
  const result = applyEditorKey({
    value: '  WHERE id IN (SELECT id',
    selectionStart: 24,
    selectionEnd: 24,
    key: 'Enter'
  });

  assert.equal(result.handled, true);
  assert.equal(result.value, '  WHERE id IN (SELECT id\n  \t');
  assert.equal(result.selectionStart, 28);
  assert.equal(result.selectionEnd, 28);
});

test('leaves enter alone outside bracket scopes', () => {
  const result = applyEditorKey({
    value: 'SELECT Nome',
    selectionStart: 11,
    selectionEnd: 11,
    key: 'Enter'
  });

  assert.equal(result.handled, false);
  assert.equal(result.value, 'SELECT Nome');
  assert.equal(result.selectionStart, 11);
  assert.equal(result.selectionEnd, 11);
});

test('does not handle ordinary character insertion without a selection', () => {
  const result = applyEditorKey({
    value: 'Nome',
    selectionStart: 2,
    selectionEnd: 2,
    key: '('
  });

  assert.equal(result.handled, false);
  assert.equal(result.value, 'Nome');
  assert.equal(result.selectionStart, 2);
  assert.equal(result.selectionEnd, 2);
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

test('renders professor SQL solutions with syntax highlighting', () => {
  const html = renderProfessorSolutionHtml({
    section: 'sql',
    solution: "SELECT Nome FROM Utente WHERE Eta IS NULL;"
  });

  assert.match(html, /class="prof-solution-code sql-solution"/);
  assert.match(html, /class="tok-keyword">SELECT/);
  assert.match(html, /class="tok-keyword">WHERE/);
  assert.match(html, /class="tok-keyword">NULL/);
});

test('renders professor theory solutions as escaped plain text', () => {
  const html = renderProfessorSolutionHtml({
    section: 'theory',
    profSolution: '<script>alert(1)</script>'
  });

  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /tok-keyword/);
});

test('professor solution panel is rendered before heuristic feedback in the page', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(html.indexOf('id="solutionPanel"') < html.indexOf('id="feedbackPanel"'), true);
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

test('dataset includes the expected theory groups for every available exam', () => {
  const data = JSON.parse(readFileSync(new URL('../exercises.json', import.meta.url), 'utf8'));
  const theory = data.exercises.filter((exercise) => exercise.section === 'theory');
  const dates = [...new Set(data.databases.map((database) => database.examDate))].sort();

  assert.equal(theory.length, dates.length * 4);
  for (const date of dates) {
    const exercisesForDate = theory.filter((exercise) => exercise.examDate === date);
    assert.deepEqual(
      exercisesForDate.map((exercise) => exercise.difficulty).sort(),
      ['easy', 'easy', 'hard', 'medium']
    );
    assert.deepEqual(
      exercisesForDate.map((exercise) => exercise.theoryGroup).sort(),
      ['theory-1', 'theory-1', 'theory-2', 'theory-3']
    );
  }
});

test('dataset splits every theory exercise 1 into part A and part B', () => {
  const data = JSON.parse(readFileSync(new URL('../exercises.json', import.meta.url), 'utf8'));
  const dates = [...new Set(data.databases.map((database) => database.examDate))].sort();

  for (const date of dates) {
    const parts = data.exercises
      .filter((exercise) => exercise.section === 'theory' && exercise.examDate === date && exercise.theoryGroup === 'theory-1')
      .map((exercise) => exercise.theoryPart)
      .sort();

    assert.deepEqual(parts, ['A', 'B']);
  }
});

test('theory exercises use professor solutions without heuristic rubrics', () => {
  const data = JSON.parse(readFileSync(new URL('../exercises.json', import.meta.url), 'utf8'));
  const theory = data.exercises.filter((exercise) => exercise.section === 'theory');
  const withRubric = theory.filter((exercise) => exercise.rubric).map((exercise) => exercise.id);
  const withoutType = theory.filter((exercise) => !exercise.theoryType).map((exercise) => exercise.id);

  assert.deepEqual(withRubric, []);
  assert.deepEqual(withoutType, []);
});

test('dataset includes a professor solution for every theory exercise', () => {
  const data = JSON.parse(readFileSync(new URL('../exercises.json', import.meta.url), 'utf8'));
  const missing = data.exercises
    .filter((exercise) => exercise.section === 'theory' && !exercise.profSolution?.trim())
    .map((exercise) => exercise.id);

  assert.deepEqual(missing, []);
});
