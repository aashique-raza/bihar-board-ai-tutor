/**
 * test-openai-caching.js
 *
 * OpenAI gpt-4o-mini par prompt caching verify karta hai.
 * OpenAI automatic caching karta hai jab prompt > 1024 tokens ho.
 *
 * Run: node backend/scripts/test-openai-caching.js
 */

import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('❌ OPENAI_API_KEY missing in .env file!');
  console.error('   Line 24 mein # hatao: OPENAI_API_KEY=sk-proj-...');
  process.exit(1);
}

const openai = new OpenAI({ apiKey });

// ─── Realistic system prompt (~1700 tokens, same as Zuno tutor) ───────────────
// OpenAI caching sirf tab kaam karti hai jab prompt >= 1024 tokens ho
const ZUNO_SYSTEM_PROMPT = `
Tu Zuno hai — Bihar Board Class 10 Science ka dedicated AI tutor.
Tera ek hi kaam hai: students ko Science padhana — simple, clear, aur Hinglish mein.

═══════════════════════════════════════════════════
CORE IDENTITY
═══════════════════════════════════════════════════
- Tu Zuno hai. Tu ek AI tutor hai, insaan nahi.
- Kabhi claim mat kar ki tu insaan hai ya teacher hai physically.
- Warmth rakh lekin professional reh.

═══════════════════════════════════════════════════
LANGUAGE RULES (NON-NEGOTIABLE)
═══════════════════════════════════════════════════
- Hamesha Roman-script Hinglish mein jawab de.
- Devanagari (Hindi script) use mat kar answer mein.
- Simple words use kar — jaise ek dost samjhata hai.
- Technical terms ek baar English mein batao, phir Hinglish mein explain karo.

═══════════════════════════════════════════════════
CONTENT RULES (MOST IMPORTANT)
═══════════════════════════════════════════════════
- SIRF retrieved study content se jawab de.
- Agar content nahi mila — clearly bol: "Mujhe is topic ki information nahi mili."
- General knowledge se KABHI jawab mat de. Ye product ka core rule hai.
- Hallucinate mat kar — agar uncertain ho to bol do.

═══════════════════════════════════════════════════
PHYSICS TOPICS (Class 10)
═══════════════════════════════════════════════════
Light - Reflection aur Refraction, Lenses, Mirrors, Human Eye,
Electricity - Current, Resistance, Ohm's Law, Circuits, Power,
Magnetic Effects of Electric Current,
Sources of Energy

═══════════════════════════════════════════════════
CHEMISTRY TOPICS (Class 10)
═══════════════════════════════════════════════════
Chemical Reactions and Equations,
Acids Bases and Salts,
Metals and Non-metals,
Carbon and its Compounds,
Periodic Classification of Elements

═══════════════════════════════════════════════════
BIOLOGY TOPICS (Class 10)
═══════════════════════════════════════════════════
Life Processes - Nutrition, Respiration, Transportation, Excretion,
Control and Coordination - Nervous System, Hormones,
How do Organisms Reproduce,
Heredity and Evolution,
Our Environment,
Management of Natural Resources

═══════════════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════════════
Hamesha valid JSON return kar is exact format mein:
{
  "status": "answered" | "insufficient_context" | "out_of_scope",
  "responseMode": "study_tutor" | "conversation",
  "title": "Topic ka naam",
  "sections": [
    { "heading": "Section heading", "content": "Content here" }
  ],
  "suggestedActions": ["Action 1", "Action 2"],
  "memoryUpdate": {}
}

═══════════════════════════════════════════════════
ANTI-REPETITION RULE
═══════════════════════════════════════════════════
Agar student wohi cheez dobara pooche jo tune pehle explain ki —
naya angle, naya example, naya analogy use kar. Copy-paste mat karo.

═══════════════════════════════════════════════════
ANALOGY RULE
═══════════════════════════════════════════════════
Bihar/UP context ke analogies use kar — khet, tube-well, bijli, market.
Analogies helpful hain lekin over-use mat karo. Ek analogy per concept kaafi hai.
`.trim();

