const SQL_CLAUSES = ['select', 'from', 'join', 'where', 'group by', 'having', 'order by'];
const SQL_FUNCTIONS = ['count', 'sum', 'avg', 'min', 'max'];
const RELATION_AFTER = /\b(?:from|join)\s+([a-z_][a-z0-9_]*)/gi;

export function normalizeSql(sql = '') {
  return String(sql)
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*;+$/g, '')
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

const EDITOR_SURROUND_PAIRS = new Map([
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ["'", "'"],
  ['"', '"'],
  ['`', '`']
]);
const EDITOR_BLOCK_PAIRS = new Map([
  ['(', ')'],
  ['[', ']'],
  ['{', '}']
]);

function clampSelection(value, position) {
  const number = Number.isFinite(position) ? position : 0;
  return Math.max(0, Math.min(value.length, number));
}

function lineIndentBefore(value, position) {
  const lineStart = value.lastIndexOf('\n', position - 1) + 1;
  return value.slice(lineStart, position).match(/^\s*/)?.[0] || '';
}

function isInsideOpenBlock(value, position) {
  const closingStack = [];
  const blockOpenings = new Set(EDITOR_BLOCK_PAIRS.keys());

  for (const char of value.slice(0, position)) {
    if (blockOpenings.has(char)) {
      closingStack.push(EDITOR_BLOCK_PAIRS.get(char));
      continue;
    }

    if (char === closingStack.at(-1)) {
      closingStack.pop();
    }
  }

  return closingStack.length > 0;
}

export function applyEditorKey({ value = '', selectionStart = 0, selectionEnd = selectionStart, key = '' } = {}) {
  const text = String(value);
  const start = clampSelection(text, selectionStart);
  const end = clampSelection(text, selectionEnd);
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);

  if (key === 'Tab') {
    const nextValue = `${before}\t${after}`;
    const nextPosition = start + 1;
    return { handled: true, value: nextValue, selectionStart: nextPosition, selectionEnd: nextPosition };
  }

  const close = EDITOR_SURROUND_PAIRS.get(key);
  if (close && start !== end) {
    const nextValue = `${before}${key}${selected}${close}${after}`;
    return {
      handled: true,
      value: nextValue,
      selectionStart: start + 1,
      selectionEnd: end + 1
    };
  }

  if (key === 'Enter' && start === end) {
    const opening = text[start - 1];
    const closing = text[start];
    if (EDITOR_BLOCK_PAIRS.has(opening) && EDITOR_BLOCK_PAIRS.get(opening) === closing) {
      const indent = lineIndentBefore(text, start - 1);
      const insertion = `\n${indent}\t\n${indent}`;
      const nextPosition = start + indent.length + 2;
      return {
        handled: true,
        value: `${before}${insertion}${after}`,
        selectionStart: nextPosition,
        selectionEnd: nextPosition
      };
    }

    if (isInsideOpenBlock(text, start)) {
      const indent = lineIndentBefore(text, start);
      const insertion = `\n${indent}\t`;
      const nextPosition = start + insertion.length;
      return {
        handled: true,
        value: `${before}${insertion}${after}`,
        selectionStart: nextPosition,
        selectionEnd: nextPosition
      };
    }
  }

  return { handled: false, value: text, selectionStart: start, selectionEnd: end };
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

