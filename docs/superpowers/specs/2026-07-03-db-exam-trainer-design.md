# DB Exam Trainer - Design Spec

## Goal

Build a local static study trainer for past Basi di Dati written exams. The app helps the student practice SQL and theory exercises from the PDFs in this folder, with the database schema always visible, local heuristic feedback, progress tracking, and one-click context copying for follow-up questions to Codex.

The first implementation uses a static JSON dataset and no frontend framework.

## Product Register

This is a product UI: design serves concentrated study. The interface should feel technical, calm, dark-mode first, and lightly motivating. It should not look like a landing page, a generic SaaS dashboard, a heavy IDE, or an arcade game.

## Files

The first version will use:

- `index.html`: semantic app shell and static loading skeleton.
- `styles.css`: dark theme, layout, syntax highlighting, responsive states, motion.
- `app.js`: app state, exercise rendering, local heuristic checks, progress, copy context.
- `exercises.json`: database schemas, SQL exercises, theory exercises, official solutions, and rubric checklists.

Progress is stored in `localStorage`.

## Information Architecture

The app has one main working surface:

1. Compact top bar
   - App name.
   - Tabs: `SQL`, `Teoria`.
   - Difficulty filter: `Facile`, `Medio`, `Difficile`.
   - Current exam selector.
   - Compact progress summary.

2. Exercise workspace
   - Left/main column: prompt, answer editor, preview or syntax highlight, verification controls, feedback.
   - Right/sticky column: database schema, referential constraints, notes, current exercise metadata.

3. Progress and exercise navigation
   - Exercise list grouped by difficulty and exam date.
   - Completion state per exercise: untouched, attempted, checked, solved.
   - Progress bars for SQL, theory, and difficulty level.

The primary layout is a two-column split. On smaller screens, the schema panel collapses into a sticky toggle/drawer while remaining quickly reachable.

## Layout

Use a restrained dark-mode product layout:

- No hero section.
- No large marketing header.
- No nested cards.
- The prompt and answer area are visually dominant.
- The schema panel remains visible on desktop using `position: sticky`.
- Typography uses a system sans stack for UI and a monospace stack for code/schema.
- Stable dimensions prevent controls from jumping during feedback updates.

Physical scene: evening study session at a desk, with an editor-like dark workspace and a pinned database schema beside the reasoning.

## Visual Direction

Color strategy: restrained dark product UI.

Palette direction:

- Background: near-black neutral.
- Surfaces: slightly lifted dark panels.
- Ink: high-contrast off-white.
- Muted text: readable blue-gray, not low-contrast gray.
- Primary: measured indigo/violet near the `impeccable` seed hue.
- Accent: distinct cyan/teal for progress and positive states.
- Warnings/errors: amber and red used only for feedback states.

Use OKLCH custom properties in CSS. Filled saturated controls use near-white text.

Motion:

- 150-250 ms transitions.
- Feedback panels can slide/fade in.
- Progress bars animate on state change.
- Copy success and verification results get small stateful feedback.
- Respect `prefers-reduced-motion: reduce`.

## SQL Practice

The SQL section includes:

- Prompt text from the exam.
- Database schema and constraints in the sticky panel.
- SQL answer editor implemented as a textarea with a synchronized highlighted layer.
- Syntax highlighting for SQL keywords, functions, strings, numbers, comments, table aliases, and operators.
- Controls:
  - `Verifica`
  - `Mostra soluzione`
  - `Reset risposta`
  - `Copia contesto`
  - Previous/next exercise

The SQL checker is heuristic and local. It does not execute SQL. It compares the user's normalized answer against the exercise rubric.

Rubric checks can include:

- required clauses: `select`, `from`, `join`, `where`, `group by`, `having`, `order by`
- forbidden clauses: for example subqueries when the prompt says not to use them
- expected joins or relation names
- expected filters
- expected aggregate functions
- expected grouping keys
- expected sort direction
- expected null handling
- expected `distinct`
- expected universal-quantification pattern such as `not exists`

Feedback should be practical:

- "Presente"
- "Manca"
- "Da controllare"
- "Vincolo violato"

The app also shows a clause-level diff between the submitted answer and the official solution. The diff is explanatory, not treated as the only correctness signal.

## Theory Practice

The theory section mirrors SQL but uses a theory answer editor:

- Prompt text.
- Textarea for the answer.
- Symbol keyboard.
- Rendered preview.
- Rubric-based feedback.
- Official solution reveal.
- Copy context.

The virtual keyboard is grouped:

- Algebra relazionale: `pi`, `sigma`, `rho`, join, division, union, intersection, difference.
- Logica/calcolo: forall, exists, not, and, or, implies.
- Dipendenze funzionali: arrow, set braces, subset, membership, not equal.
- Comparisons and helpers: <=, >=, subscripts, templates.

