import type { SkillCatApi } from '../../shared/contract';

declare global {
  interface Window {
    skillcat: SkillCatApi;
  }
}

export {};
