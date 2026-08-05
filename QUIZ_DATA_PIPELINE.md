# Quiz Data Pipeline — Question Bank ka Foundation

> **Ye file `QUIZ_SYSTEM_BLUEPRINT.md` se PEHLE follow hogi.**
>
> Blueprint quiz ka *feature* banata hai. Ye file quiz ka *data* banati hai.
> Data pehle. Feature baad mein. Kachhe data pe feature banana sabse mehngi galti hoti hai.
>
> **Created:** 2026-08-03 · **Branch:** `quiz-phase0.5-bulk`
> **Rules:** `QUIZ_EXECUTION_PROTOCOL.md` (wahi 4 beats, wahi Parking Lot, wahi baseline test)
> **Live state:** `QUIZ_BUILD_LOG.md`

---

## 0. Ye file kab padhni hai

| Situation | Kya karna hai |
|---|---|
| Quiz ka data/question-bank ka koi bhi kaam | **Ye file** padho, phir Build Log |
| Quiz ka feature/UI/API ka kaam | Pehle check karo Stage G done hai ya nahi. Nahi hai → yahin ruko. |
| Confusion ki "kahan hain hum" | `QUIZ_BUILD_LOG.md` dekho, wahan current stage likha hoga |

---

## 1. Hum bana kya rahe hain

Ek **question bank** jisme Bihar Board Class 10 Science ke **2016 se 2026 tak ke saare papers** ho.

### Ye bank teen kaam karega

1. **Quiz** — chapter gate quiz + practice quiz (blueprint ka feature)
2. **Repeat insight** — "ye question 2016, 2019, 2022 mein aaya tha — 3 baar"
3. **Subjective practice** — bade sawaal, jo aage kisi feature mein use honge

### Teen language — non-negotiable

Har question, har option, har answer teen roop mein chahiye:

| Language | Kyun |
|---|---|
| **Hinglish** | App ki default language. Quiz by default isi mein chalega. |
| **Hindi (Devanagari)** | Future language toggle ke liye. Asli paper ki language. |
| **English** | Future language toggle ke liye. |

**Rule:** jis question mein teeno language poori nahi hain, wo quiz mein **nahi** jayega.
Ye rule schema mein enforce hoga (`usableInQuiz`), bharose pe nahi chhodenge.

---

## 2. Non-negotiable principles

Ye 8 rules poore pipeline ki neev hain. Inhe todna matlab baad mein sab dobara karna.

### P1 — Mehnga kaam ek baar

Sabse mehnga kaam: scanned page ko padhna.
Wo **ek baar** hoga, uska result disk pe **hamesha** ke liye save hoga.
Uske baad koi stage PDF ko haath nahi lagayegi.

### P2 — Stages immutable hain

Har stage apna output alag folder mein likhegi.
Agli stage sirf pichli stage ka output padhegi.
Stage 3 mein bug? Sirf stage 3 dobara chalao. Stage 1 safe rahega.

### P3 — Filename hi identity ka sach hai

`2019 a.pdf` → `paperId: 2019-a`. Bas.
PDF ke **andar** jo saal/shift likha ho, uspe **bharosa nahi**.

*Kyun:* extraction 3 baar galat saal/shift likh chuka hai (2018-A ko 2016-B bataya).
Identity kabhi extractor se nahi aayegi.

### P4 — Human ka kiya hua kaam kabhi nahi udega

Tumhare fixes `review/resolved.json` mein alag se save honge.
Pipeline dobara chalao — fixes apne aap wapas lag jayenge.

*Kyun:* warna har re-run tumhara ghanton ka kaam mita dega. Ye system ko unusable bana deta hai.

### P5 — Har stage dobara chalane pe wahi output de (idempotent)

- Koi random ID nahi
- Koi timestamp output file ke andar nahi (sirf report mein)
- JSON keys hamesha sorted
- Append kabhi nahi, hamesha full rewrite

*Kyun:* tabhi `git diff` padhne layak rahega, aur "kya badla" pakka pata chalega.

### P6 — ID kabhi nahi badlegi

Question ka text theek karne se uski ID nahi badlegi.
Content ka hash **kabhi ID nahi banega**.

*Kyun:* student ka progress, wrong-answer history, analytics — sab ID se jude honge.
ID badli = poora record toota.

### P7 — Git source of truth hai, database sirf copy

Final bank git mein rahega (JSON files).
MongoDB usi se seed hoga.
DB kabhi hand-edit nahi hoga.

*Kyun:* content ka har change review ho sakta hai, revert ho sakta hai, aur DB kabhi bhi scratch se rebuild ho sakta hai.

### P8 — Bharosa measure hoga, maana nahi jayega

Har answer ke saath likha hoga wo **kahan se aaya** aur **kitna pakka hai**.
Sirf pakka wala question hi student tak jayega.

### P9 — Pehle ek pe poora chalao, phir sab pe

Koi bhi bada kaam (jaise 370 pages padhna) shuru karne se pehle **ek** paper ko
shuru se aakhir tak le jao — Stage B se Stage G tak.

*Kyun:* agar tareeka hi galat hai, to wo 16 page ki mehnat mein pata chalega,
370 page ki mehnat ke baad nahi.

Ye Stage P hai (§7). **Ise skip karna sabse mehngi galti hogi.**

---

## 3. 🔍 AUDIT — pehle plan mein kya kami thi

Ye section imaandari ke liye hai. Pehla plan theek tha, par 20 jagah kamzor tha.

### 3.1 Do hard findings (asli data se, andaaza nahi)

#### 🔴 F1 — `2017 a.pdf` aur `2017 b.pdf` bilkul same file hain

MD5 hash dono ka same: `da3083d551861c6c26281103147ad2a5`

**Matlab humare paas 21 nahi, 20 unique papers hain.**

