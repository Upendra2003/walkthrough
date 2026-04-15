"use strict";
/**
 * ConfigManager — stores LLM provider/model/key in VS Code SecretStorage
 * and non-sensitive settings in VS Code workspace configuration.
 *
 * Sarvam API key is also managed here (SecretStorage), but the .env file
 * SARVAM_API_KEY remains supported as a developer fallback.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigManager = exports.ANTHROPIC_MODELS = exports.OPENAI_MODELS = exports.GROQ_MODELS = void 0;
const vscode = require("vscode");
exports.GROQ_MODELS = [
    { id: "qwen/qwen3-32b", label: "Qwen3 32B — Recommended" },
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant — Fastest" },
    { id: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill 70B" },
    { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B 32K" },
    { id: "gemma2-9b-it", label: "Gemma 2 9B" },
    { id: "llama3-70b-8192", label: "Llama 3 70B" },
    { id: "llama3-8b-8192", label: "Llama 3 8B" },
];
exports.OPENAI_MODELS = [
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini — Fast" },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { id: "o1-mini", label: "o1 Mini — Reasoning" },
];
exports.ANTHROPIC_MODELS = [
    { id: "claude-opus-4-6", label: "Claude Opus 4.6 — Most capable" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 — Recommended" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 — Fastest" },
];
// ── Secret + setting keys ─────────────────────────────────────────────────────
const S_LLM_KEY = "walkthrough.llmApiKey";
const S_SARVAM_KEY = "walkthrough.sarvamApiKey";
const S_EMBED_KEY = "walkthrough.embeddingApiKey";
const CFG_PROVIDER = "walkthrough.provider";
const CFG_MODEL = "walkthrough.model";
const CFG_CUSTOM = "walkthrough.customBaseUrl";
const CFG_EMBED_PROV = "walkthrough.embeddingProvider";
// ── Manager ───────────────────────────────────────────────────────────────────
class ConfigManager {
    constructor(secrets) {
        this.secrets = secrets;
    }
    async getConfig() {
        const cfg = vscode.workspace.getConfiguration();
        const apiKey = (await this.secrets.get(S_LLM_KEY)) ?? process.env.GROQ_API_KEY ?? "";
        const sarvamKey = (await this.secrets.get(S_SARVAM_KEY)) ?? process.env.SARVAM_API_KEY ?? "";
        const embeddingApiKey = (await this.secrets.get(S_EMBED_KEY))
            ?? process.env.JINA_API_KEY
            ?? process.env.EMBEDDING_API_KEY
            ?? "";
        const provider = cfg.get(CFG_PROVIDER, "groq");
        const model = cfg.get(CFG_MODEL, "qwen/qwen3-32b");
        const customBase = cfg.get(CFG_CUSTOM, "");
        const embeddingProv = cfg.get(CFG_EMBED_PROV, "jina");
        return {
            provider, model, apiKey, sarvamApiKey: sarvamKey,
            customBaseUrl: customBase,
            embeddingProvider: embeddingProv,
            embeddingApiKey,
        };
    }
    async saveConfig(config) {
        await this.secrets.store(S_LLM_KEY, config.apiKey);
        await this.secrets.store(S_SARVAM_KEY, config.sarvamApiKey);
        await this.secrets.store(S_EMBED_KEY, config.embeddingApiKey);
        const cfg = vscode.workspace.getConfiguration();
        await cfg.update(CFG_PROVIDER, config.provider, vscode.ConfigurationTarget.Global);
        await cfg.update(CFG_MODEL, config.model, vscode.ConfigurationTarget.Global);
        await cfg.update(CFG_CUSTOM, config.customBaseUrl, vscode.ConfigurationTarget.Global);
        await cfg.update(CFG_EMBED_PROV, config.embeddingProvider, vscode.ConfigurationTarget.Global);
    }
    /**
     * Returns true if both an LLM key and a Sarvam key are available
     * (either via SecretStorage or .env fallback).
     */
    async isConfigured() {
        const llm = (await this.secrets.get(S_LLM_KEY)) ?? process.env.GROQ_API_KEY;
        const sarvam = (await this.secrets.get(S_SARVAM_KEY)) ?? process.env.SARVAM_API_KEY;
        return !!(llm?.trim() && sarvam?.trim());
    }
}
exports.ConfigManager = ConfigManager;
//# sourceMappingURL=config.js.map