# Handoff Prompt #2 — Fix Stage C header-detection bug

> Ye Stage C ka follow-up hai. Pehla run (`npm run quiz:blocks` sab 18 papers pe) technically
> complete hua, par uska result **galat interpret hua** — jo cheez "paper format diversity"
> maani gayi thi, wo asal mein ek confirmed code bug thi. Is prompt mein exact diagnosis hai.
> **Isko exactly follow karo. Scope se bahar mat jao. Kahin confuse ho ya kuch expected se alag
> dikhe → ruk jao, user ko batao, khud decide mat karo.**

---

## 0. Pehle ye padho

1. `QUIZ_BUILD_LOG.md` — "ABHI KAHAN HAIN" (current state)
2. `QUIZ_EXECUTION_PROTOCOL.md` — especially Rule 3 (Parking Lot), Rule 4 (baseline test),
   Section 7 (blast radius), Section 8 (STOP conditions)
3. `QUIZ_DATA_PIPELINE.md` — `### 🅲 Stage C` section
4. `backend/scripts/quiz-bank/buildBlocks.js` — poora file padho, especially `MARKERS` object
   (line ~46) aur `segment()` function (line ~176)

---

## 1. Diagnosis — confirmed root cause

`buildBlocks.js` ke `MARKERS` object mein Group-A/B header sirf ye regex se pehchana jaata hai:

```js
hi: { groupA: /^\s*ग्रुप\s*[-–—]\s*A\b/, groupB: /^\s*ग्रुप\s*[-–—]\s*B\b/, ... }
en: { groupA: /^\s*GROUP\s*[-–—]\s*A\b/i, groupB: /^\s*GROUP\s*[-–—]\s*B\b/i, ... }
```

Ye sirf **pilot paper `2016-a`** ki wording thi ("ग्रुप - A" / "GROUP - A"). Direct raw-text
verification (`data/quiz-bank/stage1-pages/<paperId>/page-NN.json` ke `raw.hi` / `raw.en` fields)
se confirm hua ki **baaki papers alag terminology use karte hain:**

| Paper(s) | Asli header text jo mila | Regex match hui? |
|---|---|---|
| `2016-a` | `ग्रुप - A` | ✅ haan |
| `2019-b`, `2020-a`, `2020-b`, `2021`, `2022`, `2023-a`, `2024-a`, `2024-b`, `2025`, `2026` | **`खण्ड-अ / SECTION-A`** (spacing/dash style paper se paper thoda alag — kabhi `खण्ड - अ`, kabhi `खण्ड–अ`, kabhi bina space) | ❌ nahi — "खण्ड"/"SECTION" ka कोई regex hi nahi hai |
| `2016-b` | `GROUP-A` — par ye Hindi-only guide-book style paper hai; iska `raw.en` field **poori tarah khaali string** hai, aur ye English wording khud `raw.hi` field ke andar embedded hai | ❌ nahi — hi-regex Devanagari dhoondta hai, ye Latin text hi field mein hai |
| `2017-c` (aur shaayad `2017-d`) | `भाग-अ` — teesra alag shabd | ❌ nahi |

Jab header nahi milta, `segment()` function ka fallback chalta hai (line ~183-185):
```js
if (startIdx === -1) {
  notes.push(`${lang}: Group A header not found — segmenting from the top of the paper.`);
  startIdx = 0;
}
```
Matlab poore paper ka cover page + candidate instructions (jo khud numbered `1.`–`7.` hote hain)
bhi question-segmentation mein shaamil ho jaate hain — isliye pehla run mein har paper (2016-a
chhod ke) mein bahut saare "marks-missing" flags aaye, aur `2024-b` mein 0 blocks bane (uska
structure itna alag tha ki fallback se bhi kuch nahi bana).

**Ye bug hai, "expected format diversity" nahi.** Pehle run ka report isse galat treat kar gaya —
har paper ko alag-alag "yaha aisa hai, wahan waisa hai" bolke justify kar diya, jabki common root
cause ek hi regex tha.

---

## 2. Task — exact fix

`buildBlocks.js` ke `MARKERS.hi.groupA` / `MARKERS.hi.groupB` / `MARKERS.en.groupA` /
`MARKERS.en.groupB` regex ko is tarah generalize karo ki upar table ke saare 3 real-world variants
(`ग्रुप`/`GROUP`, `खण्ड`/`SECTION`, `भाग`) pehchane jayein — spacing aur dash style
(`-`, `–`, `—`, ya bina space) ki variation ke saath.

`2016-b` jaisa case (English wording jo `hi` field ke andar embedded hai) — is bug ko fix karne ka
sabse safe tareeka decide karo. Do options:
- header check dono regex sets (hi + en) ke against, dono language ki line-lists pe chalao (na sirf
  apni language ki lines pe)
