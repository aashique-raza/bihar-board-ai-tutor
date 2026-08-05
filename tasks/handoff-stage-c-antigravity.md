# Handoff Prompt — Stage C (Question Blocks) for a fresh agent in Antigravity

> Isko exactly follow karo. Ye ek narrow, mechanical task hai — scope se bahar kuch mat karo.
> Agar kahin confuse ho, ya kuch expected se alag dikhe, **ruk jao aur user ko batao** — khud decide
> mat karo. Ye rule is poore task ka sabse important rule hai.

---

## 0. Pehle ye 3 files padho (is exact order mein)

1. `QUIZ_BUILD_LOG.md` — living state. "ABHI KAHAN HAIN" section se confirm karo ki current
   phase **Phase 0.5, Stage C** hai (Stage B abhi complete hua hai, sab 18 papers ke liye).
2. `QUIZ_EXECUTION_PROTOCOL.md` — rulebook. Especially: Rule 3 (Parking Lot triage), Rule 4
   (baseline test), Section 7 (blast radius), Section 8 (STOP conditions).
3. `QUIZ_DATA_PIPELINE.md` — is task ka spec `### 🅲 Stage C` section mein hai (ctrl+F "Stage C").

Ye teeno files is repo ke root mein hain. Poori tarah padho, skim mat karo.

---

## 1. Task — sirf ye ek kaam

`backend/scripts/quiz-bank/buildBlocks.js` **already ban chuka hai aur pilot (`2016-a`) pe test ho
chuka hai.** Tumhara kaam naya code likhna **nahi** hai — sirf is existing script ko sab 18 papers
pe chalana hai jinke `data/quiz-bank/stage1-pages/<paperId>/` folders bane hue hain, aur result
verify karna hai.

**18 papers (Stage B complete list):** `2016-a`, `2016-b`, `2016-c`, `2017-a`, `2017-c`, `2017-d`,
`2018-a`, `2018-b`, `2019-b`, `2020-a`, `2020-b`, `2021`, `2022`, `2023-a`, `2024-a`, `2024-b`,
`2025`, `2026`.

(`2016-a` pilot mein already Stage C se guzar chuka hai — `data/quiz-bank/stage2-blocks/2016-a.json`
already exist karta hai. Script use dobara chalayegi to bhi theek hai, wo idempotent hai — par agar
`2016-a` ka output already sahi hai to usse dobara verify karna extra kaam nahi hai, sirf confirm
karo file already sahi hai.)

---

## 2. Exact steps

### Step 1 — Baseline test (pehle)

```bash
cd backend
npm run test:chunks
npm run test:study-map
npm run test:curriculum-resolvers
npm run test:chat-db-models
```

Expected (ye already known baseline hai, is exact repo ke liye):
- `test:chunks` → 🟢 PASS
- `test:study-map` → 🟢 PASS
- `test:curriculum-resolvers` → 🟢 PASS
- `test:chat-db-models` → 🔴 FAIL — **ye pehle se hi broken hai** (Parking Lot item P-6, is task se
  unrelated, missing `chatState.model.js` file). Isko fix karne ki koshish **mat karo**. Bas note
  kar lo ki ye red hi expected hai.

Agar pehले teen mein se koi red aaye jo upar list nahi hai → **ruk jao, user ko batao.** Aage mat
badho.

### Step 2 — Script chalao

```bash
cd backend
npm run quiz:blocks
```

(Argument ki zaroorat nahi — script khud har wo paper process karta hai jiska `stage1-pages` folder
maujood hai.)

Script apna output khud print karega (kitne blocks bane, kitne flagged, marks match hua ya nahi).
Poora output dhyan se padho.

### Step 3 — Output verify karo

Har paper ke liye `data/quiz-bank/stage2-blocks/<paperId>.json` bana honा chahiye. Check karo:

- [ ] Sab 18 paper ke liye file bani (18 `.json` files, chhoti-badi)
- [ ] Kisi bhi paper mein `flaggedCount` (ya jo bhi field script use kare mismatch dikhane ke liye)
      agar non-zero hai, to us paper ka naam aur count note karo — ye **fail nahi hai**, sirf ek
      observation hai jo report mein jaayegi
- [ ] Koi block empty/khaali text ka nahi hai (script khud check karta hai agar validation hai)
- [ ] JSON files valid JSON hain (parse ho jaate hain)

### Step 4 — Baseline test (baad mein)

Step 1 wahi commands dobara chalao. Result **exactly wahi** aana chahiye jo Step 1 mein tha
(3 green, `chat-db-models` red). Agar kuch naya red ho gaya — **tumne kuch toda hai**, ruk jao,
user ko batao, khud fix mat karo jab tak clear na ho ki fix safe hai.

Is task mein `backend/src/` ki koi file touch nahi honi chahiye — sirf script run hui hai. Isliye
agar baseline test mein farak aaya to woh genuinely ajeeb hai — is case mein zaroor ruk jao.

---

## 3. Blast radius — sirf ye touch hoga

- ✅ `data/quiz-bank/stage2-blocks/*.json` (script ka output — naya banega)
- ❌ **Kuch aur mat chuo.** Especially:
  - `backend/scripts/quiz-bank/buildBlocks.js` mein koi edit **nahi** (jab tak genuinely blocker
    na mile — us case mein pehle ruk jao aur user ko batao kya blocker hai, khud edit mat karo)
  - `data/quiz-bank/stage1-pages/` — Stage B ka output, **immutable**, isse kabhi edit nahi hota
  - `QUIZ_BUILD_LOG.md`, `QUIZ_EXECUTION_PROTOCOL.md`, `QUIZ_DATA_PIPELINE.md`, `CLAUDE.md` — in
    sabko **mat edit karo**. Log update user khud (doosre agent se) karwayega verify karne ke baad.
  - Koi bhi `backend/src/` file
  - Koi git commit mat banao. Sirf changes working tree mein chhodo — user khud review + commit
    karega.

---

## 4. Report — is format mein likh ke do (chat mein, file mein nahi)

```
STAGE C RUN REPORT

Baseline (pehle): <result>
Baseline (baad mein): <result — same ya different, agar different to detail>

Papers processed: <count> / 18
Files created: <list ya count>

Per-paper flagged/mismatch notes:
- <paperId>: <kya mila, agar kuch mila>
- (agar sab clean hai to likho "koi paper flag nahi hua")

Anything unexpected / STOP hua kahin: <haan/nahi, detail agar haan>
```

Is report ko user ko do — wo isse doosre agent (Claude) ko dikhayega verify karne ke liye. Isliye
**exaggerate ya sugarcoat mat karo** — jo mila wahi likho, jaisa mila.

---

## 5. Agar kahin fasso

- Script error de → poora error text report mein copy karo, guess mat karo kya hua
- Koi paper ka `stage1-pages` folder missing/incomplete dikhe → ruk jao, batao kaunsa paper aur kya
  missing hai
- Confuse ho jao ki kya karna hai → ruk jao, user se poocho, khud decide mat karo

Yaad rakho: is task ka goal sirf "18 papers pe ek already-built script chalana aur result report
karna" hai. Isse zyada scope nahi hai.
