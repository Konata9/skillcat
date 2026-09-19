/**
 * Registry of known agents and where each one looks for skills, relative to a
 * project root and to the home directory. This is the single table to extend
 * when a new agent should be recognized — project discovery markers and scan
 * dirs are both derived from it.
 */
export interface AgentDef {
  id: string;
  display: string;
  /**
   * Skills dirs relative to a project root, in priority order (agent-native
   * first, then the `npx skills` install target and compatibility locations).
   * Empty when project scope is unsupported.
   */
  projectDirs: string[];
  /**
   * Skills dirs relative to the home dir, in priority order. Empty when global
   * scope is unsupported.
   */
  globalDirs: string[];
}

type Dirs = string | string[] | null;
type Row = [id: string, display: string, projectDirs: Dirs, globalDirs: Dirs];

function normalizeDirs(value: Dirs): string[] {
  if (value === null) return [];
  return Array.isArray(value) ? value : [value];
}

const ROWS: Row[] = [
  ['aider-desk', 'AiderDesk', '.aider-desk/skills', '.aider-desk/skills'],
  [
    'amp',
    'Amp',
    ['.agents/skills', '.claude/skills'],
    ['.config/agents/skills', '.agents/skills', '.config/amp/skills', '.claude/skills'],
  ],
  ['replit', 'Replit', '.agents/skills', '.config/agents/skills'],
  ['universal', 'Universal', '.agents/skills', '.config/agents/skills'],
  [
    'antigravity',
    'Antigravity',
    ['.agents/skills', '.agent/skills'],
    ['.gemini/antigravity/skills', '.gemini/config/skills'],
  ],
  [
    'antigravity-cli',
    'Antigravity CLI',
    ['.agents/skills', '.agent/skills'],
    '.gemini/antigravity-cli/skills',
  ],
  ['astrbot', 'AstrBot', 'data/skills', '.astrbot/data/skills'],
  [
    'autohand-code',
    'Autohand Code CLI',
    ['.autohand/skills', '.claude/skills'],
    ['.autohand/skills', '.claude/skills', '.codex/skills'],
  ],
  [
    'augment',
    'Augment',
    ['.augment/skills', '.claude/skills', '.agents/skills'],
    ['.augment/skills', '.claude/skills', '.agents/skills'],
  ],
  ['bob', 'IBM Bob', '.bob/skills', '.bob/skills'],
  ['claude-code', 'Claude Code', '.claude/skills', '.claude/skills'],
  ['openclaw', 'OpenClaw', 'skills', '.openclaw/skills'],
  [
    'cline',
    'Cline',
    ['.agents/skills', '.cline/skills', '.clinerules/skills', '.claude/skills'],
    ['.agents/skills', '.cline/skills'],
  ],
  ['dexto', 'Dexto', '.agents/skills', '.agents/skills'],
  [
    'kimi-code-cli',
    'Kimi Code CLI',
    ['.agents/skills', '.kimi/skills', '.claude/skills', '.codex/skills'],
    ['.agents/skills', '.kimi/skills', '.claude/skills', '.codex/skills', '.config/agents/skills'],
  ],
  ['loaf', 'Loaf', '.agents/skills', '.agents/skills'],
  [
    'sarvam-code',
    'Sarvam Code',
    ['.agents/skills', '.sarvam/skills'],
    ['.agents/skills', '.sarvam/skills'],
  ],
  [
    'warp',
    'Warp',
    [
      '.agents/skills',
      '.warp/skills',
      '.claude/skills',
      '.codex/skills',
      '.cursor/skills',
      '.gemini/skills',
      '.copilot/skills',
      '.factory/skills',
      '.github/skills',
      '.opencode/skills',
    ],
    [
      '.agents/skills',
      '.warp/skills',
      '.claude/skills',
      '.codex/skills',
      '.cursor/skills',
      '.gemini/skills',
      '.copilot/skills',
      '.factory/skills',
      '.github/skills',
      '.opencode/skills',
    ],
  ],
  ['zed', 'Zed', '.agents/skills', '.agents/skills'],
  ['codearts-agent', 'CodeArts Agent', '.codeartsdoer/skills', '.codeartsdoer/skills'],
  ['codebuddy', 'CodeBuddy', '.codebuddy/skills', '.codebuddy/skills'],
  ['codemaker', 'Codemaker', '.codemaker/skills', '.codemaker/skills'],
  ['codestudio', 'Code Studio', '.codestudio/skills', '.codestudio/skills'],
  [
    'codex',
    'Codex',
    ['.agents/skills', '.codex/skills'],
    ['.codex/skills', '.agents/skills'],
  ],
  [
    'command-code',
    'Command Code',
    ['.commandcode/skills', '.agents/skills'],
    ['.commandcode/skills', '.agents/skills'],
  ],
  [
    'continue',
    'Continue',
    ['.continue/skills', '.claude/skills'],
    '.continue/skills',
  ],
  [
    'cortex',
    'Cortex Code',
    ['.cortex/skills', '.snowflake/cortex/skills'],
    '.snowflake/cortex/skills',
  ],
  [
    'crush',
    'Crush',
    ['.agents/skills', '.crush/skills', '.claude/skills', '.cursor/skills'],
    ['.config/agents/skills', '.config/crush/skills', '.agents/skills', '.claude/skills'],
  ],
  [
    'cursor',
    'Cursor',
    ['.cursor/skills', '.agents/skills', '.claude/skills', '.codex/skills'],
    ['.cursor/skills', '.agents/skills', '.claude/skills', '.codex/skills'],
  ],
  [
    'deepagents',
    'Deep Agents',
    ['.agents/skills', '.deepagents/skills'],
    ['.deepagents/agent/skills', '.agents/skills'],
  ],
  [
    'devin',
    'Devin for Terminal',
    ['.agents/skills', '.devin/skills', '.windsurf/skills'],
    ['.config/devin/skills', '.agents/skills', '.codeium/windsurf/skills'],
  ],
  [
    'droid',
    'Droid',
    ['.factory/skills', '.agents/skills', '.agent/skills'],
    ['.factory/skills', '.agents/skills', '.agent/skills'],
  ],
  ['eve', 'Eve', 'agent/skills', null],
  [
    'firebender',
    'Firebender',
    ['.firebender/skills', '.agents/skills'],
    [
      '.firebender/skills',
      '.agents/skills',
      '.goose/skills',
      '.claude/skills',
      '.codex/skills',
      '.cursor/skills',
    ],
  ],
  [
    'forgecode',
    'ForgeCode',
    '.forge/skills',
    ['.forge/skills', 'forge/skills', '.agents/skills'],
  ],
  [
    'fx',
    'fx',
    ['skills', '.opencode/skills', '.codex/skills', '.claude/skills', '.agents/skills', '.claw/skills'],
    [
      '.fx/skills',
      '.config/opencode/skills',
      '.codex/skills',
      '.claude/skills',
      '.agents/skills',
      '.claw/skills',
    ],
  ],
  [
    'gemini-cli',
    'Gemini CLI',
    ['.agents/skills', '.gemini/skills'],
    ['.agents/skills', '.gemini/skills'],
  ],
  [
    'github-copilot',
    'GitHub Copilot',
    ['.agents/skills', '.github/skills', '.claude/skills'],
    ['.copilot/skills', '.agents/skills', '.claude/skills'],
  ],
  [
    'goose',
    'Goose',
    ['.agents/skills', '.goose/skills', '.claude/skills'],
    ['.config/goose/skills', '.agents/skills', '.claude/skills', '.config/agents/skills'],
  ],
  [
    'grok',
    'Grok Build',
    ['.grok/skills', '.claude/skills', '.cursor/skills', '.agents/skills'],
    ['.grok/skills', '.claude/skills', '.cursor/skills', '.agents/skills'],
  ],
  [
    'hermes-agent',
    'Hermes Agent',
    ['.hermes/skills', '.agents/skills'],
    '.hermes/skills',
  ],
  ['inference-sh', 'inference.sh', '.inferencesh/skills', '.inferencesh/skills'],
  ['jazz', 'Jazz', '.jazz/skills', '.jazz/skills'],
  [
    'junie',
    'Junie',
    ['.junie/skills', '.agents/skills'],
    ['.junie/skills', '.agents/skills'],
  ],
  ['iflow-cli', 'iFlow CLI', '.iflow/skills', '.iflow/skills'],
  [
    'kilo',
    'Kilo Code',
    ['.kilo/skills', '.agents/skills', '.claude/skills', '.kilocode/skills'],
    ['.kilo/skills', '.agents/skills', '.claude/skills', '.kilocode/skills'],
  ],
  ['kimchi', 'Kimchi', '.kimchi/skills', '.config/kimchi/harness/skills'],
  ['kiro-cli', 'Kiro CLI', '.kiro/skills', '.kiro/skills'],
  ['kode', 'Kode', '.kode/skills', '.kode/skills'],
  [
    'lingma',
    'Lingma',
    ['.lingma/skills', '.qoder/skills'],
    ['.lingma/skills', '.qoder-cn/skills'],
  ],
  [
    'mcpjam',
    'MCPJam',
    ['.mcpjam/skills', '.claude/skills', '.agents/skills'],
    ['.mcpjam/skills', '.claude/skills', '.agents/skills'],
  ],
  ['minimax-code', 'MiniMax Code', '.minimax/skills', '.minimax/skills'],
  [
    'mistral-vibe',
    'Mistral Vibe',
    ['.vibe/skills', '.agents/skills'],
    '.vibe/skills',
  ],
  ['moxby', 'Moxby', '.moxby/skills', '.moxby/skills'],
  [
    'mux',
    'Mux',
    ['.mux/skills', '.xum/skills', '.agents/skills'],
    ['.mux/skills', '.xum/skills', '.agents/skills'],
  ],
  [
    'opencode',
    'OpenCode',
    ['.opencode/skills', '.agents/skills', '.claude/skills'],
    ['.config/opencode/skills', '.agents/skills', '.claude/skills'],
  ],
  [
    'openhands',
    'OpenHands',
    ['.openhands/skills', '.agents/skills'],
    ['.openhands/skills', '.agents/skills'],
  ],
  [
    'ona',
    'Ona',
    ['.ona/skills', '.claude/skills', '.agents/skills'],
    '.ona/skills',
  ],
  [
    'pi',
    'Pi',
    ['.pi/skills', '.agents/skills'],
    ['.pi/agent/skills', '.agents/skills'],
  ],
  [
    'posit-assistant',
    'Posit Assistant',
    ['.posit/assistant/skills', '.agents/skills'],
    ['.posit/assistant/skills', '.agents/skills'],
  ],
  ['qoder', 'Qoder', '.qoder/skills', '.qoder/skills'],
  ['qoder-cn', 'Qoder CN', '.qoder/skills', '.qoder-cn/skills'],
  [
    'qwen-code',
    'Qwen Code',
    ['.qwen/skills', '.agents/skills'],
    ['.qwen/skills', '.agents/skills'],
  ],
  ['reasonix', 'Reasonix', '.reasonix/skills', '.reasonix/skills'],
  [
    'rovodev',
    'Rovo Dev',
    ['.rovodev/skills', '.agents/skills'],
    ['.rovodev/skills', '.agents/skills'],
  ],
  [
    'roo',
    'Roo Code',
    ['.roo/skills', '.agents/skills'],
    ['.roo/skills', '.agents/skills'],
  ],
  [
    'tabnine-cli',
    'Tabnine CLI',
    ['.tabnine/agent/skills', '.agents/skills'],
    ['.tabnine/agent/skills', '.agents/skills'],
  ],
  ['terramind', 'Terramind', '.terramind/skills', '.terramind/skills'],
  ['tinycloud', 'Tinycloud', '.tinycloud/skills', '.tinycloud/skills'],
  [
    'trae',
    'Trae',
    ['.trae/skills', '.agents/skills'],
    '.trae/skills',
  ],
  [
    'trae-cn',
    'Trae CN',
    ['.trae/skills', '.agents/skills'],
    '.trae-cn/skills',
  ],
  [
    'windsurf',
    'Windsurf',
    ['.windsurf/skills', '.agents/skills', '.claude/skills'],
    ['.codeium/windsurf/skills', '.agents/skills', '.claude/skills'],
  ],
  ['zcode', 'ZCode', '.zcode/skills', '.zcode/skills'],
  [
    'zencoder',
    'Zencoder',
    ['.zencoder/skills', '.agents/skills', '.claude/skills'],
    ['.zencoder/skills', '.agents/skills'],
  ],
  [
    'zenflow',
    'Zenflow',
    ['.zencoder/skills', '.agents/skills', '.claude/skills'],
    ['.zencoder/skills', '.agents/skills'],
  ],
  ['neovate', 'Neovate', '.neovate/skills', '.neovate/skills'],
  [
    'pochi',
    'Pochi',
    ['.pochi/skills', '.agents/skills'],
    ['.pochi/skills', '.agents/skills'],
  ],
  ['promptscript', 'PromptScript', '.agents/skills', null],
  ['adal', 'AdaL', '.adal/skills', '.adal/skills'],
];

export const AGENTS: AgentDef[] = ROWS.map(([id, display, projectDirs, globalDirs]) => ({
  id,
  display,
  projectDirs: normalizeDirs(projectDirs),
  globalDirs: normalizeDirs(globalDirs),
}));

const byId = new Map(AGENTS.map((a) => [a.id, a]));

export function getAgentById(id: string): AgentDef | undefined {
  return byId.get(id);
}
