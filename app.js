import {
  buildCopyContext,
  difficultyLabel,
  escapeHtml,
  evaluateSqlAnswer,
  applyEditorKey,
  getTheoryKeyboard,
  highlightSql,
  renderProfessorSolutionHtml,
  renderRelationSchemaHtml,
  renderTheoryPreviewHtml,
  summarizeProgress
} from './logic.js';

const STORAGE_KEY = 'db-exam-trainer-state-v1';
const EDITOR_KEY_SHORTCUTS = new Set(['Tab', 'Enter', '(', '[', '{', "'", '"', '`']);

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
  schemaOpen: document.querySelector('#schemaOpen'),
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
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      section: state.section,
      difficulty: state.difficulty,
      examDate: state.examDate,
      currentId: state.currentId,
      progress: state.progress,
      drafts: state.drafts
    })
  );
}

async function boot() {
  loadLocalState();

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
      state.latestFeedback = [];
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
  bindEditorKeys(els.sqlAnswer);

  els.sqlAnswer.addEventListener('scroll', () => {
    const pre = els.sqlHighlight.parentElement;
    pre.scrollTop = els.sqlAnswer.scrollTop;
    pre.scrollLeft = els.sqlAnswer.scrollLeft;
  });

  els.theoryAnswer.addEventListener('input', () => {
    saveDraft(els.theoryAnswer.value);
    syncTheoryPreview();
  });
  bindEditorKeys(els.theoryAnswer);

  els.checkAnswer.addEventListener('click', checkCurrentAnswer);
  els.toggleSolution.addEventListener('click', toggleSolution);
  els.copyContext.addEventListener('click', copyCurrentContext);
  els.resetAnswer.addEventListener('click', resetCurrentAnswer);
  els.prevExercise.addEventListener('click', () => moveExercise(-1));
  els.nextExercise.addEventListener('click', () => moveExercise(1));
  els.schemaOpen.addEventListener('click', () => els.schemaPanel.classList.add('is-open'));
  els.schemaToggle.addEventListener('click', () => els.schemaPanel.classList.toggle('is-open'));
}

function filteredExercises() {
  return state.data.exercises.filter((exercise) => {
    return (
      exercise.section === state.section &&
      (state.difficulty === 'all' || exercise.difficulty === state.difficulty) &&
      (state.examDate === 'all' || exercise.examDate === state.examDate)
    );
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

  els.exerciseList.innerHTML = list
    .map((exercise) => {
      const progress = state.progress[exercise.id] || {};
      const dotClass = progress.solved ? 'is-solved' : progress.checked ? 'is-checked' : '';
      return `<button class="exercise-item ${exercise.id === state.currentId ? 'is-active' : ''}" type="button" data-id="${exercise.id}">
        <strong><span class="status-dot ${dotClass}"></span>${escapeHtml(exercise.title)}</strong>
        <span>${exercise.examDate} · ${difficultyLabel(exercise.difficulty)}</span>
      </button>`;
    })
    .join('');

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
  els.checkAnswer.classList.toggle('is-hidden', exercise.section === 'theory');
  els.feedbackPanel.classList.toggle('is-hidden', exercise.section === 'theory');

  const draft = state.drafts[exercise.id] || '';
  if (exercise.section === 'sql') {
    els.sqlAnswer.value = draft;
    syncSqlHighlight();
  } else {
    renderKeyboard(exercise);
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
  els.schemaRelations.innerHTML = database.relations
    .map((relation) => renderRelationSchemaHtml(relation))
    .join('');
  els.schemaConstraints.innerHTML = `<h3>Vincoli</h3>${escapeHtml(database.constraints.join('\n'))}`;
  els.schemaNotes.innerHTML = `<h3>Note</h3>${escapeHtml(database.notes.join('\n'))}`;
}

function syncSqlHighlight() {
  els.sqlHighlight.innerHTML = `${highlightSql(els.sqlAnswer.value)}\n`;
}

function syncTheoryPreview() {
  els.theoryPreview.innerHTML = renderTheoryPreviewHtml(els.theoryAnswer.value);
}

function renderKeyboard(exercise) {
  els.symbolKeyboard.innerHTML = getTheoryKeyboard(exercise).map(({ label, value, template }) => {
    return `<button class="symbol-key ${template ? 'template' : ''}" type="button" data-value="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
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

function bindEditorKeys(textarea) {
  textarea.addEventListener('keydown', (event) => {
    const editorKey = EDITOR_KEY_SHORTCUTS.has(event.key);
    if (event.metaKey || (event.shiftKey && event.key === 'Tab')) return;
    if ((event.ctrlKey || event.altKey) && !editorKey) return;

    const result = applyEditorKey({
      value: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
      key: event.key
    });

    if (!result.handled) return;
    event.preventDefault();
    textarea.value = result.value;
    textarea.selectionStart = result.selectionStart;
    textarea.selectionEnd = result.selectionEnd;
    textarea.dispatchEvent(new Event('input'));
  });
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
  if (exercise.section === 'theory') {
    state.solutionVisible = true;
    renderSolution();
    return;
  }

  const result = evaluateSqlAnswer(currentAnswer(), exercise.rubric);

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
  els.feedbackPanel.innerHTML = `${summary}${items
    .map((entry) => {
      const label = entry.status === 'present' ? 'Presente' : entry.status === 'violation' ? 'Vincolo violato' : 'Manca';
      const detail = entry.detail ? `<br><small>${escapeHtml(entry.detail)}</small>` : '';
      return `<div class="feedback-item" data-status="${entry.status}">
        <span>${escapeHtml(entry.label)}${detail}</span>
        <strong>${label}</strong>
      </div>`;
    })
    .join('')}`;
}

function toggleSolution() {
  state.solutionVisible = !state.solutionVisible;
  renderSolution();
}

function renderSolution() {
  const exercise = currentExercise();
  if (!exercise || !state.solutionVisible) {
    els.solutionPanel.classList.add('is-hidden');
    els.toggleSolution.textContent = 'Mostra soluzione prof';
    return;
  }

  els.solutionPanel.classList.remove('is-hidden');
  els.toggleSolution.textContent = 'Nascondi soluzione prof';
  els.solutionPanel.innerHTML = `<h3>Soluzione dei prof</h3>${renderProfessorSolutionHtml(exercise)}`;
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
