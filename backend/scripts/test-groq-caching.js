/**
 * test-groq-caching.js
 *
 * Verify karta hai ki Groq ke llama models par prompt caching
 * actually kaam karti hai ya nahi.
 *
 * Run: node backend/scripts/test-groq-caching.js
 */

import dotenv from 'dotenv';
import Groq from 'groq-sdk';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Yeh system prompt deliberately lamba hai taaki caching threshold hit ho
const LONG_SYSTEM_PROMPT = `
Tu Zuno hai — Bihar Board Class 10 Science ka ek expert AI tutor.
Tera kaam hai students ko Physics, Chemistry aur Biology padhana
simple Roman-script Hinglish mein.

CORE RULES:
- Sirf indexed study content se jawab de
- Hallucinate mat kar
- Answers Hinglish mein de
- Bihar/UP ke local analogies use kar
- Agar content nahi mila to clearly bol do

PHYSICS TOPICS: Light, Electricity, Magnetic Effects, Sources of Energy,
Human Eye, Refraction, Lenses, Mirrors, Ohm's Law, Circuits, Power.

CHEMISTRY TOPICS: Chemical Reactions, Acids Bases Salts, Metals Nonmetals,
Carbon Compounds, Periodic Classification, Corrosion, Rancidity.

BIOLOGY TOPICS: Life Processes, Control and Coordination, Reproduction,
Heredity and Evolution, Our Environment, Management of Natural Resources.

Yeh sab topics Bihar Board Class 10 Science syllabus mein hain.
Student ke sawaal ka jawab dene se pehle relevant topic identify kar.
Phir sirf usi topic ki information use kar.
`.repeat(3); // Repeat karke lamba banate hain taaki threshold hit ho

const MODELS_TO_TEST = [
  'llama-3.3-70b-versatile',  // Tutor model
  'llama-3.1-8b-instant',     // Decider model
];

async function testCachingForModel(modelName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`MODEL: ${modelName}`);
  console.log('='.repeat(60));

  const results = [];

  // 3 identical requests bhejo
  for (let i = 1; i <= 3; i++) {
    try {
      const response = await groq.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: LONG_SYSTEM_PROMPT },
          { role: 'user', content: 'Photosynthesis kya hai? Short mein batao.' },
        ],
        max_tokens: 100,
        temperature: 0,
      });

      const usage = response.usage;
      const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
      const total_input = usage?.prompt_tokens ?? 0;
      const cache_pct = total_input > 0 ? ((cached / total_input) * 100).toFixed(1) : '0';

      results.push({ turn: i, total_input, cached, cache_pct });

      console.log(`\nRequest #${i}:`);
      console.log(`  Total input tokens : ${total_input}`);
      console.log(`  Cached tokens      : ${cached}`);
      console.log(`  Cache hit %        : ${cache_pct}%`);
      console.log(`  Raw usage object   :`, JSON.stringify(usage, null, 2));

      // 1 second wait between requests
      if (i < 3) await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.log(`  ERROR on request #${i}:`, err.message);
    }
  }

  // Summary
  const anyCacheHit = results.some(r => r.cached > 0);
  console.log(`\n--- VERDICT for ${modelName} ---`);
  if (anyCacheHit) {
    console.log(`✅ CACHING KAM KAR RAHI HAI`);
    console.log(`   Request #2 aur #3 par cached tokens mile`);
  } else {
    console.log(`❌ CACHING NAHI HO RAHI`);
    console.log(`   Teeno requests par cached_tokens = 0`);
    console.log(`   Is model par Groq caching supported nahi hai`);
  }
}

async function main() {
  console.log('GROQ PROMPT CACHING VERIFICATION TEST');
  console.log('Current models in use:');
  console.log('  Tutor   : llama-3.3-70b-versatile');
  console.log('  Decider : llama-3.1-8b-instant');
  console.log('\nSystem prompt length (approx tokens):', Math.round(LONG_SYSTEM_PROMPT.length / 4));

  for (const model of MODELS_TO_TEST) {
    await testCachingForModel(model);
    await new Promise(r => setTimeout(r, 2000)); // models ke beech wait
  }

  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));
}

main().catch(console.error);
