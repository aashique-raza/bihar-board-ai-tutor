# TASK-025 — Exam Knowledge Layer: Master Implementation Plan

**Location:** Root folder (same level as CLAUDE.md, README.md)  
**Status:** READY — implement phase by phase, test after each phase  
**Implementer:** Claude (reads this file, implements one phase at a time)  
**Rule:** Do NOT skip ahead. Complete one phase → verify → move to next.

---

## HOW TO USE THIS FILE

This plan is written so that the implementer (Claude) can pick up any phase and
execute it perfectly without needing to re-analyze anything. Every decision is
pre-made. Every hidden bug is pre-empted. Every edge case is documented.

When asked to implement a phase:
1. Read the full phase section carefully first
2. Check the "Pre-conditions" — make sure previous phases are done
3. Execute exactly as written
4. Run the verification steps at the end
5. Report what happened before moving on

---

## 1. Problem Statement — Exactly What Fails Today

Two categories of questions fail completely in the current system:

**Category A — Exam Pattern Questions (Exact Lookup)**

These fail because there is no exam pattern data anywhere in the system:
```
"Science kitne marks ka hai?"             → "material not available"
"Biology mein kaun sa chapter important?" → retrieves optics/biology textbook chunks (WRONG)
"Passing marks kya hai?"                  → classified OUT_OF_CONTEXT or wrong answer
"Section A mein kitne MCQ solve karne?"   → no data in vector store
"Life Processes se kitne marks aate?"     → returns Life Processes TEXTBOOK content (WRONG)
"Internal assessment kya hota hai?"       → no content found
```

Root cause of wrong content retrieval: "Life Processes marks?" query
- Embedding of this query is similar to Life Processes TEXTBOOK chunks (lots of "life processes" tokens)
- Vector search returns biology textbook content instead of marks info
- This is the **Entity Conflict Bug** — exam metadata and textbook content share keywords

**Category B — General Overview Questions (Semantic)**

These fail because no orientation/overview content is indexed:
```
"Science kya hoti hai?"        → random science chapter chunks retrieved
"Biology kya hai?"             → returns random biology concept chunks
"Zuno mujhe kya padha sakta?"  → no orientation content exists
"Physics aur Chemistry mein kya fark?" → no comparison content
```

---

## 2. Architecture Decision — Final (Not Up for Re-Discussion)

**Exam Pattern Data** → Static JSON file + Knowledge Service
- Why: Exact numbers (27 marks, 33/80, etc.) must be 100% accurate
- RAG is probabilistic — wrong marks answer harms student exam prep
- JSON is O(1) lookup, deterministic, zero API cost, zero hallucination risk
- JSON file at `data/class-10/global/` is NOT picked up by markdownLoader (only .md files)

**Science Overview Content** → Markdown file + RAG
- Why: Questions like "Biology kya hai?" have infinite semantic variations
- RAG handles "bio subject explain karo", "jeev vigyan kya hai", "biology describe" all equally well
- Static JSON cannot handle semantic variation

**Routing Mechanism** → New `EXAM_INFO` intent in Decider (Step 4)
- Step 4 classifies the intent DETERMINISTICALLY
- Step 5 reads the intent and routes to Knowledge Service (for EXAM_INFO) or vector search (for CONCEPT_QUESTION)
- Step 6 (intentRouter.js) handles EXAM_INFO with its own dedicated prompt
- This fits the EXISTING pattern in intentRouter.js perfectly — just add one more entry

**NOT using Tool Calling (Function Calling)**:
- Would require LLM to decide when to call tools → non-deterministic
- Changes RunnableSequence chain in step6 → breaks existing architecture
- Groq (default provider) tool calling is unreliable
- Adds extra LLM turn for every exam query → latency increase

---

## 3. Critical Pre-Implementation Knowledge

### 3.1 indexPipeline.js Behavior (MUST READ)

`npm run rag:index` does a **FULL WIPE AND REBUILD**:
```javascript
// Line 91 in indexPipeline.js:
await Chunk.deleteMany({});  // ALL existing chunks deleted first
// Then inserts new chunks in batches
```

**Implication 1:** If pipeline fails mid-way (e.g., Gemini API rate limit), the
vector store is LEFT EMPTY. Old chunks are gone, new ones never inserted.
**How to handle:** If pipeline fails, fix the error and re-run immediately.
Do NOT leave the system with an empty vector store.

**Implication 2:** Every rag:index call re-embeds ALL chunks (Gemini API calls).
This costs Gemini API quota. Run only when content actually changes.

**Implication 3:** baseDataDir is hardcoded to `data/class-10/science` in indexPipeline.js.
Files in `data/class-10/global/` are NEVER indexed. This is CORRECT — we
do not want exam_patterns.json in the vector store.

### 3.2 markdownLoader.js Validation Rules

For files in `data/class-10/science/meta/` folder:
- `getSectionFolder()` returns `"meta"` (from folder name)
- `"meta"` is NOT in SECTION_RULES (only chemistry/biology/physics are)
- Falls into `else` branch → lenient validation
- ONLY checks that `chapter_no` is an integer (0 is valid!)
- Does NOT check chapter_no range, does NOT check original_science_chapter_no range

BUT: These fields MUST exist (not be undefined/null/empty string):
- board (must be "Bihar Board")
- class (must be integer 10)
- subject (must exist, any string)
- section (must exist, any string)
- chapter_no (must be integer)
- original_science_chapter_no (must exist — value unchecked for meta/)
- chapter_title (must exist)
- language (must be "English")
- source_type (must be "cleaned_markdown")

### 3.3 intentRouter.js Pattern (Existing Pattern We're Following)

The existing intentRouter.js has three data structures we add to:
```javascript
const INTENT_CONFIG = {         // ← Add EXAM_INFO entry here
  GREETING: { prompt, temp, maxTokens },
  CONCEPT_QUESTION: { ... },
  // etc.
};

const HISTORY_WINDOW = {        // ← Add EXAM_INFO entry here
  GREETING: 4,
  CONCEPT_QUESTION: 6,
  // etc.
};

const buildPromptInput = (intent, ...) => {
  switch (intent) {             // ← Add case 'EXAM_INFO' here
    case 'GREETING': return { ... };
    case 'CONCEPT_QUESTION': return { ... };
  }
};
```

CRITICAL: If EXAM_INFO is missing from INTENT_CONFIG but Step 4 returns it,
line 188 in intentRouter.js triggers: "Unknown intent → falling back to CONCEPT_QUESTION".
CONCEPT_QUESTION then receives exam pattern context as retrievedContext and tries to
treat it as textbook content → confusing answer. This is why Phase 5 is critical.

### 3.4 USE_INTENT_ROUTER Flag

`step6.generateResponse.js` checks `process.env.USE_INTENT_ROUTER === 'true'`.

If `USE_INTENT_ROUTER=true` → intentRouter.js handles all intents (EXAM_INFO included after Phase 5)
If `USE_INTENT_ROUTER=false` or not set → legacy tutorPrompt.js handles all intents

**Legacy path behavior for EXAM_INFO:**
The legacy tutorResponsePrompt will receive EXAM_INFO as intent, responseMode='study_tutor',
and retrievedContext = exam pattern formatted string (from Phase 4).
The legacy tutor applies Strict Grounding and answers from retrievedContext.
This WILL work (the exam data is in retrievedContext), but without the optimized
examInfoPrompt — the answer style is less tailored. It's a safe fallback.

**Action:** Plan is designed to work on BOTH paths. Phase 5 (intentRouter changes)
enables the optimized path. Even if USE_INTENT_ROUTER=false, Phases 1-4 make exam
queries work via the legacy path.

### 3.5 Path Resolution for examKnowledgeService.js

File location: `backend/src/knowledge/examKnowledgeService.js`
Data location: `data/class-10/global/exam_patterns.json`

Path calculation:
```
backend/src/knowledge/   → dirname of the JS file
../../..                 → goes up to project root
data/class-10/global/exam_patterns.json
```

Full resolved path in code:
```javascript
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, '../../../data/class-10/global/exam_patterns.json');
```

Verify: `backend/src/knowledge/` → `../` = `backend/src/` → `../../` = `backend/` → `../../../` = project root

### 3.6 Chunk ID Collision Risk

`makeChunkId` in markdownChunker.js: `{section}-chapter-{chapter_no}-chunk-{index}`
For science-overview.md: `meta-chapter-00-chunk-001`, `meta-chapter-00-chunk-002` etc.

If we add a SECOND meta file later with the same chapter_no: 0, chunk IDs will collide.
Prevention: This plan uses `chapter_no: 0` only for science-overview.md.
Any future meta files must use different chapter_no values (e.g., 98, 99).

### 3.7 chapterId Field in indexPipeline.js

```javascript
chapterId: doc.metadata.chapter_id,  // Note: chapter_id not chapter_no
```