const THEORY_SHORTCUTS = new Map([
  ['\\rightarrow', '→'],
  ['\\Rightarrow', '⇒'],
  ['\\implies', '⇒'],
  ['\\bowtie', '⋈'],
  ['\\setminus', '−'],
  ['\\subseteq', '⊆'],
  ['\\notin', '∉'],
  ['\\land', '∧'],
  ['\\lor', '∨'],
  ['\\leq', '≤'],
  ['\\geq', '≥'],
  ['\\neq', '≠'],
  ['\\cup', '∪'],
  ['\\cap', '∩'],
  ['\\in', '∈'],
  ['\\times', '×'],
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

const THEORY_KEYBOARDS = {
  relational: [
    ['π', 'π'],
    ['σ', 'σ'],
    ['ρ', 'ρ'],
    ['⋈', '⋈'],
    ['⋈_{...}', '⋈_{...}', true],
    ['×', '×'],
    ['÷', '÷'],
    ['−', '−'],
    ['∪', '∪'],
    ['∩', '∩'],
    ['∀', '∀'],
    ['∃', '∃'],
    ['¬', '¬'],
    ['∧', '∧'],
    ['∨', '∨'],
    ['⇒', '⇒'],
    ['→', '→'],
    ['≠', '≠'],
    ['≤', '≤'],
    ['≥', '≥'],
    ['∈', '∈'],
    ['∉', '∉'],
    ['⊆', '⊆'],
    ['\\pi_{...}(...)', '\\pi_{...}(...)', true],
    ['\\sigma_{...}(...)', '\\sigma_{...}(...)', true],
    ['\\rho_{a<-b}(...)', '\\rho_{a<-b}(...)', true],
    ['{ x | ... }', '{ x | ... }', true]
  ],
  dependencies: [
    ['→', '→'],
    ['⇒', '⇒'],
    ['⊆', '⊆'],
    ['∈', '∈'],
    ['∉', '∉'],
    ['∪', '∪'],
    ['∩', '∩'],
    ['A+', 'A+', true],
    ['X → Y', 'X → Y', true],
    ['R(...)', 'R(...)', true],
    ['3NF', '3NF', true],
    ['BCNF', 'BCNF', true]
  ],
  optimization: [
    ['σ', 'σ'],
    ['π', 'π'],
    ['⋈', '⋈'],
    ['⋈_{...}', '⋈_{...}', true],
    ['×', '×'],
    ['∧', '∧'],
    ['∨', '∨'],
    ['≠', '≠'],
    ['≤', '≤'],
    ['≥', '≥'],
    ['\\sigma_{...}(...)', '\\sigma_{...}(...)', true],
    ['costo ≈', 'costo ≈ ', true],
    ['tuple', 'tuple', true]
  ],
  transactions: [
    ['LS(x)', 'LS(x)', true],
    ['LX(x)', 'LX(x)', true],
    ['UL(x)', 'UL(x)', true],
    ['r1(x)', 'r1(x)', true],
    ['w1(x)', 'w1(x)', true],
    ['2PL', '2PL', true],
    ['→', '→'],
    ['≠', '≠']
  ]
};

export function getTheoryKeyboard(exercise = {}) {
  const type = exercise.theoryType || 'relational';
  const keyboard = THEORY_KEYBOARDS[type] || THEORY_KEYBOARDS.relational;
  return keyboard.map(([label, value, template = false]) => ({ label, value, template }));
}

export function renderTheoryPreview(input = '') {
  let output = String(input);
  for (const [shortcut, symbol] of THEORY_SHORTCUTS) {
    output = output.replaceAll(shortcut, symbol);
  }
  return output.replaceAll('->', '→').replaceAll('=>', '⇒');
}

export function renderTheoryPreviewHtml(input = '') {
  const escaped = escapeHtml(renderTheoryPreview(input));
  return escaped
    .replace(/([πσρ⋈])_\{([^{}]*)\}/g, '<span class="math-op">$1<sub>$2</sub></span>')
    .replace(/\b([A-Za-z][A-Za-z0-9]*)_\{([^{}]+)\}/g, '$1<sub>$2</sub>')
    .replace(/\b([A-Za-z][A-Za-z0-9]*)\^\{([^{}]+)\}/g, '$1<sup>$2</sup>')
    .replace(/\n/g, '<br>');
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

export function getProfessorSolution(exercise = {}) {
  return exercise.profSolution || exercise.solution || '(non disponibile)';
}

export function renderProfessorSolutionHtml(exercise = {}) {
  const solution = getProfessorSolution(exercise);
  if (exercise.section === 'sql') {
    return `<pre class="prof-solution-code sql-solution"><code>${highlightSql(solution)}</code></pre>`;
  }

  return `<pre class="prof-solution-code theory-solution">${escapeHtml(solution)}</pre>`;
}

export function renderRelationSchemaHtml(relation = {}) {
  const primaryKeys = new Set((relation.primaryKey || []).map((column) => String(column)));
  const columns = (relation.columns || [])
    .map((column) => {
      const name = String(column);
      const isPrimaryKey = primaryKeys.has(name);
      const className = isPrimaryKey ? 'schema-column is-pk' : 'schema-column';
      const label = isPrimaryKey ? `${name}, chiave primaria` : name;
      return `<span class="${className}" aria-label="${escapeHtml(label)}">${escapeHtml(name)}</span>`;
    })
    .join('');

  return `<div class="relation"><strong>${escapeHtml(relation.name || '')}</strong><div class="schema-columns">${columns}</div></div>`;
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
    includeSolution ? ['', 'Soluzione dei prof:', getProfessorSolution(exercise)].join('\n') : ''
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

const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
const SQL_KEYWORDS = new Set([
  'select',
  'distinct',
  'from',
  'join',
  'left',
  'right',
  'inner',
  'outer',
  'on',
  'where',
  'and',
  'or',
  'not',
  'is',
  'null',
  'group',
  'by',
  'having',
  'order',
  'asc',
  'desc',
  'with',
  'as',
  'case',
  'when',
  'then',
  'else',
  'end',
  'exists',
  'in',
  'true',
  'false'
]);
const SQL_TOKEN = /(--.*$|'[^']*'|\b\d+(?:\.\d+)?\b|\b(?:count|sum|avg|min|max|coalesce|currentyear|abs)\s*(?=\()|\b[a-z_][a-z0-9_]*\b|<=|>=|<>|!=|=|<|>|\+|-|\*)/gim;

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPE[char]);
}

export function highlightSql(sql = '') {
  return String(sql).replace(SQL_TOKEN, (token) => {
    const lower = token.toLowerCase();
    const escaped = escapeHtml(token);

    if (token.startsWith('--')) return `<span class="tok-comment">${escaped}</span>`;
    if (token.startsWith("'")) return `<span class="tok-string">${escaped}</span>`;
    if (/^\d/.test(token)) return `<span class="tok-number">${escaped}</span>`;
    if (/^(count|sum|avg|min|max|coalesce|currentyear|abs)$/i.test(token)) {
      return `<span class="tok-function">${escaped}</span>`;
    }
    if (SQL_KEYWORDS.has(lower)) return `<span class="tok-keyword">${escaped}</span>`;
    if (/^(<=|>=|<>|!=|=|<|>|\+|-|\*)$/.test(token)) return `<span class="tok-operator">${escaped}</span>`;
    return escaped;
  });
}

export function difficultyLabel(difficulty) {
  return { easy: 'Facile', medium: 'Medio', hard: 'Difficile' }[difficulty] || difficulty;
}
