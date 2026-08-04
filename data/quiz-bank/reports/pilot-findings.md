# Stage P — Pilot Findings

> **Pilot paper:** `2016-a` (`2016 a.pdf`)
> **Status:** 🟢 **Stage B + C + D DONE** — 8/8 page padhe, 52 block bane, 52/52 teeno language mein. Stage E–G baaki.
> **Spec:** `QUIZ_DATA_PIPELINE.md` §7 Stage P

---

## Setup jo kaam kar gaya

| Cheez | Result |
|---|---|
| Tool | PyMuPDF `1.28.0` — pehle se installed tha |
| Python | `C:\Python314\python` |
| Render command | `doc[i].get_pixmap(dpi=200)` |
| 150 DPI | 1754×1241 px, ~450 KB/page |
| **200 DPI** | 2339×1654 px, ~740 KB/page — **yahi use karenge** |
| Render speed | 5 pages seconds mein |

**Faisla:** 200 DPI. Is pe Hindi ki matra tak saaf dikhti hai. Render sasta hai, kanjoosi ka matlab nahi.

---

## 8 sawaalon ke jawab (§7 Stage P)

### ✅ 1. Scan padhne layak hai?

**Haan — umeed se bahut behtar. Ye Stage P ka sabse bada risk tha, ab khatam.**

- Hindi (Devanagari): poori tarah saaf — matra, halant, sanyukt akshar sab
- English: poori tarah saaf
- Marks (right margin): saaf
- Question numbering `1.`–`30.`, sub-part `(i)`–`(xx)`: saaf
- Chemical formula (`CuO + H₂ → Cu + H₂O`, `Cₙ H₂ₙ`): saaf

Ye **sabse purana** paper hai (2016) — matlab sabse bura case. Aur wo bhi saaf hai.
Baaki 19 papers isse behtar hi honge.

> §3.1 **F2** ka risk band. Teeno language mil sakti hain.

### ✅ 2. Ek page mein kitna kaam?

**Naapa gaya:**

| Metric | Value |
|---|---|
| PDF pages | 8 |
| Printed pages | 16 (1 PDF page = 2 printed page, side-by-side) |
| Questions nikle | **50** (Q1–Q30 subjective + Q31 ke (i)–(xx) MCQ) |
| Image reads lage | 8 (ek PDF page = ek read) |
| Render + read | Ek session mein aaram se ho gaya |

**Extrapolation:** 20 papers × ~8-20 PDF pages = **~180 PDF page reads** kul.
(Pehle "370 pages" bola tha — wo *printed* pages the. PDF pages aadhe hain kyunki
har PDF page mein do printed page hain. **Kaam aadha ho gaya.**)

**Naya estimate: Stage B ke liye 4-7 sessions** (pehle 6-10 bola tha).

### ✅ 3. Question boundary sahi kat rahi hai?

**Haan — Stage C chal gaya, 52/52 block sahi.** (`backend/scripts/quiz-bank/buildBlocks.js`)

| Kya | Result |
|---|---|
| Group A | 30 block (Q1–Q30) |
| Group B | 20 block (Q31 ke (i)–(xx)) |
| OR alternatives | 2 (Q28, Q29) |
| **Kul** | **52** |
| Marks Group A | 60 / 60 declared ✅ |
| Marks Group B | 20 / 20 declared ✅ |
| Flagged block | **0** |
| Dobara chalane pe | byte-identical file (P5 ✅) |

Paper ka pattern fixed hai — **Hindi pehle, phir wahi question English mein.**
Dono ko ek hi question maanna hai, do nahi. Isliye script dono language ko **alag-alag kaatti hai**
aur phir `sourceId` se jodti hai. Faayda: agar ek taraf se koi question chhoot jaye to `missing-hindi`
flag lagta hai — baaki saare question shift nahi hote.

Group B (MCQ) mein pattern alag hai: Hindi question + Hindi options, phir English question + English options.

**Do jagah trap tha, dono handle hue:**

1. **Cover page ke instructions bhi `1.` se `5.` numbered hain.** Agar seedha "number se kaato"
   chalate, to 5 jhoothe question ban jate. Fix: kaatna **"ग्रुप - A" header ke baad** hi shuru hota hai,
   aur naya question tabhi banta hai jab number **ekdum agla** ho (12 ke baad sirf 13).
2. **Option (c) ke andar hi "(a) और (b) दोनों" likha hai.** Seedha `(a)|(b)|(c)|(d)` pe split karte to
   ye option do tukde mein tootta. Fix: option markers **aage badhte hue** dhoondhe jate hain, isliye
   andar wale `(a)`/`(b)` option (c) ke andar hi rehte hain.

### 🔴 4. Page break pe question tootta hai?

**Haan — aur do tarah se:**

**(a) Left-right spread ke aar-paar**
Q28 ka Hindi bayen page ke neeche khatam hua, uska English **dayen page ke upar** shuru hua.
Matlab ek question rendered page ke bayen aur dayen aadhe hisse mein bant sakta hai.

