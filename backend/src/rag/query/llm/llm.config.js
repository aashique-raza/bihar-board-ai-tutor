export const LLM_PROVIDERS = {
  groq: 'groq',
  openai: 'openai',
  google: 'google',
};

const DEFAULT_MODELS = {
  [LLM_PROVIDERS.groq]: 'llama-3.3-70b-versatile',
  [LLM_PROVIDERS.openai]: 'gpt-4o-mini',
  [LLM_PROVIDERS.google]: 'gemini-2.0-flash',
};

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const getLlmConfig = () => {
  const provider = (process.env.LLM_PROVIDER || LLM_PROVIDERS.groq).toLowerCase();

  if (!Object.values(LLM_PROVIDERS).includes(provider)) {
    throw new Error(
      `Unsupported LLM_PROVIDER "${provider}". Use one of: groq, openai, google.`
    );
  }

  return {
    provider,
    model: process.env.LLM_MODEL || DEFAULT_MODELS[provider],
    temperature: toNumber(process.env.LLM_TEMPERATURE, 0),
  };
};
