import type { SkillmanApi } from '../../shared/contract';

declare global {
  interface Window {
    skillman: SkillmanApi;
  }
}

export {};
