/**
 * scienceGlossary.js
 *
 * English→Hinglish mapping for common Class 10 Science terms.
 * Injected into study-intent prompts (concept_question, explain_more, next_step,
 * exam_info, choose_course) via languageDetector.js so the LLM has explicit
 * translations for terms it would otherwise leak in English.
 *
 * PATTERN: 'english_term': 'hindi_transliteration (english_term)'
 *   - Student sees Hindi first (comprehension), then English (exam recognition).
 *   - Some terms stay as-is where English is universally understood
 *     (lens, pH, DNA, electron, hormone) — over-translation confuses more than helps.
 *
 * NOT included: chapter names (those come via focusChapterPrompt + curriculumSummary).
 */

export const SCIENCE_GLOSSARY = {
  // ─── Physics ──────────────────────────────────
  'reflection': 'paravartan (reflection)',
  'refraction': 'apvartan (refraction)',
  'mirror': 'darpan (mirror)',
  'image': 'pratibimb (image)',
  'focal length': 'naabhiik doori (focal length)',
  'magnification': 'aavardhan (magnification)',
  'concave': 'avatal (concave)',
  'convex': 'uttal (convex)',
  'electric current': 'vidyut dhara (electric current)',
  'resistance': 'pratirodh (resistance)',
  'potential difference': 'vibhavantaar (potential difference)',
  'circuit': 'parpath (circuit)',
  'magnetic field': 'chumbakiya kshetra (magnetic field)',
  'electromagnetic induction': 'vidyut chumbakiya preran (electromagnetic induction)',
  'renewable energy': 'navikarniya urja (renewable energy)',
  'solar energy': 'saurya urja (solar energy)',
  'spectrum': 'varna patt (spectrum)',
  'dispersion': 'vikiran (dispersion)',
  'pupil': 'putli (pupil)',

  // ─── Chemistry ────────────────────────────────
  'chemical reaction': 'rasayanik abhikriya (chemical reaction)',
  'chemical equation': 'rasayanik samikaran (chemical equation)',
  'oxidation': 'upchayan (oxidation)',
  'reduction': 'apchayan (reduction)',
  'acid': 'aml (acid)',
  'base': 'kshaar (base)',
  'salt': 'lavan (salt)',
  'indicator': 'suchak (indicator)',
  'metal': 'dhatu (metal)',
  'non-metal': 'adhatu (non-metal)',
  'alloy': 'mishradhatu (alloy)',
  'corrosion': 'sankharan (corrosion)',
  'carbon compound': 'carbon yaugik (carbon compound)',
  'homologous series': 'samjatiya shreni (homologous series)',
  'functional group': 'kriyaneel samuh (functional group)',
  'periodic table': 'avart sarni (periodic table)',
  'atomic number': 'parmanoo sankhya (atomic number)',
  'valency': 'sanyojkta (valency)',
  'element': 'tatva (element)',
  'compound': 'yaugik (compound)',

  // ─── Biology ──────────────────────────────────
  'photosynthesis': 'prakash sanshleshan (photosynthesis)',
  'respiration': 'shwasan (respiration)',
  'nutrition': 'poshan (nutrition)',
  'digestion': 'pachan (digestion)',
  'excretion': 'utsarjan (excretion)',
  'transportation': 'parivahan (transportation)',
  'autotrophic': 'swaposhi (autotrophic)',
  'heterotrophic': 'paraposhi (heterotrophic)',
  'neuron': 'tantrka koshika (neuron)',
  'reflex action': 'prativert kriya (reflex action)',
  'nervous system': 'tantrika tantra (nervous system)',
  'endocrine system': 'antahsravi tantra (endocrine system)',
  'reproduction': 'prajanann (reproduction)',
  'fertilization': 'nishechan (fertilization)',
  'pollination': 'paragnayan (pollination)',
  'heredity': 'anuvanshikta (heredity)',
  'evolution': 'vikas (evolution)',
  'variation': 'vibhinnata (variation)',
  'natural selection': 'prakritik chayan (natural selection)',
  'ecosystem': 'paristhitiki tantra (ecosystem)',
  'food chain': 'aahar shrinkhla (food chain)',
  'food web': 'aahar jaal (food web)',
  'biodegradable': 'jaivik apghataneeya (biodegradable)',
  'ozone layer': 'ozone parat (ozone layer)',
  'chlorophyll': 'haritlav (chlorophyll)',

  // ─── Common Science Verbs/Terms ───────────────
  'process': 'prakriya',
  'formed': 'banta hai',
  'produced': 'banaya jaata hai',
  'used': 'istemal hota hai',
  'known as': 'jaana jaata hai',
  'called': 'kehte hain',
  'occurs': 'hota hai',
  'contains': 'isme hota hai',
  'consists of': 'milke bana hai',
  'important': 'zaroori',
  'example': 'misal / udaharan',
  'different': 'alag',
  'because': 'kyunki',
  'therefore': 'isliye',
};

/**
 * Formats the glossary as a compact string for prompt injection.
 * No curly braces — this string is substituted into a LangChain
 * ChatPromptTemplate value slot, so it must stay template-syntax-free.
 */
export const formatGlossaryForPrompt = () =>
  Object.entries(SCIENCE_GLOSSARY)
    .map(([en, hi]) => `${en} -> ${hi}`)
    .join(' | ');