- ya jo bhi approach lage sahi, tumhara call hai — bas **decide karke likho kyun**, chuppchap mat
  karo

**Important:** header text ke exact string har baar predict mat karo — jo bhi naya paper aaye
uska raw text khud dekh ke confirm karo (jaisa is prompt ke Section 1 mein maine kiya). Agar koi
paper aisa mile jiska header in teeno se bhi alag ho, ruk jao aur user ko batao — naya regex khud
mat bana do bina dikhaye.

Fix karne ke baad:

1. `npm run quiz:blocks` dobara chalao (sab 18 papers)
2. **Har paper ke liye verify karo ki ab "Group A header not found" flag nahi aa raha** (jab tak
   genuinely koi paper ho jiska header in 3 variants se bhi match na kare — us case mein ruk ke
   batao, list karo kaunsa paper)
3. `2016-a` (pilot) ka result **bilkul wahi** rehna chahiye jo pehle tha — flaggedCount 0,
   Group A 60/60, Group B 20/20. Agar ye badla, tumne kuch tod diya hai.
4. `2024-b` ab 0 blocks nahi dena chahiye — verify karo ab genuine blocks ban rahe hain
5. Baaki papers mein "marks-missing" count **kaafi kam** hona chahiye (zero nahi honा zaroori
   nahi — kuch papers mein genuinely per-question marks print nahi hue the, Stage B session logs
   mein documented hai, jaise `2021`/`2022` mein last-question marks missing tha — wo alag issue
   hai, is fix ka scope nahi)

---

## 3. Verification discipline — is baar zyada strict

Pichli baar report mein "ye expected hai" bola gaya bina proof ke, jo galat nikla. Is baar:

**Kisi bhi flag ko "expected" bolne se pehle us paper ka raw `stage1-pages` text dikhao jo prove
kare — jaisa is prompt ke Section 1 ki table mein hai.** Sirf explanation likh dena kaafi nahi hai.

Agar fix ke baad bhi kisi paper mein flags bache hain, unhe do categories mein baato:
- **Root-cause samjha aur proof diya** (raw text quote karke) → likho kyun expected hai
- **Samjha nahi, ya proof nahi de sakte** → "unresolved — user ko dikhana hai" likho, guess mat karo

---

## 4. Baseline test

Pehle:
```bash
cd backend
npm run test:chunks
npm run test:study-map
npm run test:curriculum-resolvers
npm run test:chat-db-models
```
Expected: 3 green, `test:chat-db-models` red (pre-existing, P-6, unrelated — isse ignore karo).

Fix + rerun ke baad, wahi 4 commands dobara. Result same hona chahiye. Agar kuch naya red aaya,
ruk jao.

---

## 5. Blast radius — is baar ye allowed hai

- ✅ `backend/scripts/quiz-bank/buildBlocks.js` — **ye is baar edit karna hai** (pichli baar mana
  tha, ab blocker confirm ho chuka hai isliye allowed)
- ✅ `data/quiz-bank/stage2-blocks/*.json` — dobara generate honge
- ❌ Baaki sab wahi jo pehle mana tha: `data/quiz-bank/stage1-pages/` (immutable), koi bhi
  `backend/src/` file, `QUIZ_BUILD_LOG.md`/`QUIZ_EXECUTION_PROTOCOL.md`/`QUIZ_DATA_PIPELINE.md`/
  `CLAUDE.md` (in sabko edit mat karo — user khud update karwayega verify karne ke baad)
- ❌ Koi git commit mat banao — working tree mein hi chhodo

---

## 6. Report format

```
STAGE C FIX REPORT

Diagnosis confirm hui? <haan/nahi — agar nahi, kya alag mila>

Fix kiya (buildBlocks.js mein exact kya badla):
<diff summary — kaunsi lines, kya regex ab match karta hai>

Baseline (pehle): <result>
Baseline (baad mein): <result>

2016-a regression check: <same as before? haan/nahi>
2024-b ab kitne blocks banate hai: <count>

Per-paper: "Group A header not found" flag ab kis-kis paper mein bacha (agar koi bacha):
<list ya "koi nahi bacha">

Per-paper: marks-mismatch (declared vs computed) ab kis-kis paper mein hai, aur kyun (proof ke
saath, raw text quote karke agar "expected" bol rahe ho):
<list>

Anything unresolved / STOP hua kahin: <detail>
```

Ye report user ko do, jo Claude ko dikhayega verify karne ke liye. **Har "expected" claim ke saath
proof do** — pichli baar isi ki kami thi.
