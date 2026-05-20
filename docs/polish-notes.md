# Zuno Polish Notes

These notes track product polish issues found during real chat testing. They are not blockers for the current core milestone.

## Chat Test: Subject, Chapter, and Difficulty Flow

Observed conversation:

```text
hello
mai aaj chemistry padhna chahta hu..
mujhe chemistry ka chapter 4 padhna hai
biology ke second chapter padhao
biology me kaun sa chpater bahot tough hai
is me se kaun sa chapter tough hai padhna
```

## What Worked

- Greeting flow works.
- Chapter-specific lesson flow works for Chemistry chapter 4.
- Chapter-specific lesson flow works for Biology chapter 2.
- Lesson responses include sources from retrieved content.
- Basic typos such as `chpater` still route to a useful response.
- Hinglish teaching style is mostly understandable for students.

## Problems To Polish Later

### 1. Subject-only study intent starts a lesson too early

When the student says:

```text
mai aaj chemistry padhna chahta hu
```

Zuno should not immediately start Chemistry chapter 1. It should list available Chemistry chapters and ask which chapter to start.

Expected behavior:

```text
Chemistry me 5 chapters available hain:
1. Chemical Reactions and Equations
2. Acids, Bases and Salts
3. Metals and Non-metals
4. Carbon and Its Compounds
5. Periodic Classification of Elements

Kaunsa chapter start karein?
```

### 2. Subjective difficulty questions need a guardrail

When the student asks:

```text
biology me kaun sa chapter bahot tough hai
```

Zuno should avoid guessing if the approved content does not contain difficulty ranking.

Better behavior:

```text
Mere available study material me chapters ki difficulty ranking nahi di gayi hai. Main topics ke count aur complexity ke basis par study plan suggest kar sakta hoon.
```

### 3. Follow-up context can over-focus on current chapter

After Biology chapter 2 lesson, the student asked:

```text
is me se kaun sa chapter tough hai padhna
```

Zuno answered mostly from the current chapter context. For "is me se", it should connect to the last listed Biology chapter options, not only the current lesson topic.

### 4. Source display is too noisy

Current source display can repeat similar sources and show long heading paths.

Needed later:

- Deduplicate repeated sources.
- Number sources clearly.
- Keep source labels compact.
- Prefer frontend source chips for readability.

### 5. Tone should be more consistent

Zuno sometimes says:

```text
Namaste students
```

The product voice should feel like a personal tutor, not a classroom announcement.

Better tone:

```text
Chalo, aaj hum...
```

### 6. Hinglish wording needs a later polish pass

Examples found:

- `Importan exam points` typo.
- `pratihaar` feels unnatural for students; `response` is simpler.

## Suggested Priority Later

1. Fix subject-only study intent.
2. Add subjective difficulty guardrail.
3. Improve follow-up context for "is me se" / listed options.
4. Deduplicate and compact sources.
5. Polish Zuno tone and Hinglish wording.