// Token count estimate
const estimatedTokens = Math.round(ZUNO_SYSTEM_PROMPT.length / 4);
console.log(`\nZUNO SYSTEM PROMPT: ~${estimatedTokens} tokens`);
console.log(`OpenAI caching threshold: 1024 tokens`);
console.log(`Status: ${estimatedTokens >= 1024 ? '✅ Threshold met — caching should activate' : '❌ Too short — caching will NOT activate'}\n`);

async function sendRequest(turn) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: ZUNO_SYSTEM_PROMPT },
      { role: 'user', content: 'Photosynthesis kya hai? Ek line mein batao.' },
    ],
    max_tokens: 80,
    temperature: 0,
  });

  const usage = response.usage;
  const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const totalInput = usage?.prompt_tokens ?? 0;
  const cachePct = totalInput > 0 ? ((cached / totalInput) * 100).toFixed(1) : '0.0';

  return { turn, totalInput, cached, cachePct, usage };
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  OPENAI gpt-4o-mini — PROMPT CACHING VERIFICATION');
  console.log('═'.repeat(60));
  console.log('\n5 identical requests bhejenge...');
  console.log('(Request #1 = cold start, #2 onward = cache hits expected)\n');

  const results = [];

  for (let i = 1; i <= 5; i++) {
    try {
      process.stdout.write(`Request #${i}: `);
      const result = await sendRequest(i);
      results.push(result);

      if (result.cached > 0) {
        console.log(`✅ cached:${result.cached} / total_input:${result.totalInput} → ${result.cachePct}% saved`);
      } else {
        console.log(`❌ cached:0 / total_input:${result.totalInput} → 0% saved`);
      }

      // Wait between requests so caching has time to register
      if (i < 5) await new Promise(r => setTimeout(r, 800));

    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      if (err.message.includes('API key')) {
        console.log('\n⚠️  OPENAI_API_KEY .env mein uncomment karo (line 24 mein # hatao)');
        process.exit(1);
      }
    }
  }

  // ── Detailed breakdown ──────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('  FULL usage object (last request):');
  console.log('─'.repeat(60));
  console.log(JSON.stringify(results.at(-1)?.usage, null, 2));

  // ── Summary ────────────────────────────────────────────────────
  const hits = results.filter(r => r.cached > 0);
  const totalSaved = results.reduce((sum, r) => sum + r.cached, 0);
  const avgSaved = results.length > 0 ? Math.round(totalSaved / results.length) : 0;

  console.log('\n' + '═'.repeat(60));
  console.log('  VERDICT');
  console.log('═'.repeat(60));

  if (hits.length >= 3) {
    console.log(`\n✅ OPENAI CACHING KAM KAR RAHI HAI`);
    console.log(`   ${hits.length}/5 requests par cache hit mila`);
    console.log(`   Average cached tokens: ~${avgSaved}/turn`);
    console.log(`   Matlab: har turn par ${avgSaved} tokens FREE`);
    console.log(`\n   ZUNO KE LIYE IMPACT:`);
    const perSession = avgSaved * 12;
    console.log(`   ~${avgSaved} tokens saved × 12 turns/session = ~${perSession} tokens/session`);
    console.log(`   Phase 4 = ENABLED ✅ (no code change needed — already working)`);
  } else if (hits.length > 0) {
    console.log(`\n⚠️  PARTIAL CACHING (${hits.length}/5 hits)`);
    console.log(`   Caching ho rahi hai lekin inconsistent`);
    console.log(`   Production mein hit rate improve hogi (more consistent requests)`);
  } else {
    console.log(`\n❌ CACHING NAHI HO RAHI`);
    console.log(`   Sabhi requests par cached_tokens = 0`);
    console.log(`   Possible reasons:`);
    console.log(`   1. System prompt < 1024 tokens (check upar estimate)`);
    console.log(`   2. OpenAI ne caching disable ki hai is model par`);
    console.log(`   3. Requests ke beech gap bahut zyada tha`);
  }

  console.log('\n' + '═'.repeat(60));
}

main().catch(console.error);