**(b) PDF page ke aar-paar**
Q13 page 2 pe khatam, Q14 page 3 pe shuru.

**Fix:** Stage C ko **poore paper ka text ek saath** jodkar dekhna hoga, page-by-page nahi.
Page boundary ko sirf ek marker samjho, deewar nahi.

✅ **Stage C mein yahi kiya gaya** — saare 8 page ka text pehle jud jata hai, phir kata jata hai.
Har line yaad rakhti hai wo kaunse PDF page se aayi, isliye `provenance.pdfPages` phir bhi sahi bharta hai.
Q28 aur Q31(v) — dono spread ke aar-paar toote the — dono sahi bane.

### 🟡 5. Hinglish quality?

**Theek hai — par pehli koshish mein nahi. Rules tight karne pade.**

Hinglish kisi paper mein hoti nahi, isliye banani padti hai. Tareeka:
LLM (`gpt-4o-mini`, temperature 0) **Hindi se** banata hai, English sirf technical term aur
number confirm karne ke liye. `scienceGlossary.js` seedha prompt mein jata hai (§8 ka rule).

**Pehle version (prompt v1) ke 10 sample mein 3 asli galtiyan mili:**

| Kya hua | Example |
|---|---|
| Hindi shabd ki jagah English ghus gaya | "पादप हार्मोन का उदाहरण है" → "**Misal of** phytohormone hai" |
| Word order ulta ho gaya | "विद्युत बल्ब पर 100 W - 220 V अंकित है" → "100 W - 220 V **par** vidyut bulb **par** ankit hai" |
| Technical term phonetic likh diya | "बाईफोकल" → "baifokal" (sahi: **Bifocal**) |
| Bina wajah full stop | "काल्पनिक" → "Kalpanik**.**" |

**prompt v2 mein 4 naye rule** — Hindi shabd Roman mein hi rahega (English equivalent nahi),
word order nahi badlega, scientific term English spelling mein (`en` se copy), aur
capitalisation `en` se match.

**Full stop wala rule code mein gaya, prompt mein nahi.** Wo source se decidable hai:
Hindi mein `।`/`?` nahi tha to Hinglish mein `.` nahi aayega. LLM se maangne se accha machine
khud lagaye — 100% sahi, aur re-run pe muft.

**v2 ka result — 120/120 string clean:**

| Check | Result |
|---|---|
| Devanagari leak | 0 |
| Bina wajah full stop | 0 |
| Teeno language poori | **52/52** |
| Dobara sample check (wahi 10) | sab saaf |

**Sabak:** Hinglish ke rules ek baar mein nahi bante. Pilot ne 1 paper pe pakda —
20 paper pe pakadta to 20× kharcha hota. Yahi P9 ka poora point hai.

**Cache:** har translation `stage3-questions/_hinglish-cache.json` mein save hoti hai,
key mein **prompt version** bhi hai. Matlab rule badla → sab dobara banega; rule wahi hai →
0 LLM call, byte-identical file (P5 ✅). Repeat question dobara translate nahi honge —
isi wajah se baaki 19 papers sasta padenge (P1).

### 🔴 6. Answer key mila?

**Nahi. Aur jo dikha wo dhoka tha.** Poori detail: `QUIZ_DATA_PIPELINE.md` §3.1 **F3**.

Poore paper mein pen ke nishaan hain jo answer key jaise dikhte hain. Maine check kiye:

| Q | Nishaan | Sahi | Verdict |
|---|---|---|---|
| 31(ii) near-sight ka lens | Convex | **Concave** | 🔴 GALAT |
| 31(vii) sirf virtual image | do options pe nishaan | — | 🔴 AMBIGUOUS |
| 31(ix) electron transfer se bana yaugik | covalent | **electrovalent** | 🔴 GALAT |
| 31(xiv) NaOH hai | salt | **alkali** | 🔴 GALAT |
| 31(xix) sabse badi gland | adrenal | **liver** | 🔴 GALAT |
| 31(xv) Auxin | hormone | hormone | ✅ |
| 31(xvi) female repro. ka bhag nahi | vas deferens | vas deferens | ✅ |
| 31(xvii) paragkosh mein | pollens | pollens | ✅ |
| 31(xx) phytohormone | auxin | auxin | ✅ |

**20 MCQ mein se 9 check kiye → 4 saaf galat + 1 ambiguous.**
**Error rate ~45%.** Ye kisi student/website ka lagaya hua hai, board ki key nahi.

Page pe `BiharPaper.com` watermark bhi hai.

**Asar:** is paper ke answers **textbook verification** aur **repeat-match** se aayenge.
Page ke nishaano se bilkul nahi.

### 🟡 7. Schema mein koi field kam pad raha?

**Teen cheezein mili jo §5 schema mein nahi thi:**