**Ye kyun khatarnak tha:** dono ko alag maan lete to har question ka repeat-count **jhootha +1** ho jata.
Aur repeat-count hi hamara headline feature hai. Feature apne hi data se galat ho jata.

**Fix:** Stage A mein hash-based paper dedup. `2017-b` ko `duplicate-of: 2017-a` mark karke skip karenge.

---

#### 🔴 F4 — `2019 a.pdf` asli exam paper hai hi nahi (Stage B batch 3, 2026-08-04)

Stage B mein khola to andar ek pura alag cheez nikli: **"Bihar Hints & Solution — CBSE Xth
Board Examination-2018-19"** naam ka third-party guide-book — sirf English, har MCQ ka sahi
option pehle se asterisk (\*) se marked, header pe "CBSE" likha hai (Bihar Board CBSE se
alag board hai). Ye humare baaki 19 papers jaisa scanned board-paper photocopy nahi hai.

**Matlab humare paas ab 20 nahi, 19 usable unique papers hain.** `2019-a` ko `2017-b` jaisa
treat kiya — permanently excluded, `stage1-pages/` mein iska folder kabhi nahi banega. User ne
2026-08-04 ko confirm kiya (option: skip, kyunki pipeline ka core principle hi verified real
exam text hai, aur ye document us tarah verify nahi ho sakta).

---

#### 🔴 F8 — `2023 b.pdf` **Social Science** ka paper hai, Science ka nahi (Stage B batch 8, 2026-08-05)

Stage B page-reading shuru karte hi (page 1, page 2 padhte waqt) pata chala: `2023 b.pdf` ek
asli Bihar Board Secondary School Examination — 2023 paper hai, par **Subject Code 111,
"SOCIAL SCIENCE (Compulsory) / सामाजिक विज्ञान"**. Page 2 ke Section-A objective questions
confirm karte hain — sab history/civics content hai (Vallabhbhai Patel kisan andolan, Khan
Abdul Ghaffar Khan, wagaira), Science se koi lena-dena nahi.

**F4 se fark:** F4 (`2019-a`) ek fake/third-party guide-book tha (asli exam paper hi nahi).
Ye genuine hai — asli Bihar Board paper, sahi saal (2023), par galat **subject**. Humare
`data/quiz-bank/pdfs/` folder mein galti se ek Social Science paper Science ke naam se aa gaya
(file naam `2023 b.pdf`, `2023-a` ke saath paired hone ki wajah se assume kiya gaya tha Science
hoga — survey script subject check nahi karta, sirf text-layer quality dekhta hai).

**Matlab humare paas ab 19 nahi, 18 usable unique papers hain.** `2023-b` ko `2019-a` jaisa
treat kiya — permanently excluded, `stage1-pages/` mein iska folder kabhi nahi banega. Koi page
file bani hi nahi thi (sirf page 1-2 scratchpad mein render hue, repo mein kuch save nahi hua) —
isliye koi git revert bhi nahi karna. User ne 2026-08-05 ko confirm kiya (option: exclude).

**Lesson for future papers:** Stage B ka pehla kaam ab hamesha **page 1 pe subject confirm
karna** hai, page-by-page padhna shuru karne se pehle — agla galat-subject paper mile to isी
tarah turant STOP + exclude.

---

#### 🔴 F2 — Kisi bhi paper se saaf Hindi (Unicode) nahi milti

Test kiya saare 7 text-papers pe. Unicode Devanagari count: **sab mein 0**.

| Paper | Unicode Hindi | Legacy font ke nishaan |
|---|---|---|
| 2018-b | 0 | 19 |
| 2021 | 0 | 102 |
| 2022 | 0 | 94 |
| 2023-a | 0 | **0** |
| 2023-b | 0 | **0** |
| 2025 | 0 | 116 |
| 2026 | 0 | 115 |

Do haalat hain:

- **5 papers** (2018-b, 2021, 2022, 2025, 2026): Hindi hai, par purane font code mein.
  Decode ho sakti hai — par mapping font-specific hoti hai. Galat mapping = **chupchap galat Hindi**.
  Chupchap galat data sabse bura data hai.
- **2 papers** (2023-a, 2023-b): Hindi hai hi nahi text mein. Bilkul khaali.

**Matlab: mera pehla plan galat tha.** Maine socha tha "7 papers script se ho jayenge".
Sach ye hai ki **7 mein se English ho jayegi, Hindi kisi se nahi**.

**Naya routing:**

> **Saare 20 papers page-image se padhe jayenge** (Hindi + English dono ke liye).
> Jin 7 mein text layer hai, wo text **cross-check** ke liye use hoga — replacement ke liye nahi.

**Chhupa hua faayda:** ab humare paas 7 papers ke liye **do independent source** hain.
Dono match kare = bahut zyada bharosa. Ye seedha L3 confidence level ban jata hai. Muft mein.

---

#### 🔴 F3 — Papers pe jo "answer" ke nishaan hain, wo **pen se lagaye hue hain — aur galat hain**

Pilot ke dauran `2016-a` ka MCQ page padha. Har MCQ ke ek option ke aage ek chhota **haath ka
nishaan** (pen tick) laga hua hai. Dekhne mein lagta hai ki ye answer key hai.

**Ye answer key nahi hai.** Ye kisi ne khud lagaya hai, aur usme galtiyan hain.

7 nishaan check kiye:

| Question | Nishaan | Sahi jawab | Verdict |
|---|---|---|---|
| (xiv) NaOH is | salt | **alkali** | 🔴 GALAT |
| (xv) Auxin is | a hormone | a hormone | ✅ |
| (xvi) not part of female repro. system | vas deferens | vas deferens | ✅ |
| (xvii) anther has | pollens | pollens | ✅ |
| (xix) largest gland of human body | adrenal | **liver** | 🔴 GALAT |
| (xx) phytohormone example | auxin | auxin | ✅ |