`chapter_id` is NOT in the YAML frontmatter (we have `chapter_no`). So `doc.metadata.chapter_id`
= undefined → stored as null in MongoDB `chapterId` field.
This is an existing behavior for ALL 16 science chapters (they also don't have `chapter_id`).
Not a new bug. No action needed.

---

## 4. PHASE 1A — Create exam_patterns.json

**Pre-conditions:** None. This is the first phase.  
**Risk:** None. Creating a new file in a new folder. Nothing breaks.  
**Reversible:** Yes — delete the file.

### Step 1: Create the directory

```
data/class-10/global/
```

This folder does NOT exist yet. Create it manually or via mkdir.
The markdownLoader will NOT recurse into this folder — it only reads from
`data/class-10/science/` (hardcoded in indexPipeline.js).

### Step 2: Create the file

**File path:** `data/class-10/global/exam_patterns.json`

**Source:** BSEB_Class10_ExamPattern_2026.md (provided by user)  
**Why JSON not Markdown:** markdownLoader only loads .md files. JSON here is
never accidentally indexed into vector store. JSON also enforces data types.

**COMPLETE FILE CONTENT:**

```json
{
  "_meta": {
    "source": "Bihar School Examination Board (BSEB) official syllabus 2025-26",
    "verified_against": "getmyuni, kollegeapply, careers360, shiksha",
    "board": "Bihar Board",
    "class": 10,
    "exam_year": "2026",
    "last_updated": "2026-06-21",
    "accuracy_note": "Chapter-level marks are APPROXIMATE. BSEB does not officially publish exact per-chapter marks. Values based on model papers, past exam analysis, and coaching institute data.",
    "verified_fields": ["subject-wise marks split (27/26/27)", "paper structures", "total marks", "passing criteria"],
    "approximate_fields": ["chapter-level marks within each subject"]
  },
  "general_rules": {
    "total_subjects": 6,
    "total_marks": 500,
    "english_in_division": false,
    "note_english": "English marks are generally excluded from division calculation",
    "passing_per_subject": 30,
    "passing_aggregate": 150,
    "passing_aggregate_out_of": 500,
    "negative_marking": false,
    "exam_duration_hours": 3,
    "exam_duration_reading_minutes": 15,
    "exam_mode": "Offline pen and paper",
    "omr_sheet": "Used for Section A objective questions"
  },
  "division_system": {
    "first_division": { "minimum": 300, "out_of": 500 },
    "second_division": { "minimum": 225, "maximum": 299, "out_of": 500 },
    "third_division": { "minimum": 150, "maximum": 224, "out_of": 500 },
    "fail": { "below": 150 }
  },
  "paper_types": {
    "type1_pure_theory": {
      "applies_to": ["Mathematics", "Hindi", "English", "Sanskrit"],
      "section_a": {
        "name": "Section A — Objective MCQ (OMR-based)",
        "total_questions_given": 100,
        "questions_to_attempt": 50,
        "marks_per_question": 1,
        "total_marks": 50,
        "important_rule": "If student answers more than 50, only the FIRST 50 answers are evaluated"
      },
      "section_b": {
        "name": "Section B — Short Answer",
        "total_questions_given": 30,
        "questions_to_attempt": 15,
        "marks_per_question": 2,
        "total_marks": 30
      },
      "section_c": {
        "name": "Section C — Long Answer",
        "total_questions_given": 8,
        "questions_to_attempt": 4,
        "marks_per_question": 5,
        "total_marks": 20
      },
      "grand_total": 100
    },
    "type2_theory_plus_practical": {
      "applies_to": ["Science", "Social Science"],
      "section_a": {
        "name": "Section A — Objective MCQ (OMR-based)",
        "total_questions_given": 80,
        "questions_to_attempt": 40,
        "marks_per_question": 1,
        "total_marks": 40,
        "important_rule": "If student attempts more than 40, only the FIRST 40 are evaluated"
      },
      "section_b": {
        "name": "Section B — Short Answer",
        "total_questions_given": 30,
        "questions_to_attempt": 15,
        "marks_per_question": 2,
        "total_marks": 30
      },
      "section_c": {
        "name": "Section C — Long Answer",
        "total_questions_given": 8,
        "questions_to_attempt": 4,
        "marks_per_question": 5,
        "total_marks": 20
      },
      "section_d": {
        "name": "Section D — Internal Assessment (school-based, not in board exam hall)",
        "total_marks": 20
      },
      "theory_total": 80,
      "internal_total": 20,
      "grand_total": 100,
      "theory_passing": 33,
      "note_theory_passing": "Minimum 33 marks out of 80 required in theory (for Science and Social Science)"
    }
  },
  "subjects": {
    "mathematics": {
      "display_name": "Mathematics (Ganit)",
      "total_marks": 100,
      "theory_marks": 100,
      "practical_marks": 0,
      "passing_marks": 33,
      "paper_type": "type1_pure_theory",
      "exam_duration_minutes": 195,
      "units": [
        {
          "unit_name": "Number System",
          "chapters": ["Real Numbers (Ch 1)"],
          "marks": 10,
          "priority": "MEDIUM"
        },
        {
          "unit_name": "Algebra",
          "chapters": ["Polynomials (Ch 2)", "Pair of Linear Equations (Ch 3)", "Quadratic Equations (Ch 4)", "Arithmetic Progressions (Ch 5)"],
          "marks": 20,
          "priority": "HIGH"
        },
        {
          "unit_name": "Trigonometry",
          "chapters": ["Introduction to Trigonometry (Ch 8)", "Some Applications of Trigonometry — Heights and Distances (Ch 9)"],
          "marks": 20,
          "priority": "HIGH"
        },
        {
          "unit_name": "Coordinate Geometry",
          "chapters": ["Coordinate Geometry (Ch 7)"],
          "marks": 10,
          "priority": "MEDIUM"
        },
        {
          "unit_name": "Geometry",
          "chapters": ["Triangles (Ch 6)", "Circles (Ch 10)", "Constructions (Ch 11)"],
          "marks": 20,
          "priority": "HIGH"
        },
        {
          "unit_name": "Mensuration",
          "chapters": ["Areas Related to Circles (Ch 12)", "Surface Areas and Volumes (Ch 13)"],
          "marks": 10,
          "priority": "MEDIUM"
        },
        {
          "unit_name": "Statistics and Probability",
          "chapters": ["Statistics (Ch 14)", "Probability (Ch 15)"],
          "marks": 10,
          "priority": "MEDIUM"
        }
      ],
      "key_focus": "Algebra + Trigonometry + Geometry = 60 marks combined — highest priority"
    },
    "science": {
      "display_name": "Science (Vigyan)",
      "total_marks": 100,
      "theory_marks": 80,
      "internal_marks": 20,
      "overall_passing": 30,
      "theory_passing": 33,
      "paper_type": "type2_theory_plus_practical",
      "exam_duration_minutes": 195,
      "internal_assessment_breakdown": {
        "experiments_practicals": { "marks": 11 },
        "project_file_record": { "marks": 6 },
        "viva_voce": { "marks": 3 },
        "total": 20
      },
      "bseb_official_units": [
        { "unit": "Chemical Compounds", "subject_area": "Chemistry", "approx_marks": 25 },
        { "unit": "The Living World", "subject_area": "Biology", "approx_marks": 20 },
        { "unit": "Electricity and its Effects", "subject_area": "Physics", "approx_marks": 18 },
        { "unit": "Light and Communication", "subject_area": "Physics", "approx_marks": 14 },
        { "unit": "Natural Resources", "subject_area": "Biology and Environment", "approx_marks": 10 }
      ],
      "subjects_breakdown": {
        "physics": {
          "theory_marks": 27,
          "percentage_of_theory": "33.75%",
          "chapters": [
            {
              "chapter_no": 10,
              "title": "Light: Reflection and Refraction",
              "approx_marks": 8,
              "priority": "HIGH",
              "topics": [
                "Laws of reflection",
                "Spherical mirrors — concave and convex",
                "Image formation by spherical mirrors",
                "Mirror formula (1/f = 1/v + 1/u) and magnification",
                "Refraction of light and Snell's law",
                "Refractive index",
                "Spherical lenses — concave and convex",
                "Image formation by spherical lenses",
                "Lens formula and power of a lens (P = 1/f)"
              ],
              "exam_tip": "Highest marks chapter in Physics. Ray diagram numericals asked every year. Mirror and lens formula must be memorized. Sign convention is critical."
            },
            {
              "chapter_no": 11,
              "title": "Human Eye and the Colourful World",
              "approx_marks": 6,
              "priority": "HIGH",
              "topics": [
                "Structure and working of the human eye",
                "Power of accommodation",
                "Defects of vision: myopia, hypermetropia, presbyopia",
                "Correction of eye defects using lenses",
                "Refraction through a glass prism",
                "Dispersion of white light — spectrum",
                "Atmospheric refraction (twinkling of stars, advance sunrise)",
                "Scattering of light — Tyndall effect, blue sky, red sunset"
              ],
              "exam_tip": "Eye defect diagrams and their corrections are asked every year. Reason for blue sky and red sunset must be explained clearly."
            },
            {
              "chapter_no": 12,
              "title": "Electricity",
              "approx_marks": 7,
              "priority": "HIGH",
              "topics": [
                "Electric current and potential difference",
                "Ohm's Law (V = IR)",
                "Resistance and resistivity",
                "Factors affecting resistance",
                "Series combination of resistors",
                "Parallel combination of resistors",
                "Heating effect of electric current — Joule's Law",
                "Electric power: P = VI = I²R = V²/R",
                "Electric energy and units (kWh)"
              ],
              "exam_tip": "Ohm's Law numericals, series/parallel resistance problems are very common. Power formula P=VI=I²R=V²/R must be memorized. Electric energy billing problems also appear."
            },
            {
              "chapter_no": 13,
              "title": "Magnetic Effects of Electric Current",
              "approx_marks": 6,
              "priority": "HIGH",
              "topics": [
                "Magnetic field due to current-carrying straight wire",
                "Right-hand thumb rule",
                "Magnetic field due to circular loop",
                "Solenoid and electromagnet",
                "Force on current-carrying conductor in magnetic field (Fleming's Left Hand Rule)",
                "Electric motor — working principle and diagram",
                "Electromagnetic induction — Faraday's law",
                "Electric generator (AC and DC) — working and diagram",
                "Domestic electric circuits — earthing, fuse, MCB"
              ],
              "exam_tip": "Electric motor and generator diagrams are asked every year. Fleming rules (Left for motor, Right for generator) must be crystal clear."
            },
            {
              "chapter_no": 14,
              "title": "Sources of Energy",
              "approx_marks": 3,
              "priority": "LOW",
              "topics": [
                "Characteristics of a good fuel",
                "Fossil fuels — coal, petroleum, natural gas",
                "Thermal power plant",
                "Hydroelectric power plant",
                "Biomass and biogas",
                "Wind energy",
                "Solar energy — solar cells and solar panels",
                "Tidal and wave energy",
                "Nuclear fission and fusion — nuclear energy",
                "Environmental consequences of energy use"
              ],
              "exam_tip": "Lowest marks Physics chapter. Advantages and disadvantages of renewable vs non-renewable sources sufficient. Nuclear energy concepts may appear in MCQ."
            }
          ]
        },
        "chemistry": {
          "theory_marks": 26,
          "percentage_of_theory": "32.5%",
          "chapters": [
            {
              "chapter_no": 1,
              "title": "Chemical Reactions and Equations",
              "approx_marks": 6,
              "priority": "HIGH",
              "topics": [
                "Chemical equations and balancing",
                "Types of chemical reactions: combination, decomposition, displacement, double displacement",
                "Oxidation and reduction (redox reactions)",
                "Effects of oxidation in everyday life — corrosion, rancidity"
              ],
              "exam_tip": "Balancing chemical equations is very common. ALL 5 types of reactions must be memorized with one example each. Distinguish between oxidation and reduction clearly."
            },
            {
              "chapter_no": 2,
              "title": "Acids, Bases and Salts",
              "approx_marks": 6,
              "priority": "HIGH",
              "topics": [
                "Chemical properties of acids and bases",
                "pH scale and pH indicators",
                "Neutralization reaction",
                "Salts: family, pH",
                "Common salts: sodium chloride (NaCl), sodium hydroxide (NaOH), baking soda (NaHCO₃), washing soda (Na₂CO₃·10H₂O), bleaching powder (CaOCl₂), plaster of paris (CaSO₄·½H₂O)",
                "Water of crystallization"
              ],
              "exam_tip": "Chemical formulas and uses of common salts are very frequently asked. pH of common substances. Difference between acids and bases based on indicators."
            },
            {
              "chapter_no": 3,
              "title": "Metals and Non-metals",
              "approx_marks": 6,
              "priority": "HIGH",
              "topics": [
                "Physical properties of metals and non-metals",
                "Chemical properties of metals (reactions with oxygen, water, acids, other metal salts)",
                "Reactivity series of metals",
                "Extraction of metals from ores (least reactive, moderately reactive, highly reactive)",
                "Refining of metals",
                "Ionic bond formation",
                "Corrosion and its prevention"
              ],
              "exam_tip": "Reactivity series order must be memorized (top to bottom: K, Na, Ca, Mg, Al, Zn, Fe, Pb, H, Cu, Hg, Ag, Au, Pt). Extraction of aluminium and iron are frequently asked."
            },
            {
              "chapter_no": 4,
              "title": "Carbon and its Compounds",
              "approx_marks": 5,
              "priority": "MEDIUM",
              "topics": [
                "Bonding in carbon — covalent bonding",
                "Allotropes of carbon: diamond, graphite, fullerene",
                "Saturated hydrocarbons (alkanes) and unsaturated hydrocarbons (alkenes, alkynes)",
                "IUPAC nomenclature of carbon compounds",
                "Chemical properties of carbon compounds: combustion, oxidation, addition, substitution",
                "Ethanol: properties and uses",
                "Ethanoic acid (acetic acid): properties and uses",
                "Soaps and detergents: structure, micelle formation, difference"
              ],
              "exam_tip": "IUPAC naming of carbon compounds is frequently asked. Difference between soaps and detergents (micelle, hard water behavior) is very common in short answers."
            },
            {
              "chapter_no": 5,
              "title": "Periodic Classification of Elements",
              "approx_marks": 3,
              "priority": "LOW",
              "topics": [
                "Early attempts at classification: Dobereiner's Triads, Newlands' Law of Octaves",
                "Mendeleev's Periodic Table — merits and limitations",
                "Modern Periodic Table — periods and groups",
                "Trends in modern periodic table: atomic size, metallic/non-metallic character, valency"
              ],
              "exam_tip": "Lowest marks Chemistry chapter. Compare Mendeleev vs Modern periodic table. Position of hydrogen controversy. Trends in periodic table."
            }
          ]
        },
        "biology": {
          "theory_marks": 27,
          "percentage_of_theory": "33.75%",
          "chapters": [
            {
              "chapter_no": 6,
              "title": "Life Processes",
              "approx_marks": 8,
              "priority": "HIGH",
              "topics": [
                "Nutrition: autotrophic (photosynthesis — equation, conditions, stomata) and heterotrophic (holozoic, parasitic, saprophytic, symbiotic)",
                "Nutrition in humans — alimentary canal, digestive glands",
                "Respiration: aerobic and anaerobic, cellular respiration, ATP",
                "Respiration in plants vs humans",
                "Transportation in plants: xylem (water), phloem (food), transpiration",
                "Transportation in humans: heart structure, blood vessels, blood composition, lymph",
                "Excretion in humans: kidneys, nephron, dialysis",
                "Excretion in plants: stomata, diffusion"
              ],
              "exam_tip": "Highest marks Biology chapter. Photosynthesis equation, heart diagram, nephron diagram are asked every year. Know all 4 life processes in depth."
            },
            {
              "chapter_no": 7,
              "title": "Control and Coordination",
              "approx_marks": 6,
              "priority": "HIGH",
              "topics": [
                "Nervous system: neurons, types of neurons, synapse",
                "Human brain: cerebrum, cerebellum, medulla oblongata",
                "Reflex action and reflex arc — diagram",
                "Involuntary vs voluntary actions",
                "Plant hormones: auxin, gibberellin, cytokinin, abscisic acid",
                "Tropic movements in plants: phototropism, geotropism, hydrotropism, chemotropism",
                "Human endocrine system: pituitary, thyroid, adrenal, pancreas, gonads",
                "Hormones: insulin, adrenalin, thyroxine, growth hormone",
                "Difference between nervous and hormonal control"
              ],
              "exam_tip": "Reflex arc diagram and difference between nervous vs hormonal control are very frequently asked. Know all plant hormones and their functions."
            },
            {
              "chapter_no": 8,
              "title": "How do Organisms Reproduce?",
              "approx_marks": 5,
              "priority": "MEDIUM",
              "topics": [
                "Asexual reproduction: fission (binary and multiple), budding, spore formation, vegetative propagation, fragmentation, regeneration",
                "Sexual reproduction in flowering plants: flower structure, pollination, fertilization, fruits and seeds",
                "Reproduction in humans: male reproductive system, female reproductive system",
                "Menstrual cycle",
                "Fertilization and embryo development",
                "Reproductive health and contraception"
              ],
              "exam_tip": "Human reproductive system diagrams come frequently. Difference between sexual and asexual reproduction. Pollination types."
            },
            {
              "chapter_no": 9,
              "title": "Heredity and Evolution",
              "approx_marks": 3,
              "priority": "MEDIUM",
              "topics": [
                "Heredity and variation",
                "Mendel's experiments: monohybrid cross (3:1), dihybrid cross (9:3:3:1)",
                "Dominant and recessive traits",
                "Sex determination in humans (XX and XY)",
                "Evolution: gradual change over generations",
                "Charles Darwin's theory of natural selection",
                "Speciation",
                "Fossils as evidence of evolution",
                "Acquired vs inherited traits"
              ],
              "exam_tip": "Monohybrid cross problems (Punnett square) may appear in short or long answer. Sex determination mechanism (XX/XY) is frequently asked."
            },
            {
              "chapter_no": 15,
              "title": "Our Environment",
              "approx_marks": 3,
              "priority": "LOW",
              "topics": [
                "Ecosystem: components (biotic and abiotic)",
                "Food chains and food webs",
                "Trophic levels and energy flow (10% law)",
                "Biodegradable and non-biodegradable waste",
                "Ozone layer: formation and depletion",
                "Management of garbage"
              ],
              "exam_tip": "Definitions of ecosystem, food chain, trophic levels. Biodegradable vs non-biodegradable examples. Ozone depletion causes (CFCs)."
            },
            {
              "chapter_no": 16,
              "title": "Sustainable Management of Natural Resources",
              "approx_marks": 2,
              "priority": "LOW",
              "topics": [
                "Natural resources: forests, wildlife, water, coal, petroleum",
                "Stakeholders in forest management",
                "Chipko movement",
                "Sustainable development",
                "Water conservation methods: dams, watershed management, rainwater harvesting",
                "Coal and petroleum conservation",
                "The 3 Rs: Reduce, Reuse, Recycle"
              ],
              "exam_tip": "Lowest marks Biology chapter. Chipko movement and Khejri tree protection (Bishnoi community). Advantages and disadvantages of dams. 3 Rs definition."
            }
          ]
        }
      }
    },
    "social_science": {
      "display_name": "Social Science (Samajik Vigyan)",
      "total_marks": 100,
      "theory_marks": 80,
      "internal_marks": 20,
      "overall_passing": 30,
      "theory_passing": 33,
      "paper_type": "type2_theory_plus_practical",
      "note": "Social Science is currently outside Zuno's teaching scope. Exam pattern info only.",
      "subjects_breakdown": {
        "history": { "marks": 20, "chapters": 5 },
        "geography": { "marks": 20, "chapters": 7, "note": "Includes 5 marks map work" },
        "political_science": { "marks": 17, "chapters": 5 },
        "economics": { "marks": 17, "chapters": 5 },
        "disaster_management": { "marks": 6, "chapters": 3 }
      },
      "internal_assessment": {
        "pen_paper_tests": 10,
        "portfolio_project": 5,
        "viva_oral": 5,
        "total": 20
      }
    },
    "hindi": {
      "display_name": "Hindi",
      "total_marks": 100,
      "theory_marks": 100,
      "practical_marks": 0,
      "passing_marks": 33,
      "paper_type": "type1_pure_theory",
      "note": "Hindi is currently outside Zuno's teaching scope. Exam pattern info only.",
      "sections": {
        "section_a_objective": { "marks": 50, "content": "Grammar MCQs + Textbook-based MCQs" },
        "gadyansh_prose": { "marks": 10 },
        "padyansh_poetry": { "marks": 8 },
        "patra_lekhan": { "marks": 8 },
        "nibandh_essay": { "marks": 8 },
        "textbook_qa": { "marks": 16 }
      }
    },
    "english": {
      "display_name": "English",
      "total_marks": 100,
      "theory_marks": 100,
      "practical_marks": 0,
      "passing_marks": 33,
      "paper_type": "type1_pure_theory",
      "note": "English is currently outside Zuno's teaching scope. English marks excluded from division calculation.",
      "sections": {
        "section_a_objective": { "marks": 50, "content": "Grammar MCQs + Textbook MCQs" },
        "reading_comprehension": { "marks": 10 },
        "grammar_application": { "marks": 10 },
        "letter_writing_composition": { "marks": 10 },
        "textbook_qa_prose_poetry": { "marks": 20 }
      }
    },
    "sanskrit_urdu": {
      "display_name": "Sanskrit / Urdu (Language II)",
      "total_marks": 100,
      "theory_marks": 100,
      "practical_marks": 0,
      "passing_marks": 33,
      "paper_type": "type1_pure_theory",
      "note": "Sanskrit/Urdu is currently outside Zuno's teaching scope. Exam pattern info only.",
      "sections": {
        "section_a_objective": { "marks": 50, "content": "Grammar + Textbook MCQs" },
        "section_b_subjective": { "marks": 50, "content": "Translation, Passages, Grammar, Composition" }
      }
    }
  }
}
```

### Phase 1A Verification:

After creating the file:
```
1. Confirm the file exists at: data/class-10/global/exam_patterns.json
2. Open the file and verify it is valid JSON (no syntax errors)
3. Verify the science section has all three subjects: physics, chemistry, biology
4. Verify biology has 6 chapters (ch 6, 7, 8, 9, 15, 16)
5. Verify physics chapter 10 approx_marks is 8 (highest)
6. Do NOT run npm run rag:index yet — that comes in Phase 6
```

---

## 5. PHASE 1B — Create science-overview.md

**Pre-conditions:** Phase 1A complete.  
**Risk:** Low — new markdown file, won't affect existing chunks until rag:index runs.  
**Reversible:** Yes — delete the file.

### What This File Provides

This file is indexed in the vector store and answers:
- "Science kya hai?" / "What is Science?"
- "Biology kya hai?" / "Jeev Vigyan kya hai?"
- "Chemistry kya hoti hai?"
- "Physics kya hai?"
- "Class 10 Science mein kya kya padhna hai?"
- "Zuno kya padha sakta hai?"
- "Physics aur Chemistry mein kya fark hai?"

### Directory

```
data/class-10/science/meta/
```

This folder does NOT exist yet. Create it.

The `meta/` folder name is deliberately chosen because:
- It is NOT in SECTION_RULES in markdownLoader.js (only chemistry/biology/physics are)
- This triggers the lenient `else` branch in validation
- chapter_no: 0 passes the `else` branch (only checks it is an integer)

### Frontmatter Requirements (CRITICAL — wrong values will fail validation)

```yaml
---
board: Bihar Board
class: 10
subject: Science
section: Meta
chapter_no: 0
original_science_chapter_no: 0
chapter_title: Science Introduction and Overview
language: English
source_type: cleaned_markdown
---
```

Field-by-field explanation:
- `board: Bihar Board` — MUST be exactly this string. Validator: `metadata.board !== 'Bihar Board'`
- `class: 10` — MUST be integer 10 (YAML parses unquoted 10 as integer). Validator: `metadata.class !== 10`
- `subject: Science` — Must exist, any non-empty string. No specific value check.
- `section: Meta` — Must exist. "meta" folder → else branch → no section-must-match-folder check
- `chapter_no: 0` — Must be integer. 0 is valid integer. Else branch: only integer check, no range check.
- `original_science_chapter_no: 0` — Must exist (not undefined/null). 0 is fine. No range check in else branch.
- `chapter_title: Science Introduction and Overview` — Must exist, any string.
- `language: English` — MUST be exactly "English". Validator: `metadata.language !== 'English'`
- `source_type: cleaned_markdown` — MUST be exactly "cleaned_markdown". Strict check.

### Content Structure Notes

The markdownChunker splits by headings (##, ###). Each heading + its content becomes a potential chunk.
Chunk merging: sections < 1200 chars get merged together. Write each section with ~400-600 words
minimum to ensure each section becomes its own chunk (giving better retrieval precision).

Heading text is embedded as part of each chunk. Write headings that semantically match
student queries: "What Is Biology" matches student query "biology kya hai" better than
a generic heading like "Biology Section".

### Complete File Content

**NOTE TO IMPLEMENTER:** When Phase 1B is reached, create this exact file:

```markdown
---
board: Bihar Board
class: 10
subject: Science
section: Meta
chapter_no: 0
original_science_chapter_no: 0
chapter_title: Science Introduction and Overview
language: English
source_type: cleaned_markdown
---

# Science Introduction and Overview

## What Is Science — Class 10 Overview

Science is the systematic study of the natural world. Scientists observe, ask questions, do experiments, and build explanations for how things work. Science is not just a school subject — it is a way of thinking and understanding the world around us.

In Bihar Board Class 10, Science is one of the most important subjects. It carries 100 marks in the final board exam. The subject is taught across an entire school year and covers topics from three major branches of natural science: Physics, Chemistry, and Biology.

Science at the Class 10 level is designed to build a strong foundation for students who want to go into engineering, medicine, research, agriculture, environmental studies, or any field that involves understanding how the natural world works.

Some fundamental ideas that run through all of Class 10 Science are: matter and energy, living systems and their processes, chemical transformations, forces and their effects, and the relationship between humans and their environment.

Class 10 Science is challenging but also deeply interesting because almost every topic connects directly to everyday life — why food gets cooked, how your eyes work, why metals rust, how electric current flows through wires, and how living things reproduce and pass traits to their children.

---

## What Is Biology — Life Science Branch

Biology is the branch of Science that studies living organisms — how they grow, reproduce, respond to their environment, and pass on characteristics to the next generation. The word "Biology" comes from the Greek words bios (life) and logos (study). So Biology is literally the study of life.

In Class 10, Biology is one of the three sections of Science. Biology answers questions like: How does a plant make food? How does the human heart pump blood? Why do children look like their parents? How do organisms reproduce? What happens to waste products in the body?

The Biology chapters in Class 10 are directly connected to real life — your own body's functions like digestion, breathing, blood circulation, excretion, and nervous system control are all covered in Biology. You also study reproduction in plants and humans, the laws of heredity discovered by Gregor Mendel, Darwin's theory of evolution, and how living organisms interact with their environment.

Class 10 Biology has 6 chapters from the original NCERT textbook — chapters 6 through 9, and chapters 15 and 16. These cover the four core life processes (nutrition, respiration, transportation, excretion), control and coordination by the nervous and endocrine systems, reproduction, heredity and evolution, and environmental science.

Biology carries approximately 27 marks in the theory paper (out of 80 theory marks). Life Processes is the highest-marks Biology chapter at approximately 8 marks.

---

## What Is Chemistry — The Science of Matter

Chemistry is the branch of Science that studies matter — what everything is made of, how matter changes, and what happens when different substances interact with each other. Chemistry explains why water is wet, why iron rusts, why medicines work, how fuels burn, and how plants grow.

In Class 10, Chemistry covers the core ideas that explain chemical change. You will learn how to write and balance chemical equations, how acids and bases behave, the properties of metals and non-metals, the rich chemistry of carbon compounds (which forms the basis of all organic chemistry), and how the periodic table organizes all known elements.

Chemistry is sometimes called the central science because it connects Physics (at the atomic and molecular level) with Biology (biochemical reactions in living systems). Understanding Chemistry gives you the foundation for medicine, pharmaceutical science, materials engineering, food science, and environmental chemistry.

Class 10 Chemistry has 5 chapters: Chemical Reactions and Equations, Acids Bases and Salts, Metals and Non-metals, Carbon and its Compounds, and Periodic Classification of Elements.

Chemistry carries approximately 26 marks in the theory paper (out of 80 total theory marks). Chemical Reactions, Acids/Bases/Salts, and Metals/Non-metals are each approximately 6 marks and are the highest-priority Chemistry chapters.

---

## What Is Physics — The Science of Energy and Forces

Physics is the branch of Science that studies the fundamental laws governing how the universe behaves — matter, energy, forces, and motion. While Chemistry asks what things are made of, and Biology asks how living things work, Physics asks how and why things move, interact, and exchange energy.

Physics explains how light travels and bends, how lenses form images, why your eyes can see, how electric current flows through circuits, how magnets attract and repel, how electric motors work, how generators produce electricity, and where our energy sources come from.

Many technologies that we use every day — electric motors, generators, light bulbs, lenses in cameras and spectacles, solar panels, nuclear power plants — are all based on Physics principles that you study in Class 10.

Class 10 Physics has 5 chapters: Light (Reflection and Refraction), Human Eye and the Colourful World, Electricity, Magnetic Effects of Electric Current, and Sources of Energy.

Physics carries approximately 27 marks in the theory paper (out of 80 theory marks). Light Reflection and Refraction is the highest-marks Physics chapter at approximately 8 marks, followed by Electricity at approximately 7 marks.

---

## How Class 10 Science Is Divided

Bihar Board Class 10 Science covers all three natural science branches under one subject. In the exam, all three branches appear in the same question paper — there are no separate Biology, Chemistry, or Physics papers.

The 80-mark theory paper distributes across the three branches approximately as follows:
- Physics contributes approximately 27 marks to the theory exam
- Chemistry contributes approximately 26 marks to the theory exam
- Biology contributes approximately 27 marks to the theory exam

The total paper is 100 marks — 80 marks for the written theory exam in the exam hall, and 20 marks for internal assessment done in school throughout the year.

In terms of chapters, Class 10 Science has 16 chapters total across the three branches. Physics has 5 chapters (including 2 environment-related chapters), Chemistry has 5 chapters, and Biology has 6 chapters. All chapters are from the NCERT Class 10 Science textbook.

---

## What Zuno Can Help You With

Zuno is your AI tutor for Bihar Board Class 10 Science. Zuno has studied all 16 chapters of Class 10 Science and can explain any concept, answer your doubts, re-explain things in simpler ways, and guide you through topics chapter by chapter.

The 16 chapters Zuno has indexed are:

Physics (5 chapters): Light Reflection and Refraction, Human Eye and the Colourful World, Electricity, Magnetic Effects of Electric Current, Sources of Energy.

Chemistry (5 chapters): Chemical Reactions and Equations, Acids Bases and Salts, Metals and Non-metals, Carbon and its Compounds, Periodic Classification of Elements.

Biology (6 chapters): Life Processes, Control and Coordination, How do Organisms Reproduce, Heredity and Evolution, Our Environment, Sustainable Management of Natural Resources.

You can ask Zuno questions in Hindi, Hinglish, or English. You can ask Zuno to explain a concept from scratch, give you examples, compare two topics, re-explain something you did not understand, or walk you through an entire chapter step by step.

Zuno does not answer questions about other subjects like Maths, Hindi, English, or Social Science — only Class 10 Science.

---

## Difference Between Physics Chemistry and Biology

Physics, Chemistry, and Biology are three different lenses for looking at the natural world.

Physics asks: How does it move? How does energy transfer from one place to another? What forces are acting? How do waves travel? Physics is about the rules that govern ALL matter and energy — not just living things, not just chemical reactions, but everything.

Chemistry asks: What is it made of at the atomic and molecular level? What happens when substances react? How do bonds form and break? Chemistry is about the composition and transformation of matter.

Biology asks: Is it alive? How does life sustain itself? How do organisms reproduce and pass on their characteristics? How do living things interact with each other and their environment? Biology is about the remarkable complexity of living systems.

The three branches overlap and support each other. Biochemistry uses Chemistry to understand Biology. Biophysics uses Physics principles to understand Biology. Physical Chemistry connects Physics and Chemistry. Understanding all three together gives you a complete picture of the natural world.

In Class 10, these three branches come together under the single subject called Science.
```

### Phase 1B Verification

After creating the file:
```
1. Confirm: data/class-10/science/meta/science-overview.md exists
2. Verify: frontmatter starts with --- and ends with ---
3. Verify: all 9 required YAML fields are present (board, class, subject, section,
   chapter_no, original_science_chapter_no, chapter_title, language, source_type)
4. Verify: board is exactly "Bihar Board" (not "bihar board" or "BIHAR BOARD")
5. Verify: language is exactly "English"
6. Verify: source_type is exactly "cleaned_markdown"
7. Count headings: file has exactly 7 ## headings (7 sections → 7 chunks approximately)
8. Do NOT run rag:index yet — that comes in Phase 6
```

---

## 6. PHASE 2 — Create examKnowledgeService.js

**Pre-conditions:** Phase 1A complete (exam_patterns.json must exist).  
**Risk:** Low — new file, nothing calls it yet.  
**Reversible:** Yes — delete the file.

### Directory

```
backend/src/knowledge/
```

This folder does NOT exist yet. Create it.

### File Path
```
backend/src/knowledge/examKnowledgeService.js
```

### Path Calculation (CRITICAL — get this wrong and service crashes at startup)

File location: `backend/src/knowledge/examKnowledgeService.js`
Data needed: `data/class-10/global/exam_patterns.json`

```
from: backend/src/knowledge/
  ../ → backend/src/
  ../../ → backend/
  ../../../ → project root
  ../../../data/class-10/global/exam_patterns.json → CORRECT PATH
```

The `resolve(__dirname, '../../../data/class-10/global/exam_patterns.json')` computes
an absolute path at runtime regardless of where node is run from. Always use absolute
path (not relative) to avoid CWD-dependent failures.

### Design Decisions

**Why `readFileSync` at first call (lazy load) not at module import time?**
If the JSON file doesn't exist and someone imports the module (e.g., in a test),
a module-level `readFileSync` would crash the entire process. Lazy loading means
the error only occurs when `getExamContext()` is actually called.

**Why cache with `_cachedData`?**
The JSON file is static at runtime — it never changes while the server is running.
Reading it once and caching saves disk I/O on every exam query.

**Why return a formatted string instead of raw JSON?**
The tutorLLM receives `{retrievedContext}` as a text string. It must be human-readable
text. Raw JSON is harder for the LLM to parse and extract specific facts from.
The formatted string is pre-processed for the LLM to answer naturally from.

**Why include ALL subjects in the context (not just Science)?**
If a student asks "Maths kitne marks ka hai?", Zuno can answer the exam-pattern part
even though it cannot TEACH Maths. The formatted context includes all subjects but
the examInfoPrompt tells the LLM to only answer about available content.

Actually — the `getExamContext()` returns everything. The LLM extracts what's needed.

### Complete File Content

```javascript
/**
 * examKnowledgeService.js
 *
 * Provides Bihar Board exam pattern data to the Ask pipeline.
 * Called by step5.retrieveContent.js when intent === 'EXAM_INFO'.
 *
 * Data source: data/class-10/global/exam_patterns.json
 * This JSON file is NOT indexed by the RAG pipeline (indexPipeline.js only reads .md files).
 *
 * Why NOT in the vector store:
 *   Exam pattern data has exact numbers (marks). RAG retrieval is probabilistic —
 *   it could return wrong values. This service provides 100% deterministic lookup.
 *   Also: "Light chapter marks" query would retrieve OPTICS textbook chunks not marks data
 *   (Entity Conflict Bug) — keeping exam data outside vector store prevents this.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Absolute path to exam pattern JSON.
// backend/src/knowledge/ → ../../.. → project root → data/class-10/global/
const DATA_PATH = resolve(__dirname, '../../../data/class-10/global/exam_patterns.json');

let _cachedData = null;

const loadData = () => {
  if (_cachedData) return _cachedData;
  try {
    const raw = readFileSync(DATA_PATH, 'utf-8');
    _cachedData = JSON.parse(raw);
    console.log('[ExamKnowledgeService] exam_patterns.json loaded and cached.');
    return _cachedData;
  } catch (error) {
    console.error('[ExamKnowledgeService] Failed to load exam_patterns.json:', error.message);
    console.error('[ExamKnowledgeService] Expected path:', DATA_PATH);
    throw new Error(
      'Exam knowledge base unavailable. Ensure data/class-10/global/exam_patterns.json exists.'
    );
  }
};

// Formats a single chapter into readable lines for the LLM
const formatChapter = (ch) => {
  const priorityLabel =
    ch.priority === 'HIGH' ? '★ HIGH PRIORITY' :
    ch.priority === 'MEDIUM' ? '◆ MEDIUM PRIORITY' : '● LOW PRIORITY';

  const lines = [
    `  Chapter ${ch.chapter_no}: ${ch.title}`,
    `  Approx marks: ~${ch.approx_marks} marks | ${priorityLabel}`,
  ];

  if (ch.topics && ch.topics.length > 0) {
    lines.push(`  Key topics: ${ch.topics.slice(0, 4).join(', ')}${ch.topics.length > 4 ? '...' : ''}`);
  }

  if (ch.exam_tip) {
    lines.push(`  Exam tip: ${ch.exam_tip}`);
  }

  return lines.join('\n');
};

/**
 * Returns the full Bihar Board Class 10 exam pattern as a formatted string.
 * This string is injected into the tutor LLM as {retrievedContext}.
 * The LLM reads it and answers the student's specific exam question.
 *
 * @returns {string} Formatted exam pattern context (~600-700 tokens)
 */
export const getExamContext = () => {
  const data = loadData();
  const sci = data.subjects.science;
  const pt = data.paper_types;
  const gen = data.general_rules;
  const div = data.division_system;

  const lines = [
    `[Bihar Board Class 10 — Exam Pattern ${data._meta.exam_year}]`,
    `Source: ${data._meta.source}`,
    `Accuracy note: ${data._meta.accuracy_note}`,
    '',
    '════════════════════════════════════════',
    'GENERAL EXAM RULES (All Subjects)',
    '════════════════════════════════════════',
    `Total subjects: ${gen.total_subjects} | Total marks: ${gen.total_marks}`,
    `Passing per subject: ${gen.passing_per_subject} marks | Passing aggregate: ${gen.passing_aggregate}/${gen.total_marks}`,
    `Note: ${gen.note_english}`,
    `Division system: 1st Division (${div.first_division.minimum}+) | 2nd Division (${div.second_division.minimum}-${div.second_division.maximum}) | 3rd Division (${div.third_division.minimum}-${div.third_division.maximum}) | Fail (below ${div.fail.below})`,
    '',
    '════════════════════════════════════════',
    'SCIENCE (Vigyan) — 100 Marks',
    '════════════════════════════════════════',
    `Total marks: ${sci.total_marks} | Theory paper: ${sci.theory_marks} marks | Internal assessment: ${sci.internal_marks} marks`,
    `Passing: ${sci.overall_passing}/${sci.total_marks} overall | Theory minimum: ${sci.theory_passing}/${sci.theory_marks}`,
    '',
    'Science Paper Structure:',
    `  Section A (MCQ/OMR): ${pt.type2_theory_plus_practical.section_a.total_questions_given} questions given, attempt any ${pt.type2_theory_plus_practical.section_a.questions_to_attempt}, ${pt.type2_theory_plus_practical.section_a.marks_per_question} mark each = ${pt.type2_theory_plus_practical.section_a.total_marks} marks`,
    `    IMPORTANT: ${pt.type2_theory_plus_practical.section_a.important_rule}`,
    `  Section B (Short Answer): ${pt.type2_theory_plus_practical.section_b.total_questions_given} questions given, attempt any ${pt.type2_theory_plus_practical.section_b.questions_to_attempt}, ${pt.type2_theory_plus_practical.section_b.marks_per_question} marks each = ${pt.type2_theory_plus_practical.section_b.total_marks} marks`,
    `  Section C (Long Answer): ${pt.type2_theory_plus_practical.section_c.total_questions_given} questions given, attempt any ${pt.type2_theory_plus_practical.section_c.questions_to_attempt}, ${pt.type2_theory_plus_practical.section_c.marks_per_question} marks each = ${pt.type2_theory_plus_practical.section_c.total_marks} marks`,
    `  Section D (Internal Assessment): ${sci.internal_marks} marks (done in school, not in board exam hall)`,
    `    Internal breakdown: Experiments/Practicals (${sci.internal_assessment_breakdown.experiments_practicals.marks} marks) + Project File (${sci.internal_assessment_breakdown.project_file_record.marks} marks) + Viva Voce (${sci.internal_assessment_breakdown.viva_voce.marks} marks)`,
    '',
    'Science Subject-wise Theory Marks (out of 80):',
    `  Physics:   ${sci.subjects_breakdown.physics.theory_marks} marks (${sci.subjects_breakdown.physics.percentage_of_theory} of theory)`,
    `  Chemistry: ${sci.subjects_breakdown.chemistry.theory_marks} marks (${sci.subjects_breakdown.chemistry.percentage_of_theory} of theory)`,
    `  Biology:   ${sci.subjects_breakdown.biology.theory_marks} marks (${sci.subjects_breakdown.biology.percentage_of_theory} of theory)`,
    '',
    `── PHYSICS CHAPTERS (${sci.subjects_breakdown.physics.theory_marks} marks total) ──`,
    ...sci.subjects_breakdown.physics.chapters.map(formatChapter),
    '',
    `── CHEMISTRY CHAPTERS (${sci.subjects_breakdown.chemistry.theory_marks} marks total) ──`,
    ...sci.subjects_breakdown.chemistry.chapters.map(formatChapter),
    '',
    `── BIOLOGY CHAPTERS (${sci.subjects_breakdown.biology.theory_marks} marks total) ──`,
    ...sci.subjects_breakdown.biology.chapters.map(formatChapter),
    '',
    '════════════════════════════════════════',
    'OTHER SUBJECTS (Exam pattern only — Zuno does not teach these)',
    '════════════════════════════════════════',
    `Mathematics: ${data.subjects.mathematics.total_marks} marks pure theory | Passing: ${data.subjects.mathematics.passing_marks} marks`,
    `  Algebra+Trigonometry+Geometry = 60 marks combined (highest priority units)`,
    `Social Science: ${data.subjects.social_science.total_marks} marks (${data.subjects.social_science.theory_marks} theory + ${data.subjects.social_science.internal_marks} internal) | Passing: ${data.subjects.social_science.overall_passing} marks`,
    `Hindi: ${data.subjects.hindi.total_marks} marks pure theory | Passing: ${data.subjects.hindi.passing_marks} marks`,
    `English: ${data.subjects.english.total_marks} marks pure theory | Passing: ${data.subjects.english.passing_marks} marks (excluded from division calc)`,
    `Sanskrit/Urdu: ${data.subjects.sanskrit_urdu.total_marks} marks pure theory | Passing: ${data.subjects.sanskrit_urdu.passing_marks} marks`,
  ];

  return lines.join('\n');
};
```

### Phase 2 Verification

After creating the file:
```
1. Confirm file exists: backend/src/knowledge/examKnowledgeService.js
2. Quick Node.js test (run from backend/ folder):
   node --input-type=module <<'EOF'
   import { getExamContext } from './src/knowledge/examKnowledgeService.js';
   const ctx = getExamContext();
   console.log(ctx.substring(0, 500));
   console.log('---');
   console.log('Total chars:', ctx.length);
   EOF
3. Output should show Bihar Board exam pattern text (no errors)
4. Verify it includes "Science" section with all three subjects
5. Verify it includes chapter-level detail for physics, chemistry, biology
```

---

## 7. PHASE 3 — Update Decider (Prompt + Step 4)

**Pre-conditions:** Phases 1A, 1B, 2 complete.  
**Risk:** Medium — changes routing logic. Test thoroughly after this phase.  
**Reversible:** Yes — revert the two file changes.

### 7A. `backend/src/prompts/deciderPrompt.js`

#### What Changes and Where

The existing decider has 7 intents numbered 1-7. We add EXAM_INFO as #6,
shifting OUT_OF_CONTEXT to #7 and UNSAFE_OR_ABUSIVE to #8.

**Why EXAM_INFO before OUT_OF_CONTEXT?**
LLMs process classification lists top-to-bottom. An exam question like
"Science kitne marks ka hai?" is academic-sounding. Without EXAM_INFO clearly
defined before OUT_OF_CONTEXT, the LLM might hesitate between them and pick
OUT_OF_CONTEXT (wrong). With EXAM_INFO defined first and clearly, it has a
precise bucket.

**Why add to CONSERVATIVE BIAS RULES?**
The conservative bias rules are applied BEFORE intent matching. Rule #1 says
"Greeting + science keyword → CONCEPT_QUESTION". Without an explicit rule,
"Kya Life Processes se zyada marks aate hain Biology mein?" could be routed
to CONCEPT_QUESTION. We need a rule: "Marks/pattern question → EXAM_INFO".

#### Exact Change: INTENTS List

Find the INTENTS list in DECIDER_SYSTEM_TEXT. Currently it ends at:
```
6. OUT_OF_CONTEXT — ...
7. UNSAFE_OR_ABUSIVE — ...
```

Replace with:
```
6. EXAM_INFO — Student asks about Bihar Board Class 10 exam structure, marks,
   chapter importance for exam, passing criteria, or paper format.

   TRIGGERS — classify as EXAM_INFO when student asks ANY of these:
   - Marks a subject carries: "Science kitne marks ka?", "Biology ke marks", "Maths ka paper kitna?"
   - Chapter importance for exam: "Kaun sa chapter important hai?", "Konsa chapter zyada marks ka?"
   - Passing criteria: "Pass karne ke liye kitne chahiye?", "Minimum marks kya hai?", "Passing marks?"
   - Paper structure: "Section A mein kitne questions?", "MCQ kitne solve karne hain?"
   - Internal assessment: "Internal assessment kya hota hai?", "School ke marks kitne?"
   - Skip strategy: "Kaun sa chapter skip kar sakta hoon?", "Kya Electricity skip ho sakta?"
   - Chapter weight: "Life Processes se kitne marks aate hain?", "Electricity important hai kya exam ke liye?"
   - Overall exam info: "Exam ka pattern kya hai?", "Paper structure kya hai?"

   DISAMBIGUATION (CRITICAL):
   → "Light chapter ke marks?" = EXAM_INFO (asking about marks, not optics)
   → "Light ka reflection samjhao" = CONCEPT_QUESTION (asking science concept)
   → "Biology padhna hai" = CHOOSE_COURSE (wants to start studying, not asking marks)
   → "Life Processes samjhao" = CONCEPT_QUESTION (asking about the concept)
   → "Life Processes se kitne marks aate hain?" = EXAM_INFO (asking about exam marks)
   → "Exam mein kya kya aata hai Science mein?" = EXAM_INFO (asking exam coverage)

   searchQuery: MUST be null — Knowledge Service handles this, no vector search needed.

7. OUT_OF_CONTEXT — Any topic Zuno cannot currently help with. This includes:
   - Other Class 10 subjects CONTENT: Maths concepts, Hindi grammar, English essays, Social Science
   - Non-school topics: sports, entertainment, current events, personal questions
   Note: Do NOT classify as OUT_OF_CONTEXT if student is reacting to Zuno's previous reply.
   Note: EXAM PATTERN questions about any subject (marks, paper structure) are EXAM_INFO, NOT OUT_OF_CONTEXT.

8. UNSAFE_OR_ABUSIVE — Swear words, vulgarity, local insults, inappropriate content, OR mild
   rudeness/insults directed at Zuno. ("Bakwaas band karo", "Stupid AI", "Kuch nahi aata tujhe")
   → These are UNSAFE_OR_ABUSIVE, NOT OUT_OF_CONTEXT.
```

#### Exact Change: CONSERVATIVE BIAS RULES

Find the CONSERVATIVE BIAS RULES section. Currently it has rules 1-3.
Add rule 4:

```
4. Questions about marks, passing criteria, paper structure, or chapter importance for exam
   → EXAM_INFO. Do NOT classify as CONCEPT_QUESTION even if a science topic is mentioned.
   Examples: "Biology kitne marks ka?" → EXAM_INFO (not CONCEPT_QUESTION)
   "Life Processes skip kar sakta hoon?" → EXAM_INFO (not CONCEPT_QUESTION)
```

#### Exact Change: SEARCH QUERY RULES

The existing rule already says "All other intents: searchQuery must be null."
EXAM_INFO is covered by this. No change needed here.

### 7B. `backend/src/ask/step4.decideRetrieval.js`

**ONLY ONE CHANGE needed.** Add `'EXAM_INFO'` to the `VALID_INTENTS` Set.

Find this block:
```javascript
const VALID_INTENTS = new Set([
  'UNSAFE_OR_ABUSIVE',
  'GREETING',
  'CHOOSE_COURSE',
  'NEXT_STEP',
  'EXPLAIN_MORE',
  'CONCEPT_QUESTION',
  'OUT_OF_CONTEXT'
]);
```

Change to:
```javascript
const VALID_INTENTS = new Set([
  'UNSAFE_OR_ABUSIVE',
  'GREETING',
  'CHOOSE_COURSE',
  'NEXT_STEP',
  'EXPLAIN_MORE',
  'CONCEPT_QUESTION',
  'EXAM_INFO',
  'OUT_OF_CONTEXT'
]);
```

**Why is ONE change enough?**

`normalizeDecision()` logic for EXAM_INFO (with no other changes):
- `isKnownIntent` = true (EXAM_INFO now in VALID_INTENTS) ✓
- `intent` = 'EXAM_INFO' ✓
- `inScope` = true (not OUT_OF_CONTEXT, not UNSAFE) ✓
- `responseMode` = 'study_tutor' (LLM returns this; if not in VALID_RESPONSE_MODES, falls back to 'study_tutor') ✓
- `needsRetrieval` = false (only CONCEPT_QUESTION triggers RAG — this formula is already correct) ✓
- `searchQuery` = null (needsRetrieval is false, so null is returned) ✓

No changes needed to `normalizeDecision`. The existing logic handles EXAM_INFO perfectly.

### Phase 3 Verification

```
Start the server: cd backend && npm run dev (or node src/server.js)

Test 1: Ask "Science kitne marks ka hai?"
  Expected server log: [Step 4] intent: EXAM_INFO
  If you see: [Step 4] intent: CONCEPT_QUESTION → decider prompt needs adjustment
  If you see: [Step 4] intent: OUT_OF_CONTEXT → decider classification is wrong, re-check prompt

Test 2: Ask "Biology mein kaun sa chapter important hai?"
  Expected: intent: EXAM_INFO

Test 3: Ask "Photosynthesis kya hai?"
  Expected: intent: CONCEPT_QUESTION (existing behavior must NOT break)

Test 4: Ask "Chemistry padhna hai"
  Expected: intent: CHOOSE_COURSE (existing behavior must NOT break)

Test 5: Ask "Hello"
  Expected: intent: GREETING (existing behavior must NOT break)

After Phase 3 ONLY (before Phase 4): EXAM_INFO queries will get intent:EXAM_INFO
but then fall through to the `if (!needsRetrieval)` block in step5 and return
NO_RETRIEVED_CONTEXT. The tutor will say "material not available." This is EXPECTED
at this stage — Phase 4 fixes this.
```

---

## 8. PHASE 4 — Update step5.retrieveContent.js

**Pre-conditions:** Phases 1A, 2, 3 complete (exam_patterns.json and examKnowledgeService.js must exist).  
**Risk:** Medium — modifying the retrieval step. But the change is additive (new branch).  
**Reversible:** Yes — remove the EXAM_INFO block and the import.

### What Changes

Two changes to `backend/src/ask/step5.retrieveContent.js`:

**Change 1: Add import at the top of the file (after existing imports):**
```javascript
import { getExamContext } from '../knowledge/examKnowledgeService.js';
```

**Change 2: Add EXAM_INFO branch**

Find this section (after the EXPLAIN_MORE block, before the `if (!needsRetrieval)` check):
```javascript
  // Short-circuit routing check
  if (!needsRetrieval) {
    console.log('[Step 5 Bypassed] Skipping vector database lookups...');
    return {
      retrieval: null,
      chunks: [],
      sources: [],
      retrievedContext: 'NO_RETRIEVED_CONTEXT',
    };
  }
```

INSERT the following BEFORE that block:
```javascript
  // EXAM_INFO: deterministic knowledge base lookup — bypasses vector search entirely.
  // examKnowledgeService reads data/class-10/global/exam_patterns.json (not in vector store).
  // Returns formatted context string injected into the tutor LLM as {retrievedContext}.
  // Step 6 (tutor LLM) does not need to know this came from JSON, not vector search.
  if (intent === 'EXAM_INFO') {
    console.log('[Step 5 EXAM_INFO] Knowledge Service lookup — no vector search');
    const examContext = getExamContext();
    return {
      retrieval: null,
      chunks: [],
      sources: [],
      retrievedContext: examContext,
      nextTopicSignal: null,
      lastRetrievalQuery: null,
    };
  }
```

**Why `sources: []`?**
The frontend `SourceChips` component shows "from which chapter" chips based on `sources`.
Exam pattern data has no chapter source. Empty array = no source chips shown = correct.

**Why `nextTopicSignal: null`?**
nextTopicSignal is for NEXT_STEP intent (tracking curriculum progress). EXAM_INFO
is a stateless query — no curriculum state changes.

**Why `lastRetrievalQuery: null`?**
lastRetrievalQuery is used by EXPLAIN_MORE to re-retrieve the same topic.
If a student says "dubara samjhao" after an EXAM_INFO answer, `lastRetrievalQuery: null`
means EXPLAIN_MORE will fall back to `lastTopic`. The tutor will ask "Kaunsa topic tha?"
which is reasonable — the student can clarify what they want re-explained.

**Why insert BEFORE `if (!needsRetrieval)` and not after?**
For EXAM_INFO: `needsRetrieval` = false. If we don't intercept before that check,
EXAM_INFO would fall into the `!needsRetrieval` branch and return NO_RETRIEVED_CONTEXT.
The tutor would say "material not available." Inserting BEFORE prevents this.

**The complete insertion point in context:**
```
... (EXPLAIN_MORE block ends here) ...

  ← INSERT EXAM_INFO BLOCK HERE

  // Short-circuit routing check
  if (!needsRetrieval) {    ← This already exists, do not remove
    ...
  }

  // Vector search (CONCEPT_QUESTION)  ← This already exists, do not remove
  const retrieval = await retrieveRelevantChunks(...)
```

### Phase 4 Verification

```
Start/restart server.

Test 1: Ask "Science kitne marks ka hai?"
  Expected server logs:
    [Step 4] intent: EXAM_INFO
    [Step 5 EXAM_INFO] Knowledge Service lookup — no vector search
    [ExamKnowledgeService] exam_patterns.json loaded and cached.  ← first time only
  Expected response: Contains actual marks numbers (100, 80, 20, 30)
  NOT expected: "material not available" message

Test 2: Ask "Biology mein kaun sa chapter important hai?"
  Expected response: Lists Biology chapters with marks and HIGH/MEDIUM/LOW priority
  NOT expected: Life Processes textbook content

Test 3: Ask "Passing marks kya hai?"
  Expected response: 30 per subject, 150 aggregate mentioned
  
Test 4: Ask "Photosynthesis kya hai?" (regression)
  Expected: Normal science concept answer (CONCEPT_QUESTION path unchanged)
  Server log should show: vector search running (NOT EXAM_INFO log)
  
Test 5 (USE_INTENT_ROUTER=false path): If legacy path is active, EXAM_INFO still
  works — the legacy tutorPrompt gets exam context and answers from it using
  Strict Grounding. Response quality may be slightly different but answer is correct.
```

---

## 9. PHASE 5 — Response Generation Layer

**Pre-conditions:** All previous phases complete. EXAM_INFO queries now return exam context.  
**Risk:** Medium — adds new intent to intentRouter.js.  
**Reversible:** Yes — remove EXAM_INFO entries from intentRouter.js and delete examInfoPrompt.js.

**IMPORTANT:** This phase is only fully active when `USE_INTENT_ROUTER=true` in .env.
If USE_INTENT_ROUTER is not set or false, the legacy path handles EXAM_INFO using
the general tutorPrompt (which works, just less optimized).

### 9A. Create `backend/src/prompts/intents/examInfoPrompt.js`

**Why a dedicated prompt instead of reusing conceptQuestionPrompt?**
- conceptQuestionPrompt has "insufficient_context" case → EXAM_INFO never has empty context (Knowledge Service always returns data). This rule would confuse the LLM.
- ANTI-REPETITION rule → not needed for exam facts (facts don't change)
- conceptQuestionPrompt has "focusChapter" and "lastStudyResponse" variables → examInfoPrompt doesn't need these
- Tone should be advisory/strategic, not textbook-teacher style

**Complete file content:**

```javascript
/**
 * examInfoPrompt.js
 *
 * Intent: EXAM_INFO
 * When: Student asks about Bihar Board Class 10 exam marks, paper pattern,
 *       chapter importance, passing criteria, or internal assessment.
 *
 * Uses corePersona: YES (same Zuno identity)
 * History window:   0 — exam facts are stateless, no prior conversation context needed
 * RAG context:      NO — {retrievedContext} comes from examKnowledgeService.js (not vector search)
 * Curriculum:       NO — not needed
 * Language:         YES — follows {answerLanguageInstruction}
 *
 * {retrievedContext} here is a pre-formatted string from exam_patterns.json.
 * The LLM treats it like any other retrieved context — answers from it directly.
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { corePersonaText } from './corePersona.js';

const EXAM_INFO_SPECIFIC_TEXT = `The student is asking about Bihar Board Class 10 exam structure — marks, chapters, paper pattern, or passing criteria.

You have been given the official Bihar Board exam pattern data. Use ONLY this data to answer.

ANSWERING RULES:
- Answer ONLY from the provided exam pattern data. Do not add exam tips, study strategies, or anything not in the data.
- Be specific and direct. If asked about marks, state the exact or approximate number from the data.
- When mentioning chapter marks, always add the priority level (HIGH/MEDIUM/LOW) — it helps the student know where to focus.
- If the data says "Approx marks", mention that it is approximate (BSEB does not officially publish exact per-chapter marks).
- If a question is about a subject Zuno does not teach (Maths, Hindi, English, Social Science), answer ONLY the exam pattern part (marks, paper structure). Do NOT attempt to explain the subject content.
- Keep answers short and practical — students asking exam questions want clear, actionable facts.

TONE:
- Sound like a knowledgeable senior student who has studied the exam pattern carefully.
- Be direct, practical, and slightly encouraging ("High priority chapters cover karo pehle").
- One brief strategic note is good ("Life Processes highest marks hai — wahan se shuru karo").
- Do NOT be preachy or add unsolicited study advice beyond what the student asked.

JSON OUTPUT (return this exact structure, no extra text):
{{"status": "answered", "responseMode": "study_tutor", "title": "Short title about what exam info is being given", "sections": [{{"heading": "Section heading in target language", "content": "Answer here in target language"}}], "suggestedActions": [{{"type": "next_topic", "label": "Short practical next step"}}], "memoryUpdate": {{}}}}

memoryUpdate: Always empty object {{}} — exam queries do not change the student's study progress state.
suggestedActions: Suggest practical next steps (e.g., "Biology chapters dekhein", "Life Processes shuru karein").`;

const EXAM_INFO_SYSTEM_TEXT = `${corePersonaText}

${EXAM_INFO_SPECIFIC_TEXT}`;

export const examInfoPrompt = ChatPromptTemplate.fromMessages([
  ['system', EXAM_INFO_SYSTEM_TEXT],
  [
    'human',
    `Student message: {message}

Answer language instruction: {answerLanguageInstruction}

Bihar Board Class 10 Exam Pattern Data (use ONLY this as your source):
{retrievedContext}

Return the JSON response.`,
  ],
]);
```

### 9B. Update `backend/src/ask/intentRouter.js`

**Four targeted changes. Make them in this order.**

**Change 1: Add import (at top of file, after existing imports)**
```javascript
import { examInfoPrompt } from '../prompts/intents/examInfoPrompt.js';
```

**Change 2: Add to INTENT_CONFIG**

Find:
```javascript
const INTENT_CONFIG = {
  GREETING:          { prompt: greetingPrompt,        temperature: 0.5, maxTokens: 300  },
  OUT_OF_CONTEXT:    { prompt: redirectPrompt,        temperature: 0,   maxTokens: 100  },
  UNSAFE_OR_ABUSIVE: { prompt: unsafePrompt,          temperature: 0,   maxTokens: 100  },
  CHOOSE_COURSE:     { prompt: chooseCoursePrompt,    temperature: 0.2, maxTokens: 600  },
  EXPLAIN_MORE:      { prompt: explainMorePrompt,     temperature: 0.3, maxTokens: 1500 },
  CONCEPT_QUESTION:  { prompt: conceptQuestionPrompt, temperature: 0,   maxTokens: 1500 },
  NEXT_STEP:         { prompt: nextStepPrompt,        temperature: 0.1, maxTokens: 1200 },
};
```

Add EXAM_INFO entry (place it after CONCEPT_QUESTION):
```javascript
  CONCEPT_QUESTION:  { prompt: conceptQuestionPrompt, temperature: 0,   maxTokens: 1500 },
  EXAM_INFO:         { prompt: examInfoPrompt,        temperature: 0,   maxTokens: 600  },
```

Why `temperature: 0`? Exam facts are deterministic — we want the same accurate answer every time.
Why `maxTokens: 600`? Exam answers are short: marks numbers, chapter lists, brief strategic note. 600 is generous.

**Change 3: Add to HISTORY_WINDOW**

Find:
```javascript
const HISTORY_WINDOW = {
  GREETING:          4,
  OUT_OF_CONTEXT:    0,
  ...
};
```

Add EXAM_INFO:
```javascript
  CONCEPT_QUESTION:  6,
  EXAM_INFO:         0,   // ← add this
  NEXT_STEP:         2,
```

Why 0? "Biology kitne marks ka?" doesn't need to know what was discussed 3 turns ago.
Sending 0 history = fewer tokens per exam query = faster, cheaper.

**Change 4: Add case in buildPromptInput switch**

Find the switch block and add after the CONCEPT_QUESTION case:
```javascript
    case 'EXAM_INFO':
      return {
        message: question,
        answerLanguageInstruction: answerLang,
        retrievedContext,
      };
```

Why only these 3 variables? The examInfoPrompt template has exactly 3 slots:
`{message}`, `{answerLanguageInstruction}`, `{retrievedContext}`. No focusChapter, no
history, no curriculumSummary, no lastStudyResponse. Sending only what the template
needs prevents LangChain from throwing "missing variable" errors.

**CRITICAL CHECK:** After adding the case, verify the switch block has no
duplicate `case 'EXAM_INFO':`. Each case must appear exactly once.

### Phase 5 Verification

```
This phase only fully applies when USE_INTENT_ROUTER=true in backend/.env.

If USE_INTENT_ROUTER=true:

Test 1: "Biology mein kaun sa chapter important hai?"
  Expected: Well-structured answer listing Biology chapters with marks and priority
  Expected format: Proper sections with headings, suggestedActions, empty memoryUpdate
  Server log: "[IntentRouter] EXAM_INFO → status:answered"
  NOT expected: chapters listed from curriculum index (that would mean CHOOSE_COURSE path)

Test 2: "Science exam mein kitne marks ka OMR sheet hota hai?"
  Expected: Section A info — 80 questions given, attempt 40, 1 mark each = 40 marks
  
Test 3: "Maths kitne marks ka hai?" (subject Zuno doesn't teach)
  Expected: Exam pattern info for Maths (100 marks, 7 units breakdown)
  NOT expected: "I cannot help with Maths" — exam pattern info is always answerable
  
Test 4: Regression — "Acid aur base ka fark batao"
  Expected: CONCEPT_QUESTION path, RAG retrieval, science concept answer
  NOT expected: EXAM_INFO
  
Test 5: Regression — "Hello, kaise ho?"
  Expected: GREETING response
  
Test 6: Check intentChains singleton works:
  Ask 2 EXAM_INFO questions in a row
  Second question should be faster (chain is cached)
  No "unknown intent" warnings in logs
```

---

## 10. PHASE 6 — Rebuild RAG Index

**Pre-conditions:** Phase 1B complete (science-overview.md exists).  
**Risk:** MEDIUM — wipes all existing chunks during rebuild. If pipeline fails mid-way, vector store is empty.  
**Reversible:** Re-run `npm run rag:index` to rebuild again.

### What Happens

```javascript
// indexPipeline.js does this in order:
1. Connect to MongoDB Atlas
2. Load ALL .md files from data/class-10/science/ (recursively)
   → Finds: biology/ (4 files) + chemistry/ (5 files) + physics/ (7 files) + meta/ (1 file)
   → Total: 17 markdown files (16 existing + 1 new overview file)
3. Chunk all 17 files
   → Expected: ~600 existing chunks + ~7-10 new overview chunks = ~607-610 total
4. DELETE ALL existing chunks: Chunk.deleteMany({})
   → Vector store is EMPTY at this point
5. Embed all ~610 chunks via Gemini API (in batches of 25, 5s sleep between batches)
   → Takes ~5-8 minutes
6. Insert all chunks into MongoDB
7. Disconnect
```

### Command

```bash
cd backend
npm run rag:index
```

Run from the `backend/` directory, not from project root.

### If the Pipeline Fails

If pipeline fails after step 4 (deleteMany) but before all batches insert:
- Vector store is partially empty or fully empty
- Server still runs but RAG queries return no results
- Fix: Identify the error (likely Gemini API rate limit → wait 1 minute), re-run `npm run rag:index`
- Do NOT restart the server — just re-run the index pipeline

### Phase 6 Verification

```bash
# After npm run rag:index completes:
npm run test:chunks      # Run from backend/
# Expected output: ~607-615 chunks (not 600)

npm run test:vector-store # Run from backend/
# Expected: chunk count matches test:chunks
```

Then test retrieval manually by starting the server and asking:
```
"Biology kya hai?"         → Should return overview content (NOT textbook Bio chapters)
"Science kya hoti hai?"    → Should return overview content
```

---

## 11. COMPLETE TESTING CHECKLIST

Run all tests after all 6 phases are complete.

### EXAM_INFO Path Tests (Category A)

| Query | Expected Intent | Expected Answer Contains |
|---|---|---|
| "Science kitne marks ka hai?" | EXAM_INFO | "100", "80 theory", "20 internal" |
| "Biology ke marks kitne hain?" | EXAM_INFO | "27 marks" |
| "Chemistry kitne marks ka hai?" | EXAM_INFO | "26 marks" |
| "Physics ke marks?" | EXAM_INFO | "27 marks" |
| "Passing marks kya hai?" | EXAM_INFO | "30", "33/80" |
| "Section A mein kitne MCQ?" | EXAM_INFO | "80 questions", "attempt 40" |
| "Biology mein kaun sa chapter important hai?" | EXAM_INFO | "Life Processes", "8 marks", "HIGH PRIORITY" |
| "Physics mein konsa chapter zyada marks ka?" | EXAM_INFO | "Light: Reflection and Refraction", "8 marks" |
| "Internal assessment kya hota hai?" | EXAM_INFO | "20 marks", "Experiments", "Viva" |
| "Life Processes se kitne marks aate hain?" | EXAM_INFO | "~8 marks" |
| "Electricity skip kar sakta hoon?" | EXAM_INFO | "7 marks", "HIGH PRIORITY" (don't skip) |
| "Maths kitne marks ka hai?" | EXAM_INFO | "100 marks" |

### Overview/Semantic Path Tests (Category B)

| Query | Expected Intent | Expected Answer |
|---|---|---|
| "Science kya hoti hai?" | CONCEPT_QUESTION | Overview content from RAG |
| "Biology kya hai?" | CONCEPT_QUESTION | Biology overview from RAG |
| "Chemistry kya hoti hai?" | CONCEPT_QUESTION | Chemistry overview from RAG |
| "Physics kya hai?" | CONCEPT_QUESTION | Physics overview from RAG |
| "Zuno kya padha sakta hai?" | CONCEPT_QUESTION | Overview of 16 chapters from RAG |
| "Physics aur Chemistry mein kya fark?" | CONCEPT_QUESTION | Comparison from RAG |

### Regression Tests (Must NOT Break)

| Query | Expected Intent | Verify |
|---|---|---|
| "Photosynthesis kya hai?" | CONCEPT_QUESTION | RAG retrieves Bio chapter chunks |
| "Ohm ka kanoon samjhao" | CONCEPT_QUESTION | RAG retrieves Electricity chunks |
| "Acid aur base ka fark" | CONCEPT_QUESTION | RAG retrieves Chemistry chunks |
| "Chemistry padhna hai" | CHOOSE_COURSE | Chapter list shown |
| "Aage badhao" | NEXT_STEP | Next topic in curriculum |
| "Nahi samjha, dubara batao" | EXPLAIN_MORE | Re-retrieves same topic |
| "Hello" | GREETING | Warm greeting response |
| "Cricket kya hai?" | OUT_OF_CONTEXT | Redirect to Science |

### Edge Case Tests

| Query | Expected | Reason |
|---|---|---|
| "Light se kitne marks aate hain?" | EXAM_INFO | "Light" is a physics topic but question is about marks |
| "Electricity important hai kya?" | EXAM_INFO | "Important" in exam context = EXAM_INFO |
| "Biology samjhao" | CONCEPT_QUESTION | No marks/exam keyword → science concept |
| "Konse chapter padhne chahiye?" | EXAM_INFO | Implicitly asking about exam importance |
| "Chapter 1 shuru karo" | CHOOSE_COURSE | Starting a chapter, not asking marks |

---

## 12. HIDDEN BUGS PRE-EMPTED

### Bug 1: Entity Conflict (Solved by Architecture)
"Light marks?" → was going to vector search → retrieves optics content → wrong answer
**Fix:** EXAM_INFO intent → Knowledge Service → NO vector search. Entity conflict impossible.

### Bug 2: Holistic Data Problem (Solved by Architecture)
Exam pattern chunked → top-K only returns partial pattern → incomplete answer
**Fix:** examKnowledgeService returns full formatted string, not individual chunks.

### Bug 3: Loader Validation for meta/ folder
meta/ folder not in SECTION_RULES → else branch → only integer check for chapter_no
→ `chapter_no: 0` and `original_science_chapter_no: 0` both pass
**Fix:** Confirmed safe by reading markdownLoader.js lines 209-215.

### Bug 4: indexPipeline wipes ALL chunks on rebuild
If pipeline fails mid-rebuild, vector store is empty.
**Fix:** Documented in Phase 6. If error occurs: fix error, re-run immediately.

### Bug 5: baseDataDir hardcoded to data/class-10/science
data/class-10/global/ is OUTSIDE this path → exam_patterns.json is never indexed.
This is CORRECT behavior — documented as intentional.

### Bug 6: EXAM_INFO missing from intentRouter.js INTENT_CONFIG
Would cause "Unknown intent → falling back to CONCEPT_QUESTION" warning.
CONCEPT_QUESTION then gets exam context → confusing answer.
**Fix:** Phase 5 adds EXAM_INFO to INTENT_CONFIG. Phase order matters.

### Bug 7: USE_INTENT_ROUTER=false (legacy path)
If intentRouter not active, EXAM_INFO goes to legacy tutorPrompt.
Legacy tutorPrompt uses Strict Grounding on {retrievedContext} = exam context.
LLM answers from exam data → works correctly (slightly less optimized tone).
**Fix:** Both paths handled. No action needed. But Phase 5 optimizes the answer.

### Bug 8: Chunk ID collision for future meta files
science-overview.md uses chapter_no: 0 → chunk IDs: "meta-chapter-00-chunk-001" etc.
A second meta file with chapter_no: 0 would create duplicate IDs.
**Fix (for future):** Any new meta files must use chapter_no: 97, 98, or 99.

### Bug 9: EXPLAIN_MORE after EXAM_INFO
Student: "Biology marks?" → "dubara samjhao" → EXPLAIN_MORE has lastRetrievalQuery=null
EXPLAIN_MORE falls back to lastTopic (from previous science session) or returns
NO_RETRIEVED_CONTEXT → tutor asks "Kaunsa topic tha? Batao toh clear kar deta hoon"
This is CORRECT behavior — student should clarify what they want re-explained.

### Bug 10: examInfoPrompt variable mismatch
If buildPromptInput passes a variable that examInfoPrompt template doesn't expect,
LangChain would throw a template variable error.
**Fix:** examInfoPrompt has exactly 3 slots: {message}, {answerLanguageInstruction}, {retrievedContext}
buildPromptInput EXAM_INFO case returns exactly these 3 keys. Verified by code.

### Bug 11: section_a total_questions_given for Science vs Maths
Maths uses Type 1 paper (100 MCQ / attempt 50). Science uses Type 2 (80 MCQ / attempt 40).
examKnowledgeService.js explicitly uses `pt.type2_theory_plus_practical.section_a.*` for Science.
And correctly shows different structures for Type 1 vs Type 2 in the JSON.

### Bug 12: readFileSync on startup vs lazy loading
Using lazy loading (inside `loadData()`) prevents crash if JSON file doesn't exist
when the module is imported during testing or development without data file.
**Fix:** Lazy load pattern implemented. Error thrown only when getExamContext() is called.

### Bug 13: Path resolution on Windows vs Linux
Using `resolve(__dirname, '../../../data/...')` with Node.js `path.resolve` is
cross-platform safe. The `fileURLToPath(import.meta.url)` correctly handles both
`file:///C:/` (Windows) and `file:///home/` (Linux) URL formats.

### Bug 14: Large exam context injected on every EXAM_INFO query (token concern)
Full exam context ≈ 700-800 tokens. Budget in examInfoPrompt: system (~300 tokens) +
context (~700 tokens) + question (~30 tokens) = ~1030 tokens input.
maxTokens: 600 for output. Total per EXAM_INFO request ≈ 1600-1700 tokens.
This is well within normal usage. No concern.

---

## 13. FILES SUMMARY

### New Files to CREATE

```
data/class-10/global/                              ← CREATE this folder
data/class-10/global/exam_patterns.json           ← Phase 1A (content in this plan)
data/class-10/science/meta/                        ← CREATE this folder
data/class-10/science/meta/science-overview.md    ← Phase 1B (content in this plan)
backend/src/knowledge/                             ← CREATE this folder
backend/src/knowledge/examKnowledgeService.js     ← Phase 2 (code in this plan)
backend/src/prompts/intents/examInfoPrompt.js     ← Phase 5 (code in this plan)
```

### Existing Files to MODIFY

```
backend/src/prompts/deciderPrompt.js              ← Phase 3A (add EXAM_INFO intent, update rules)
backend/src/ask/step4.decideRetrieval.js          ← Phase 3B (add 'EXAM_INFO' to VALID_INTENTS)
backend/src/ask/step5.retrieveContent.js          ← Phase 4 (add import + EXAM_INFO branch)
backend/src/ask/intentRouter.js                   ← Phase 5B (add import + 4 entries)
```

### Files That Do NOT Change

```
backend/src/ask/askOrchestrator.js   ← no change
backend/src/ask/step6.generateResponse.js ← no change
backend/src/ask/step7.saveAndRespond.js   ← no change
backend/src/rag/retriever.js         ← no change
backend/src/rag/indexPipeline.js     ← no change (data/global/ auto-excluded)
backend/src/rag/markdownLoader.js    ← no change
backend/src/models/*.js              ← no change
frontend/*                           ← no change
```

---

## 14. IMPLEMENTATION ORDER (STRICT)

```
Phase 1A → Create data/class-10/global/ and exam_patterns.json
Phase 1B → Create data/class-10/science/meta/ and science-overview.md
Phase 2  → Create backend/src/knowledge/ and examKnowledgeService.js
Phase 3  → Update deciderPrompt.js and step4.decideRetrieval.js
Phase 4  → Update step5.retrieveContent.js (add import + EXAM_INFO branch)
Phase 5  → Create examInfoPrompt.js and update intentRouter.js
Phase 6  → cd backend && npm run rag:index
Testing  → Run all cases from Section 11
```

**Gate Rule:** Do NOT proceed to next phase without running the verification for current phase.
If verification fails, fix the issue in current phase before moving forward.

---

## 15. ROLLBACK GUIDE

Each phase is independently reversible because all changes are ADDITIVE:

| Phase | Rollback Action |
|---|---|
| 1A | Delete `data/class-10/global/exam_patterns.json` and folder |
| 1B | Delete `data/class-10/science/meta/science-overview.md` and folder |
| 2 | Delete `backend/src/knowledge/examKnowledgeService.js` and folder |
| 3 | Revert `deciderPrompt.js` and `step4.decideRetrieval.js` to previous versions |
| 4 | Remove EXAM_INFO import and block from `step5.retrieveContent.js` |
| 5 | Delete `examInfoPrompt.js`, revert `intentRouter.js` (remove 4 changes) |
| 6 | Re-run `npm run rag:index` to rebuild from current state |

Phases 1-5 do NOT require re-indexing to roll back. Phase 6 only needs re-run
if you want to remove the overview.md content from the vector store after rollback of Phase 1B.