The UI inserts Unicode symbols and common templates such as:

- `pi_{...}(...)`
- `sigma_{...}(...)`
- `rho_{... <- ...}(...)`
- `{ x | ... }`
- `X -> Y`

The editor also supports lightweight shortcuts in the preview:

- `\pi` -> `pi` symbol
- `\sigma` -> `sigma` symbol
- `\rho` -> `rho` symbol
- `\forall` -> forall symbol
- `\exists` -> exists symbol
- `\and`, `\or`, `\not`, `\to`, `\join`, `\div`

The preview must display the final mathematical symbols clearly. Full LaTeX rendering is out of scope for the first version because the app should remain local, static, and dependency-free.

Theory feedback uses concept rubrics, not exact text matching. It can check for:

- expected symbols or operators
- expected relational algebra operations
- expected calculus quantifiers
- expected dependency steps
- expected normal form conclusions
- expected transaction/2PL concepts
- important explanatory keywords

## JSON Data Model

`exercises.json` contains:

```json
{
  "databases": [
    {
      "id": "fantasanremo-2026-01-23",
      "name": "FantaSanremo",
      "examDate": "2026-01-23",
      "description": "...",
      "relations": [
        {
          "name": "Utente",
          "columns": ["Email", "Nickname", "Cognome", "Nome", "AnnoNascita*"],
          "primaryKey": ["Email"]
        }
      ],
      "constraints": ["Squadra(Email) referenzia Utente(Email)"],
      "notes": ["AnnoNascita puo' essere NULL."]
    }
  ],
  "exercises": [
    {
      "id": "2026-01-23-sql-1",
      "section": "sql",
      "examDate": "2026-01-23",
      "databaseId": "fantasanremo-2026-01-23",
      "difficulty": "easy",
      "title": "SQL 1 - bassa complessita'",
      "prompt": "...",
      "solution": "...",
      "rubric": {
        "requiredClauses": ["select", "from", "join", "where", "order by"],
        "forbiddenClauses": ["subquery"],
        "requiredRelations": ["squadra", "composizionesquadra", "cantante", "utente"],
        "requiredConcepts": [
          {
            "label": "Filtra la lega PessiNet12",
            "patterns": ["pessinet12"]
          }
        ]
      }
    }
  ]
}
```

Difficulty maps exam question numbers:

- `easy`: SQL/theory exercise 1.
- `medium`: exercise 2.
- `hard`: exercise 3.

Theory exercises use the same envelope with theory-specific rubric fields such as `expectedSymbols`, `expectedKeywords`, and `expectedConcepts`.

## Copy Context

Every exercise has a copy button that writes a structured block to the clipboard:

- exercise title
- section and difficulty
- exam date
- database name
- schema and constraints
- prompt
- user's current answer
- official solution if revealed or requested for copying
- latest feedback

The copied text is optimized for sending to Codex in this same interface.

## Progress

Local progress includes:

- current section
- current difficulty
- selected exercise id
- answer drafts by exercise id
- checked status
- solved/completed status
- count of checked exercises per section
- simple streak based on consecutive checked exercises in the current browser session

The app should not require login or network access.

## Initial Content Scope

The first dataset should cover the available past exams as far as the source PDFs allow. The implementation target is:

- all SQL questions from the available written exams, cleaned from the official PDF text
- theory question prompts from the available exams
- official theory solution summaries where PDF extraction is readable
- manually cleaned theory notation for algebra/calculus/dependency exercises when extraction is garbled
- rubrics written manually from the official solutions

If a PDF extraction produces garbled mathematical notation, encode a cleaned summary in JSON rather than preserving broken extraction text.

## Error And Empty States

- If `exercises.json` fails to load, show a clear local-file/server hint.
- If no exercise matches the filters, show a compact empty state with reset filters.
- If clipboard access fails, show the context in a selectable text area.
- If a checker cannot evaluate a rubric field, mark it as "Da controllare" rather than claiming failure.

## Verification Plan

Before completion:

- Open the app locally in the browser.
- Verify desktop layout: two-column split, sticky schema, no overlap.
- Verify mobile/narrow layout: schema remains accessible and text does not overflow.
- Verify SQL highlighting with at least one official solution.
- Verify theory keyboard inserts symbols/templates at cursor position.
- Verify shortcut preview converts common commands.
- Verify `Verifica` produces meaningful feedback for SQL and theory.
- Verify progress persists after reload.
- Verify `Copia contesto` writes complete useful context.
- Check reduced motion behavior.

## Out Of Scope For First Version

- SQL execution against a real database.
- Perfect semantic equivalence checking.
- Full LaTeX engine.
- In-app exercise editor.
- Automatic PDF import UI.
- User accounts or cloud sync.