**7 mein se 2 galat.** Ye ~30% error rate hai.

Page pe `BiharPaper.com` ka watermark bhi hai — ye kisi website se download kiya hua paper hai,
board ki official answer key nahi.

**Ye kyun bahut khatarnak tha:**

Purani extraction (Antigravity wali) ne inhi pen-nishaano ko "printed answer key" maan liya tha.
Isi wajah se us JSON mein resistance ka unit **"Ampere"** likha aaya tha (sahi: Ohm).
Wo galti ab samajh aayi — wo AI ki galti nahi thi, wo **paper pe lage galat nishaan** the.

**Fix — Stage E ka rule badla:**

> Page pe haath se lage nishaan **kabhi** answer ka source nahi maane jayenge.
>
> `answer.source` mein `"handwritten-mark"` naam ka option hai hi nahi.
>
> Scanned papers ke answers sirf yahan se aayenge:
> 1. **Official printed answer key** (agar paper mein sach mein chhapi hui hai)
> 2. **Repeat question** — doosre saal ka wahi question jiska answer pakka hai
> 3. **Textbook verification** — Zuno ke RAG se `data/class-10/science/` ke against
>
> Agar teeno mein se kuch nahi mila → `answer.source: "none"`, `usableInQuiz: false`.
> Galat answer dene se accha hai koi answer na dena.

Agar kisi paper mein nishaan dikhe, to unhe **hint** ki tarah record kiya ja sakta hai
(`flags: ["handwritten-mark-present"]`) — par confidence kabhi L2 se upar nahi jayegi
bina independent verification ke.

---

#### 🟡 F5 — `2018-b` asli scan nahi hai, ek retyped Word document hai (Stage B batch 4, 2026-08-04)

`2018 b.pdf` baaki 6 papers jaisa scanned board-paper nahi nikla. Ye kisi ne Word mein khud
type kiya hua document hai (survey.json isse pehle se `route: "script"` mark kiya tha — text
layer mila tha):

- Poore 20 pages mein **Hindi kahin nahi** (baaki sab genuine papers bilingual hain)
- **Har sawaal ke turant baad "Ans: ..." print hua hai** — asli board paper mein aisa nahi hota
- Word ka autocorrect fire hua hai — "(C)" har jagah "©" ban gaya hai, poore document mein
- Ek sawaal (Q11) ke option C/D aur uska answer hi gayab hai, seedha agle sawaal pe jump ho gaya
- Koi Bihar Board letterhead, SI code, ya OMR/board signature kahin nahi

**F1/F4 se fark:** F1 (`2017-b`) exact duplicate tha, F4 (`2019-a`) galat board (CBSE) ka content
tha — dono **poore paper** ko bekaar banate hain. Ye alag hai: sawaal genuine Class-10-syllabus
content lagte hain, sirf **source primary scan nahi hai** aur answers **verify nahi hain**.

**User decision (2026-08-04):** paper exclude nahi hoga. Sawaal liye jayenge (extra 40 objective
mil jate hain bank mein) — par iske "Ans:" ko kabhi `answer.source: "printed-key"` nahi maana
jayega. Yahi F3 ka rule hai (handwritten-mark bhi kabhi source nahi bana), bas trigger alag hai
(pen-mark ki jagah typed-inline-guess). Stage E in 40 answers ko textbook/repeat route se hi
verify karega, jaise koi printed key hi nahi ho.

**Chhupa hua faayda:** kyunki ye native-text PDF hai (scan nahi), iska text layer khud hi
sabse saaf transcription hai — PyMuPDF se seedha nikala, phir vision se page-by-page cross-check
kiya (match confirm hua). Isliye `readBy: "both"` har page pe, F2 ke "muft L3-jaisa bharosa" wale
tareeke se — bas answer field is bharose se bahar hai (upar wala rule).

---

#### 🔴 F6 — Ek hi lambi conversation mein bahut saare pages padhna token-usage ko explode kar deta hai (Stage B batch 6, 2026-08-05)

Batch 5 (`2020-b`+`2021`, 55 pages) aur batch 6 (`2022`+`2025` ka attempt) **ek hi continuous
conversation** mein hue — session ka koi restart nahi hua beech mein. Batch 5 khatam hote-hote
already **70% token quota** use ho chuka tha. Batch 6 shuru karte hi (`2022` ke 27 pages padhte
hue) baaki 30% bhi khatam ho gaya, aur **usage-limit error** aaya. 5-ghante quota-reset ke baad
dobara try kiya — is baar **aur bhi tezi se** (sirf kuch minute mein) 100% khatam ho gaya, kaam
poora hone se pehle hi.

**Root cause:** har Stage B page-read ek **vision image** (200 DPI PNG) load karta hai context
mein — ye ek image hi kaafi tokens (~1500-2000+) leti hai. Conversation jitni lambi hoti jaati
hai, har naya reply model ko **poori purani history dobara process karni padti hai** — sirf naya
page nahi, balki ab tak ke saare purane images + unke JSON transcriptions bhi. Isliye cost linear
nahi, **snowball** ki tarah badhta hai: page 1 sasta, page 50 mehnga, page 80+ itna mehnga ki
2-3 pages mein hi bacha hua quota khatam ho jaata hai.

**Ye ek data-quality issue nahi hai** — jitne pages padhe gaye unki JSON files disk pe safe hain
(Write tool har page ke baad turant save karta hai), koi kaam nahi khoya. Sirf **session ka size**
galat tha.

**Fix — batching rule badla:**

