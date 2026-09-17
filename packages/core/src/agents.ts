/**
 * Registry of known agents and where each one looks for skills, relative to a
 * project root and to the home directory. This is the single table to extend
 * when a new agent should be recognized.
 */
export interface AgentDef {
  id: string;
  display: string;
  /** Skills dir relative to a project root, or null when project scope is unsupported. */
  projectDir: string | null;
  /** Skills dir relative to the home dir, or null when global scope is unsupported. */
  globalDir: string | null;
}

type Row = [id: string, display: string, projectDir: string | null, globalDir: string | null];

const ROWS: Row[] = [
  ['aider-desk', 'AiderDesk', '.aider-desk/skills', '.aider-desk/skills'],
  ['amp', 'Amp', '.agents/skills', '.config/agents/skills'],
  ['replit', 'Replit', '.agents/skills', '.config/agents/skills'],
  ['universal', 'Universal', '.agents/skills', '.config/agents/skills'],
  ['antigravity', 'Antigravity', '.agents/skills', '.gemini/antigravity/skills'],
  ['antigravity-cli', 'Antigravity CLI', '.agents/skills', '.gemini/antigravity-cli/skills'],
  ['astrbot', 'AstrBot', 'data/skills', '.astrbot/data/skills'],
  ['autohand-code', 'Autohand Code CLI', '.autohand/skills', '.autohand/skills'],
  ['augment', 'Augment', '.augment/skills', '.augment/skills'],
  ['bob', 'IBM Bob', '.bob/skills', '.bob/skills'],
  ['claude-code', 'Claude Code', '.claude/skills', '.claude/skills'],
  ['openclaw', 'OpenClaw', 'skills', '.openclaw/skills'],
  ['cline', 'Cline', '.agents/skills', '.agents/skills'],
  ['dexto', 'Dexto', '.agents/skills', '.agents/skills'],
  ['kimi-code-cli', 'Kimi Code CLI', '.agents/skills', '.agents/skills'],
  ['loaf', 'Loaf', '.agents/skills', '.agents/skills'],
  ['sarvam-code', 'Sarvam Code', '.agents/skills', '.agents/skills'],
  ['warp', 'Warp', '.agents/skills', '.agents/skills'],
  ['zed', 'Zed', '.agents/skills', '.agents/skills'],
  ['codearts-agent', 'CodeArts Agent', '.codeartsdoer/skills', '.codeartsdoer/skills'],
  ['codebuddy', 'CodeBuddy', '.codebuddy/skills', '.codebuddy/skills'],
  ['codemaker', 'Codemaker', '.codemaker/skills', '.codemaker/skills'],
  ['codestudio', 'Code Studio', '.codestudio/skills', '.codestudio/skills'],
  ['codex', 'Codex', '.agents/skills', '.codex/skills'],
  ['command-code', 'Command Code', '.commandcode/skills', '.commandcode/skills'],
  ['continue', 'Continue', '.continue/skills', '.continue/skills'],
  ['cortex', 'Cortex Code', '.cortex/skills', '.snowflake/cortex/skills'],
  ['crush', 'Crush', '.crush/skills', '.config/crush/skills'],
  ['cursor', 'Cursor', '.agents/skills', '.cursor/skills'],
  ['deepagents', 'Deep Agents', '.agents/skills', '.deepagents/agent/skills'],
  ['devin', 'Devin for Terminal', '.devin/skills', '.config/devin/skills'],
  ['droid', 'Droid', '.agents/skills', '.factory/skills'],
  ['eve', 'Eve', 'agent/skills', null],
  ['firebender', 'Firebender', '.agents/skills', '.firebender/skills'],
  ['forgecode', 'ForgeCode', '.forge/skills', '.forge/skills'],
  ['fx', 'fx', '.fx/skills', '.fx/skills'],
  ['gemini-cli', 'Gemini CLI', '.agents/skills', '.gemini/skills'],
  ['github-copilot', 'GitHub Copilot', '.agents/skills', '.copilot/skills'],
  ['goose', 'Goose', '.goose/skills', '.config/goose/skills'],
  ['grok', 'Grok Build', '.grok/skills', '.grok/skills'],
  ['hermes-agent', 'Hermes Agent', '.hermes/skills', '.hermes/skills'],
  ['inference-sh', 'inference.sh', '.inferencesh/skills', '.inferencesh/skills'],
  ['jazz', 'Jazz', '.jazz/skills', '.jazz/skills'],
  ['junie', 'Junie', '.junie/skills', '.junie/skills'],
  ['iflow-cli', 'iFlow CLI', '.iflow/skills', '.iflow/skills'],
  ['kilo', 'Kilo Code', '.agents/skills', '.kilo/skills'],
  ['kimchi', 'Kimchi', '.kimchi/skills', '.config/kimchi/harness/skills'],
  ['kiro-cli', 'Kiro CLI', '.kiro/skills', '.kiro/skills'],
  ['kode', 'Kode', '.kode/skills', '.kode/skills'],
  ['lingma', 'Lingma', '.lingma/skills', '.lingma/skills'],
  ['mcpjam', 'MCPJam', '.mcpjam/skills', '.mcpjam/skills'],
  ['minimax-code', 'MiniMax Code', '.minimax/skills', '.minimax/skills'],
  ['mistral-vibe', 'Mistral Vibe', '.vibe/skills', '.vibe/skills'],
  ['moxby', 'Moxby', '.moxby/skills', '.moxby/skills'],
  ['mux', 'Mux', '.mux/skills', '.mux/skills'],
  ['opencode', 'OpenCode', '.agents/skills', '.config/opencode/skills'],
  ['openhands', 'OpenHands', '.openhands/skills', '.openhands/skills'],
  ['ona', 'Ona', '.ona/skills', '.ona/skills'],
  ['pi', 'Pi', '.pi/skills', '.pi/agent/skills'],
  ['posit-assistant', 'Posit Assistant', '.posit/assistant/skills', '.posit/assistant/skills'],
  ['qoder', 'Qoder', '.qoder/skills', '.qoder/skills'],
  ['qoder-cn', 'Qoder CN', '.qoder/skills', '.qoder-cn/skills'],
  ['qwen-code', 'Qwen Code', '.qwen/skills', '.qwen/skills'],
  ['reasonix', 'Reasonix', '.reasonix/skills', '.reasonix/skills'],
  ['rovodev', 'Rovo Dev', '.rovodev/skills', '.rovodev/skills'],
  ['roo', 'Roo Code', '.roo/skills', '.roo/skills'],
  ['tabnine-cli', 'Tabnine CLI', '.tabnine/agent/skills', '.tabnine/agent/skills'],
  ['terramind', 'Terramind', '.terramind/skills', '.terramind/skills'],
  ['tinycloud', 'Tinycloud', '.tinycloud/skills', '.tinycloud/skills'],
  ['trae', 'Trae', '.trae/skills', '.trae/skills'],
  ['trae-cn', 'Trae CN', '.trae/skills', '.trae-cn/skills'],
  ['windsurf', 'Windsurf', '.windsurf/skills', '.codeium/windsurf/skills'],
  ['zcode', 'ZCode', '.zcode/skills', '.zcode/skills'],
  ['zencoder', 'Zencoder', '.zencoder/skills', '.zencoder/skills'],
  ['zenflow', 'Zenflow', '.zencoder/skills', '.zencoder/skills'],
  ['neovate', 'Neovate', '.neovate/skills', '.neovate/skills'],
  ['pochi', 'Pochi', '.pochi/skills', '.pochi/skills'],
  ['promptscript', 'PromptScript', '.agents/skills', null],
  ['adal', 'AdaL', '.adal/skills', '.adal/skills'],
];

export const AGENTS: AgentDef[] = ROWS.map(([id, display, projectDir, globalDir]) => ({
  id,
  display,
  projectDir,
  globalDir,
}));

const byId = new Map(AGENTS.map((a) => [a.id, a]));

export function getAgentById(id: string): AgentDef | undefined {
  return byId.get(id);
}
