/**
 * Berget AI chat models available in OpenCode
 */

export function getBergetModels(): Record<string, object> {
  return {
    "glm-4.7": {
      name: "GLM-4.7",
      limit: { output: 4000, context: 200000 },
      modalities: { input: ["text"], output: ["text"] },
    },
    "gpt-oss": {
      name: "GPT-OSS",
      limit: { output: 4000, context: 128000 },
      modalities: { input: ["text", "image"], output: ["text"] },
    },
    "llama-3.3-70b": {
      name: "Llama 3.3 70B Instruct",
      limit: { output: 4000, context: 32768 },
    },
    "llama-3.1-8b": {
      name: "Llama 3.1 8B Instruct",
      limit: { output: 4000, context: 32768 },
    },
    "mistral-small": {
      name: "Mistral Small 3.2 24B",
      limit: { output: 4000, context: 32768 },
    },
  };
}