> Har naya Stage B **paper fresh session/conversation mein shuru hoga**, purani conversation ke
> upar continue nahi karenge — chahe kitna hi token quota bacha kyun na dikhe. Ek session mein
> ek naya paper poora karna hai (1 paper ≈ 20-40 pages), do papers ek session mein tabhi jab
> dono chhote hon (jaise 2016-b + 2016-c, 8+8 pages). §11 ka purana "2-3 papers per session"
> estimate paper-count pe based tha, conversation-length pe nahi — real constraint image-token
> accumulation hai, isliye guidance ab **"1 fresh session = 1 naya paper"** hai jab tak paper
> chhota (≤20 pages) na ho.

Parking Lot mein nahi gaya kyunki ye Stage B ke tareeke ko seedha badalta hai — turant yahan
likha gaya taaki agla session isi rule se chale.

---

#### 🟡 F7 — `2023-a` PDF genuinely incomplete: cover declares 48 printed pages, PDF has only 42 (Stage B batch 7, 2026-08-05)

`2023 a.pdf` ka cover page (page 1) khud declare karta hai "Total Printed Pages : 48", par
PyMuPDF se verify karne par PDF mein **sirf 42 pages** hain. Do independent signals confirm karte
hain ki ye ek reading/scan problem nahi, balki source hi incomplete hai:

1. **Page 23 pe Q43 ki jagah ek literal placeholder mila** — source ke andar hi yellow-highlighted
   text "43. question missing" print hai (Hindi aur English dono block mein), na koi sawaal na
   options. Ye khud compiler ne flag kiya hua gap hai.
2. **Section-B achanak beech mein khatam ho jaata hai** — Section A (80/80 objective) poora hai,
   par Section B (subjective, 30 marks declared: Physics+Chemistry+Biology short+long) sirf
   Physics short-answer Q1-3 (of 8) tak jaake PDF khatam ho jaata hai. Physics Q4-8+long-answer,
   aur poora Chemistry+Biology subjective section missing hai.

