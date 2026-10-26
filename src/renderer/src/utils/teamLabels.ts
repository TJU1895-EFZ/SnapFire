import type { CombatMode, Team } from '@shared/types'

/** Full label used in menus, lobby rows and result headlines. */
export function teamLabel(team: Team, mode: CombatMode): string {
  if (mode === 'long-march') {
    return team === 'red' ? '红军' : '国民党军'
  }
  return team === 'red' ? '红队' : '蓝队'
}

/** Compact label for the battle roster. */
export function teamShortLabel(team: Team, mode: CombatMode): string {
  if (mode === 'long-march') {
    return team === 'red' ? '红' : '国'
  }
  return team === 'red' ? '红' : '蓝'
}