**(a) Printed page vs PDF page**
1 PDF page = 2 printed page. Dono number record karne padenge.
Schema mein chahiye: `pdfPage` aur `printedPages: [5, 6]`.

**(b) `flags: ["handwritten-mark-present"]`**
F3 ki wajah se. Nishaan hai ye record ho — par answer ki tarah nahi.

**(c) Group B ka structure**
Poore Group B ke 20 MCQ ek hi question number (Q31) ke sub-part hain.
`sourceId` `2016-a:B:31-xiv` jaisa banega — schema ye already support karta hai ✅

**Stage D ke baad — schema ne poora paper jhel liya, ek badlav ke saath:**

`blockers[]` §5.2 mein 3 example ke saath likha tha. Asli list mein 9 nikle:
`missing-hindi`, `missing-english`, `missing-hinglish`, `options-incomplete`,
`options-language-incomplete`, `subjective`, `diagram-required`, `marks-missing`,
`answer-missing`. Ye field ka **shape** nahi badalta, sirf uske values ki poori list hai —
isliye `schemaVersion` 1 hi rahega.

`usableInQuiz` Stage D ke baad **har question pe `false`** hai, aur hona bhi chahiye —
kyunki abhi kisi ka answer nahi hai (`answer-missing`). Stage E hi wo blocker hatayegi.
Subjective 32 questions pe `subjective` blocker permanent rahega — quiz MCQ ka hai.
Matlab is paper se quiz ke liye **20 MCQ** hi candidate hain.

### ⏳ 8. Chapter mapping kitna sahi?

Abhi test nahi hua — Stage F pilot mein aayega.

---

## Paper ka asli structure

`2016 a.pdf` — cover page se:

| Field | Value |
|---|---|
| Sl. Code | 811 |
| Saal / shift | **2016 (A)** — filename se match ✅ (P3 sahi hai) |
| Total Questions | 31 (par asli count 50 — kyunki Q31 ke 20 sub-part hain) |
| Total Printed Pages | 16 |
| Time | 2 Hrs. 45 Minutes |
| Full Marks | 80 |
| Group A | 60 marks — Q1–Q30, subjective |
| Group B | 20 marks — Q31 (i)–(xx), MCQ, 1 mark each, 30 minutes |

**Group A ka marks pattern:** Q1–15 = 1 mark, Q16–21 = 2 marks, Q22–27 = 3 marks, Q28–30 = 5 marks
→ (15×1) + (6×2) + (6×3) + (3×5) = 15+12+18+15 = **60** ✅ header se match

> Ye pehli baar hai jab marks ka total **bina kisi mismatch ke** match hua.
> Purani extraction mein 3 baar mismatch aaya tha — matlab wo extraction ki galti thi, paper ki nahi.

**"अथवा / OR" alternatives:** **Q28 aur Q29** — sirf do (A17 confirm).

> 🔧 **Correction (Stage C):** pehle yahan "Q28, Q29, Q30 — teeno" likha tha. Galat tha.
> Q30 ke baad seedha Group B header aata hai, uska koi alternative nahi. Stage C ne 2 alternative
> nikale, 3 nahi — aur marks total tab bhi 60 exact match hua, jo confirm karta hai ki 2 hi sahi hai.

---

## 🔴 Ek purani galti ka khulasa

Is paper ka Sl. Code **811**, aur ye **2016 (A)** hai.

Purani (discard ki hui) extraction mein yahi paper **"2016-B"** likha gaya tha — wahi 811 code,
wahi 30+20 structure.

> Principle **P3** (filename hi sach hai) ka teesra confirmation.
> Extractor ne saal/shift 3 baar galat likha. Ab uspe bharosa hi nahi karte.

---

## Faisle jo pakke ho gaye

| # | Faisla |
|---|---|
| 1 | Render DPI = **200** |
| 2 | Tool = **PyMuPDF**, Python se |
| 3 | PNG temporary — padhne ke baad delete, git mein nahi |
| 4 | `pdfPage` + `printedPages[]` dono record honge |
| 5 | Page ke haath wale nishaan **kabhi** answer source nahi (F3) |
| 6 | Stage C poore paper ka text ek saath jodegi, page-by-page nahi |
| 7 | Stage B ka naya estimate: **4-7 sessions** (~180 PDF page reads) |

---

## Agla kaam

- [x] Stage B pilot — 8/8 page padhe
- [x] Stage C pilot — 52 block bane, marks match, 0 flag
- [x] Stage D pilot — 52/52 teeno language, prompt v2 ke baad 0 violation
- [ ] Stage E pilot — answers textbook route se (key nahi hai)
- [ ] Stage F pilot — chapter mapping
- [ ] Sawaal 5, 8 ke jawab bharo
- [ ] `QUIZ_DATA_PIPELINE.md` §11 ka estimate update karo (Stage B: 6-10 → 4-7)