**F5 se fark:** F5 (`2018-b`) poora paper retyped tha par **complete** tha. Ye alag hai — ye bhi
retyped/compiled lagta hai (F7 ka signal #1 isi ki taraf ishara karta hai), par compiler khud
**beech mein ruk gaya**, poora nahi kiya.

**Impact:** `2023-a` objective section (Q1-80) ke liye **100% usable hai** — quiz ka primary
source objective questions hain, isliye ye paper bank mein poora count hoga. Subjective section
sirf partial hai (Physics Q1-3 of 8) — future kisi subjective-question phase mein iska use karte
waqt ye incompleteness yaad rakhni hai. Stage B ka koi rework nahi chahiye — jo mila wahi likha
gaya (rule "jo dikha wahi likho" ke mutabik), missing content guess nahi kiya gaya.

---

### 3.2 Plan mein jo 18 kamiyan mili aur unka fix

| # | Kami | Fix |
|---|---|---|
| A1 | Schema define hi nahi kiya tha — har stage apna shape bana leti | §5 mein poora schema, `schemaVersion` ke saath |
| A2 | ID strategy nahi thi — text fix karne pe ID badal jati | §6 — do ID: `sourceId` (jagah se) + `questionId` (ledger se) |
| A3 | Re-run pe output badal sakta tha | P5 — sorted keys, no timestamps, full rewrite |
| A4 | 227 pages beech mein ruk gaye to resume ka koi tarika nahi | §7 Stage B — per-page file + manifest with status |
| A5 | Pipeline khud ka koi test nahi tha | §9 — golden set of 30 hand-verified questions |
| A6 | Printed answer key ko sach maan liya tha | Key **galat ho sakti hai** (2016-b mein "Ampere" likha tha, sahi "Ohm" tha). Ab conflict detect hoga |
| A7 | Objective/subjective ek saath mila diye | `section` field se alag, alag validation rules |
| A8 | Same text par alag options wale question merge ho jate | Merge tabhi jab **text AND options** dono match karein |
| A9 | Near-duplicate apne aap merge ho jate | Machine sirf **propose** karegi, merge human confirm pe |
| A10 | Hinglish ki quality ka koi control nahi | §8 — glossary rules + `scienceGlossary.js` reuse + sampling |
| A11 | Kitna time/kharcha lagega, kabhi bataya nahi | §11 — honest estimate |
| A12 | "Phase done" ka matlab define nahi tha | §12 — exit criteria, numbers ke saath |
| A13 | Schema badla to purani files bekaar | `schemaVersion` har file mein + migration note |
| A14 | Bank aage DB tak kaise jayega, clear nahi tha | P7 — git source of truth, seed script derived |
| A15 | Diagram wale question quiz ko tod dete | `diagram.required: true` → `usableInQuiz: false` |
| A16 | Paper-level duplicate check tha hi nahi | F1 mila isi wajah se. Ab Stage A mein hash check |
| A17 | "OR / अथवा" wale alternative question ka model nahi tha | Alternative apna alag question banega, `variantOf` se juda |
| A18 | Marks mismatch 3 baar aaya, koi rule nahi tha | Rule: **per-question marks jeetenge**, header sirf advisory, mismatch → flag |

---

## 4. Folder layout

```
data/quiz-bank/
├── pdfs/                       # asli PDF — READ ONLY, kabhi nahi badlenge
│   └── 2016 a.pdf ...
│
├── stage1-pages/               # [B] har page ka raw text — MEHNGA, EK BAAR
│   └── 2016-a/
│       ├── _manifest.json      #   kaunsa page done, kaunsa pending
│       ├── page-01.json
│       └── page-02.json
│
├── stage2-blocks/              # [C] question-wise kate hue blocks
│   └── 2016-a.json
│
├── stage3-questions/           # [D] structured, 3 language
│   └── 2016-a.json
│
├── stage4-answers/             # [E] answer + confidence
│   └── 2016-a.json
│
├── bank/                       # [F/G] final
│   ├── questions.json          #   canonical, deduped
│   ├── clusters.json           #   repeat groups
│   └── id-ledger.json          #   questionId ka permanent record
│
├── review/
│   ├── queue.json              #   jo tumhe dekhna hai (severity-sorted)
│   └── resolved.json           #   tumne jo decide kiya — REPLAYABLE
│
├── golden/
│   └── golden-questions.json   #   30 hand-verified — pipeline ka test
│
└── reports/
    ├── survey.json             #   [A] har paper ka type/route
    ├── extraction-status.json  #   har paper kitna hua
    └── health.json             #   final numbers
```

**Ek line ka rule:** `pdfs/` ke alawa har folder script se banta hai, aur delete karke dobara ban sakta hai — sivaay `review/resolved.json` aur `bank/id-ledger.json` ke. Wo do **kabhi delete nahi honge**.

---

## 5. Schema — pipeline ka dil

### 5.1 Paper file (`stage3-questions/<paperId>.json`)

```jsonc
{
  "schemaVersion": 1,
  "paper": {
    "paperId": "2019-a",          // filename se. sach yahi hai.
    "year": 2019,
    "shift": "a",                 // null agar filename mein nahi
    "sourceFile": "2019 a.pdf",
    "sourceMd5": "1b5de181...",   // paper-duplicate pakadne ke liye
    "duplicateOf": null,          // "2017-a" jaisa, agar ye copy hai
    "subject": "science",
    "class": 10,
    "board": "BSEB",
    "totalPages": 8,
    "declaredMarks": {            // paper ke header se — ADVISORY ONLY
      "groupA": 40,
      "groupB": 40
    },
    "hasPrintedAnswerKey": true,
    "extractionRoute": "page-images",   // page-images | text-layer | both
    "notes": []
  },
  "questions": [ /* neeche wala shape */ ]
}
```

### 5.2 Question object

```jsonc
{
  // ---- IDENTITY (§6 dekho) ----
  "sourceId": "2019-a:A:12",      // paper + group + number. IMMUTABLE.
  "questionNumber": 12,
  "subPart": null,                // "i", "ii" ... agar sub-part hai
  "group": "A",                   // paper ka apna group label
  "section": "objective",         // objective | subjective
  "type": "mcq",                  // mcq | short | long | match | numeric | diagram
  "marks": 1,                     // per-question marks JEETTA hai (A18)

  // ---- CONTENT: teeno language zaroori ----
  "text": {
    "hi": "…",                    // Devanagari
    "en": "…",
    "hinglish": "…"               // generated (§8)
  },

  "options": [                    // subjective mein null
    { "key": "a", "text": { "hi": "…", "en": "…", "hinglish": "…" } },
    { "key": "b", "text": { "hi": "…", "en": "…", "hinglish": "…" } },
    { "key": "c", "text": { "hi": "…", "en": "…", "hinglish": "…" } },
    { "key": "d", "text": { "hi": "…", "en": "…", "hinglish": "…" } }
  ],

  // ---- ALTERNATIVE (अथवा / OR) — A17 ----
  "variantOf": null,              // "2019-a:A:12" agar ye uska OR-alternative hai
  "hasAlternative": false,

  // ---- ANSWER ----
  "answer": {
    "correctOption": "b",         // mcq only
    "text": {                     // subjective ka model answer
      "hi": null, "en": null, "hinglish": null
    },
    "source": "printed-key",      // printed-key | repeat-question | textbook | human | none
    "sourceDetail": "2019-a page 7 answer key",
    "confidence": "L3",           // §9
    "conflicts": []               // [{ from, value, note }] — A6
  },

  // ---- DIAGRAM — A15 ----
  "diagram": {
    "required": false,            // true = question bina chitra ke adhoora hai
    "note": null
  },

  // ---- GATE: quiz mein jayega ya nahi ----
  "usableInQuiz": true,
  "blockers": [],                 // ["missing-hindi", "diagram-required", "answer-unverified"]

  // ---- KAHAN SE AAYA ----
  "provenance": {
    "readBy": "vision",           // vision | text-layer | both
    "crossChecked": true,         // dono source match kiye?
    "pages": [3]
  },

  "flags": []                     // machine-detected issues, review queue ka input
}
```

### 5.3 Canonical bank entry (`bank/questions.json`)

```jsonc
{
  "questionId": "q-000412",       // PERMANENT. §6.
  "canonical": { /* sabse acchi version — 5.2 wala shape */ },

  "appearances": [                // repeat feature ka data
    { "paperId": "2016-b", "sourceId": "2016-b:B:31-i", "year": 2016, "marks": 1 },
    { "paperId": "2019-a", "sourceId": "2019-a:A:12",   "year": 2019, "marks": 1 }
  ],
  "repeatCount": 2,
  "years": [2016, 2019],

  "variants": [],                 // milte-julte par alag rakhe gaye (A8/A9)

  "chapter": {
    "chapterId": "science.physics.chapter-01",
    "confidence": 0.82,
    "method": "rag"               // rag | keyword | human
  },

  "difficulty": null,             // baad mein real attempt data se
  "usableInQuiz": true
}
```

---

## 6. ID strategy (A2, P6)

Do alag ID. Dono ka kaam alag.

### `sourceId` — "ye kis paper mein kahan tha"

Format: `<paperId>:<group>:<questionNumber>[-<subPart>]`

Examples: `2019-a:A:12` · `2016-b:B:31-viii`

- **Jagah se** banti hai, content se nahi
- Text theek karne pe **nahi badlegi**
- Ek paper mein unique

### `questionId` — "ye bank mein kaunsa question hai"

Format: `q-` + 6 digit number → `q-000412`

- Pehli baar bank mein aane par **assign** hoti hai
- `bank/id-ledger.json` mein permanent record: `questionId → pehla sourceId + fingerprint`
- **Kabhi badalti nahi. Kabhi reuse nahi hoti** — question delete bhi ho jaye to uska number khaali chhod denge

### Content hash — sirf matching ke liye

`fingerprint` field matching ke liye hai. **Kabhi ID nahi banega.**

*Kyun (P6):* student ka progress `questionId` se juda hoga. Ek typo fix karne se agar ID badli, to us student ka poora record anaath ho jayega.

---

## 7. Stages — step by step

Har stage ka ek hi kaam hai. Har stage ki apni session (protocol Rule 1).

---

### 🅰️ Stage A — Foundation & Survey

**Input:** `pdfs/`
**Output:** `reports/survey.json`, folder structure, ye schema locked

**Kaam:**

1. Har PDF ka MD5 hash nikalo
2. **Duplicate papers pakdo** (F1) — same hash = `duplicateOf` mark karke skip
3. Filename se `paperId`, `year`, `shift` nikalo (P3)
4. Page count nikalo
5. Text layer test karo — English kitni, Hindi kitni
6. Har paper ko route assign karo:
   - `page-images` — primary, sab ke liye
   - `both` — jin 7 mein text layer bhi hai (cross-check milega)
7. `_manifest.json` har paper ke liye banao — page-by-page status `pending`

**Done kab:**
- [ ] 21 files → 20 unique papers confirm
- [ ] Har paper ka route likha hua
- [ ] Koi paper `UNKNOWN` route pe nahi
- [ ] Schema is file mein locked (badla to `schemaVersion` badhega)

**Blocker jo pehle hatana hai:**
Page ko image banane ka tool (`pdftoppm` ya PyMuPDF) system pe nahi hai.
**Iske bina Stage B shuru nahi ho sakta.**

---

### 🧪 Stage P — PILOT (ek paper, poora raasta) — P9

> **Ye stage sabse important hai. Ise skip mat karna.**
>
> Baaki saare stages "sab papers pe" chalte hain. Ye ek paper pe chalta hai —
> par **poora raasta**, Stage B se Stage G tak.

**Pilot paper:** `2016-a` — 16 page, scanned, sabse chhota scan.

**Kyun yahi:** scanned route hi asli risk hai (F2). Sabse purana paper = sabse ganda scan =
sabse bura case. Agar ye chal gaya, baaki asaan hai.

**Kaam:** neeche wale saare stages, sirf is ek paper pe:

```
B (16 page padho) → C (blocks) → D (3 language) → E (answers) → F (dedup solo) → G (review)
```

**Pilot ka maqsad question banana nahi hai — plan ki galtiyan pakadna hai.**

Ye 8 sawaalon ke jawab dhundhne hain:

| # | Sawaal | Kya pata chalega |
|---|---|---|
| 1 | Scan padhne layak hai? | Hindi transcribe ho paa rahi hai ya dhundhla hai |
| 2 | Ek page padhne mein kitna time/token? | 370 page ka asli estimate (§11 ka number theek hoga) |
| 3 | Question boundary sahi kat rahi hai? | Stage C ke rules kaam karte hain ya nahi |
| 4 | Page break pe question tootta hai? | Kitni baar, aur handle ho raha hai ya nahi |
| 5 | Hinglish ki quality theek hai? | §8 ke rules kaafi hain ya aur chahiye |
| 6 | Answer key mila? Kitne question ka? | Stage E ka asli coverage |
| 7 | Schema (§5) mein koi field kam pad raha? | Schema lock karne se pehle aakhri mauka |
| 8 | Chapter mapping kitna sahi hai? | RAG mapping 85% dega ya nahi |

**Done kab:**
- [ ] `2016-a` ke saare 16 page padhe gaye
- [ ] Us paper ke saare questions bank tak pahunche (chhota bank, sirf ek paper ka)
- [ ] Upar wale 8 sawaalon ke jawab `reports/pilot-findings.md` mein likhe
- [ ] Golden set (§9) ke pehle 10 questions isi paper se haath se verify hue
- [ ] **Ye file (`QUIZ_DATA_PIPELINE.md`) pilot ke findings se update hui**
- [ ] User ne findings dekhe aur "haan, aage badho" bola

**⛔ Rule:** jab tak Stage P ka DoD tick nahi hota, **Stage B baaki 19 papers pe shuru nahi
hoga.** Ye protocol ka STOP condition hai.

**Agar pilot fail hua** (jaise scan padhne layak hi nahi):
- Panic nahi. Yahi to pilot ka kaam tha.
- Sirf Stage B ka tareeka badlega (zyada DPI, ya image saaf karna, ya alag tool)
- Baaki poora design (§2 principles, §5 schema, §6 IDs) waise ka waisa rahega

---

### 🅱️ Stage B — Page reading (MEHNGA — EK BAAR)

> Stage P paas hone ke **baad** hi ye baaki 19 papers pe chalega.

**Input:** `pdfs/` + manifest
**Output:** `stage1-pages/<paperId>/page-NN.json`

**Kaam:**

1. Har page ko image banao (PNG, ~200 DPI)
2. Har page padho → Hindi text + English text, jaisa dikha waisa
3. Turant disk pe likho — **ek page done, turant save**
4. Manifest update: `pending → done`

**Page file ka shape:**

```jsonc
{
  "schemaVersion": 1,
  "paperId": "2016-a",
  "page": 3,
  "readBy": "vision",
  "raw": {
    "hi": "…jo Devanagari dikha…",
    "en": "…jo English dikha…"
  },
  "textLayer": "…pdftotext ka output, agar hai…",   // cross-check ke liye
  "confidence": "high",         // high | medium | low
  "notes": []
}
```

**Rules:**

- Ek page ek baar. Dobara nahi.
- Jo dikha wahi likho. Theek **mat** karo. Sudhaar Stage C+ ka kaam hai.
- Nahi dikh raha? `confidence: "low"` + note. Guess **mat** karo.
- Beech mein ruk jaye? Manifest se pata chal jayega kahan se shuru karna hai (A4)

**Done kab:**
- [ ] Har paper ke har page ka file bana
- [ ] Manifest mein koi `pending` nahi
- [ ] `low` confidence wale pages ki list report mein

---

### 🅲 Stage C — Question blocks kaatna

**Input:** `stage1-pages/`
**Output:** `stage2-blocks/<paperId>.json`

**Kaam:**

1. Page text jodo (page break ke aar-paar question toot sakta hai — handle karo)
2. Question boundary pehchano — `1.` `1-` `(i)` sab handle karo
3. Group/section pehchano (Group A/B, objective/subjective)
4. Har block ko `sourceId` do

**Done kab:**
- [ ] Har paper ka question count nikla
- [ ] Count vs paper ka declared total — mismatch flagged (A18)
- [ ] Koi block khaali nahi

---

### 🅳 Stage D — Structure + 3 languages

**Input:** `stage2-blocks/`
**Output:** `stage3-questions/<paperId>.json`

**Kaam:**

1. Block ko schema (§5.2) mein daalo
2. Question text aur options alag karo
3. `hi` aur `en` bharo (Stage B se)
4. **Hinglish banao** (§8 ke rules se)
5. Marks nikalo, `type` decide karo
6. Diagram wale question mark karo (A15)
7. `usableInQuiz` compute karo

**Done kab:**
- [ ] Har question mein `hi`, `en`, `hinglish` teeno — ya blocker likha hua
- [ ] Har MCQ mein exactly 4 options, teeno language mein
- [ ] `marks` sum vs header — mismatch flagged, per-question jeeta (A18)

---

### 🅴 Stage E — Answers + verification

**Input:** `stage3-questions/`
**Output:** `stage4-answers/<paperId>.json`

**Kaam — is order mein:**

1. **Printed key** se answer lo (agar paper mein hai)
2. **Repeat question** se lo — same question kisi aur saal mein jiska answer pakka hai
3. **Textbook** se verify karo — Zuno ke RAG se `data/class-10/science/` ke against
4. **Conflict pakdo** (A6) — agar printed key aur textbook alag bol rahe hain → dono record karo, `confidence` girao, review queue mein daalo
5. Confidence level assign karo (§9)

**Done kab:**
- [ ] Har objective question ka `answer.source` likha hua (`none` bhi valid hai)
- [ ] Har conflict record hua, chhupaya nahi gaya
- [ ] L3+ questions ka count report mein

---

### 🅵 Stage F — Dedup + chapter mapping

**Input:** `stage4-answers/` (saare papers)
**Output:** `bank/questions.json`, `bank/clusters.json`, `bank/id-ledger.json`

**Kaam:**

1. Har question ka fingerprint banao (normalize: lowercase, punctuation hatao, spacing, numbers)
2. **Exact match** → merge (par sirf jab text **aur** options dono match karein — A8)
3. **Near match** → cluster banao, par merge **mat** karo — human ko propose karo (A9)
4. `questionId` assign karo (ledger se — §6)
5. `appearances[]` bharo, `repeatCount` nikalo
6. Chapter map karo — Zuno ke existing RAG se
7. Answer backfill — jis appearance mein answer pakka hai, wo poore cluster ko mile

**Done kab:**
- [ ] Har question ki ek entry, `appearances[]` ke saath
- [ ] `repeatCount` nikla — top-repeated questions ki list ban gayi
- [ ] Har question ka chapter tag (ya `unmapped` flag)
- [ ] Ledger mein har ID permanent

---

### 🅶 Stage G — Review + final health

**Input:** `bank/` + `review/queue.json`
**Output:** verified bank, `reports/health.json`

**Kaam:**

1. Review queue banao — severity se sorted:
   - 🔴 Answer conflict
   - 🔴 Language missing
   - 🟠 Near-duplicate merge decision
   - 🟠 Low OCR confidence
   - 🟡 Chapter unmapped
   - 🟡 Marks mismatch
2. Tum queue clear karo → decisions `review/resolved.json` mein
3. Pipeline dobara chalao — decisions apne aap lag jayenge (P4)
4. Final health report

**Done kab:** §12 dekho.

---

## 8. Hinglish banane ke rules (A10)

Hinglish kahin se milti nahi — banani padti hai. Isliye rules zaroori hain.

| Rule | Detail |
|---|---|
| Source | **Hindi se** banao (matlab wahan hai), English se cross-check karo |
| Technical terms | English hi rakho — `photosynthesis`, `mitochondria`, `voltmeter`. Translate **mat** karo |
| Glossary | `backend/src/constants/scienceGlossary.js` already hai — wahi use karo, naya mat banao |
| Script | Sirf Roman. Devanagari bilkul nahi. |
| Style | Simple, bolne wali Hinglish — "Prakash ke paravartan ke kitne niyam hain?" |
| Numbers/formula | `10^8`, `CO2`, `H2O` — plain text, unicode subscript nahi |
| Consistency | Ek hi Hindi shabd hamesha ek hi Hinglish spelling → glossary lock |
| QC | Har paper se 10 random question manually check honge |

---

## 9. Confidence levels (P8)

| Level | Matlab | Quiz mein? |
|---|---|---|
| **L0** | Nikla hai, par structure adhoora | ❌ |
| **L1** | Structure poora — 4 options, teeno language | ❌ |
| **L2** | Answer mila — ek source se | ❌ |
| **L3** | Answer **do independent source** se match — ya textbook se verified | ✅ |
| **L4** | Human ne dekh ke confirm kiya | ✅ |

**Do independent source ka matlab:**
- printed key + textbook verification
- printed key + doosre saal ka same question
- vision reading + text layer (jin 7 papers mein dono hain — F2 ka faayda)

**Golden set (A5):** 30 questions haath se verify honge (har paper type se).
Har stage change ke baad inhi 30 pe test chalega.
Ye pipeline ka apna regression test hai — bilkul waise jaise `test:golden` RAG ke liye hai.

---

## 10. Review workflow (P4)

```
Pipeline chalta hai
   ↓
review/queue.json banti hai (severity sorted)
   ↓
Tum dekhte ho, decide karte ho
   ↓
Decision review/resolved.json mein jaati hai
   ↓
Pipeline dobara chalta hai → decision apne aap apply
   ↓
Wo item queue se hamesha ke liye gayab
```

`resolved.json` ka shape:

```jsonc
{
  "schemaVersion": 1,
  "decisions": [
    {
      "target": "2016-b:A:16",
      "field": "answer.correctOption",
      "value": "b",
      "reason": "Printed key mein 'Ampere' likha tha jo galat hai — resistance ka unit Ohm hai",
      "decidedBy": "human",
      "decidedAt": "2026-08-04"
    }
  ]
}
```

**Ye file kabhi delete nahi hogi.** Ye tumhare kaam ka permanent record hai.

---

## 11. Time ka honest andaaza (A11)

| Stage | Kitna kaam | Session |
|---|---|---|
| A — Survey | 20 papers, script | 1 |
| **P — Pilot** | **1 paper, poora raasta** | **1-2** ← ye estimate theek karega |
| **B — Page reading** | **~180 PDF pages (baaki 19 papers)** | **4-7** ← sabse bada |
| C — Blocks | script | 1 |
| D — Structure + Hinglish | script + LLM | 2-3 |
| E — Answers | script + RAG | 2 |
| F — Dedup + chapter | script | 1-2 |
| G — Review | tum + fixes | 2-3 |

**Kul: 14-21 sessions.**

✅ **Stage B ka number ab naapa hua hai** (pilot se): 1 PDF page = 2 printed page, isliye
382 "printed pages" asal mein sirf **~190 PDF page reads** hain. Pilot mein 8 page = 50 questions
ek baithak mein nikle. Isliye 6-10 → **4-7 sessions**.

⚠️ Baaki stages (C–G) ke number abhi bhi **anumaan** hain. Pilot ke Stage C–G ke baad dobara likhenge.

Chhupana galat hoga — Stage B lamba hai. Par wo **ek baar** hai (P1).
Uske baad pipeline dobara chalana minutes ka kaam hai.

**Batching:** Stage B mein ek session = 2-4 papers. Har session ke baad manifest save.
Kabhi bhi ruk sakte ho, kabhi bhi resume.

---

## 12. Poori phase kab "done" hai (A12)

Numbers, feelings nahi:

- [ ] **Stage P (Pilot) paas hua aur uske findings is file mein utar chuke hain**
- [ ] 20 unique papers, sabka status `done` (duplicate identified aur skipped)
- [ ] `stage1-pages/` mein har page ka file — koi `pending` nahi
- [ ] **≥95%** objective questions mein teeno language poori
- [ ] **≥90%** objective questions **L3 ya upar**
- [ ] Har answer conflict ya to resolve hua ya `usableInQuiz: false`
- [ ] **≥85%** questions ka chapter mapped
- [ ] Golden set ke 30/30 questions pass
- [ ] `review/queue.json` mein koi 🔴 baaki nahi
- [ ] `bank/questions.json` ek command se rebuild ho jaata hai
- [ ] Ye numbers `reports/health.json` mein likhe hain

**Jab tak ye tick nahi hote, `QUIZ_SYSTEM_BLUEPRINT.md` Phase 1 shuru nahi hoga.**

---

## 13. Abhi ke open decisions

Ye teen cheezein user ko decide karni hain, ek-ek karke:

| # | Sawaal | Recommendation |
|---|---|---|
| D1 | Page ko image banane ka tool — poppler install karein ya Python + PyMuPDF? | **PyMuPDF** — Python already installed hai, ek command, admin nahi chahiye |
| D2 | Stage B mein ek session mein kitne papers? | **2-3 papers** — session chhoti rahegi, context saaf |
| D3 | Subjective questions ka model answer abhi banayein ya baad mein? | **Baad mein** — objective pehle, kyunki quiz feature usi pe khada hai |

---

## 14. Ye file kab badlegi

- Schema badla → `schemaVersion` badhao + yahan note likho
- Naya stage add hua → yahan pehle likho, phir code
- Koi principle (§2) todna pade → **STOP**, user se poocho, chupchap mat todo

Kaam ke beech mein ye file nahi badlegi — bilkul jaise `QUIZ_EXECUTION_PROTOCOL.md` nahi badalti.

---

## 15. Changelog

| Date | Kya |
|---|---|
| 2026-08-03 | File bani. Audit ke baad: 2 hard findings (F1 duplicate paper, F2 Hindi not recoverable) + 18 gaps fixed. Routing badla — saare papers page-image se padhe jayenge, text layer sirf cross-check. |
| 2026-08-03 | **Stage P (Pilot) add hua** + principle P9. Pehle plan bolta tha "saare 370 pages padho phir aage badho" — wo galat tha, kyunki tareeka galat nikalta to poori mehnat barbaad hoti. Ab pehle ek paper (`2016-a`) poora A→G chalega, uske 8 sawaalon ke jawab se ye file update hogi, tab baaki 19 papers shuru honge. Time estimate ko bhi "anumaan hai, naap nahi" mark kiya. |
