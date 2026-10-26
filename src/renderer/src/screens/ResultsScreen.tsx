import type { CombatMode, MatchResult, ProfileData } from '@shared/types'
import {
  IconCheck,
  IconCrosshair,
  IconHistory,
  IconLogout,
  IconPlay,
  IconShield,
  IconUsers
} from '../components/Icons'
import { formatPercent } from '../utils/format'
import { teamLabel } from '../utils/teamLabels'
import type { RoomSession } from '../types'

interface ResultsScreenProps {
  session: RoomSession
  profile: ProfileData
  historySaved: boolean
  onReturnLobby: () => void
  onLeave: () => void
}

function outcomeLabel(
  result: MatchResult,
  team: 'red' | 'blue' | null,
  mode: CombatMode
): string {
  if (result.winner === 'draw') return '平局'
  if (team === null) return `${teamLabel(result.winner, mode)}获胜`
  return result.winner === team ? '胜利' : '失败'
}

export function ResultsScreen({
  session,
  profile,
  historySaved,
  onReturnLobby,
  onLeave
}: ResultsScreenProps): React.JSX.Element {
  const result = session.room.result
  if (!result) {
    return (
      <div className="results-screen screen">
        <div className="screen-bg" aria-hidden="true" />
        <div className="results-waiting">
          <IconHistory />
          <h2>正在生成结算数据…</h2>
          <button className="ghost-button" onClick={onLeave}>
            离开房间
          </button>
        </div>
      </div>
    )
  }

  const me = result.players.find((player) => player.id === profile.id)
  const myTeam = me?.team ?? null
  const myOutcome = outcomeLabel(result, myTeam, session.mode)
  const sortedPlayers = [...result.players].sort((a, b) => {
    if (b.kills !== a.kills) return b.kills - a.kills
    if (a.deaths !== b.deaths) return a.deaths - b.deaths
    return b.accuracy - a.accuracy
  })

  return (
    <div className={`results-screen screen results-screen--${result.winner}`}>
      <div className="screen-bg" aria-hidden="true" />
      <header className="results-header">
        <div className="results-header__brand">
          <IconCrosshair />
          <span>SNAPFIRE // MATCH REPORT</span>
        </div>
        <span className="eyebrow">
          {session.mode === 'long-march'
            ? 'LONG MARCH · TEAM DEATHMATCH'
            : 'URBAN TEAM DEATHMATCH'}
        </span>
      </header>

      <main className="results-main">
        <section className="results-banner">
          <span className="eyebrow">MATCH COMPLETE</span>
          <h1>
            {result.winner === 'draw'
              ? '平局'
              : `${teamLabel(result.winner, session.mode)}获胜`}
          </h1>
          {myTeam && (
            <p className={`results-outcome results-outcome--${myOutcome === '胜利' ? 'win' : myOutcome === '失败' ? 'loss' : 'draw'}`}>
              你的结果：{myOutcome}
            </p>
          )}
          <div className="results-score">
            <div className="results-score__side results-score__side--red">
              <span>{teamLabel('red', session.mode)}</span>
              <strong>{result.score.red}</strong>
            </div>
            <span className="results-score__divider">:</span>
            <div className="results-score__side results-score__side--blue">
              <span>{teamLabel('blue', session.mode)}</span>
              <strong>{result.score.blue}</strong>
            </div>
          </div>
          <div className="results-meta">
            <span>
              <IconCrosshair />{' '}
              {session.mode === 'long-march' ? '长征 90 周年 · 常规' : '巷战 · 室内'}
            </span>
            <span>
              <IconShield /> {result.durationMin} 分钟 / {result.killLimit} 杀
            </span>
            <span>
              <IconUsers /> {result.players.length} 名玩家
            </span>
          </div>
        </section>

        <section className="results-table-wrap">
          <div className="panel__head">
            <span>本局战绩</span>
            <span className="panel__tag">SERVER RESULT</span>
          </div>
          <table className="results-table">
            <thead>
              <tr>
                <th>#</th>
                <th>玩家</th>
                <th>队伍</th>
                <th>击杀</th>
                <th>死亡</th>
                <th>命中率</th>
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((player, index) => (
                <tr
                  key={player.id}
                  className={player.id === profile.id ? 'is-self' : ''}
                >
                  <td>{index + 1}</td>
                  <td>
                    {player.name}
                    {player.id === profile.id && <span className="micro-tag">你</span>}
                  </td>
                  <td>
                    <span className={`team-pill team-pill--${player.team}`}>
                      {teamLabel(player.team, session.mode)}
                    </span>
                  </td>
                  <td className="mono">{player.kills}</td>
                  <td className="mono">{player.deaths}</td>
                  <td className="mono">{formatPercent(player.accuracy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="results-side">
          <div className="results-personal">
            <div className="panel__head">
              <span>个人数据</span>
            </div>
            {me ? (
              <div className="results-personal__grid">
                <div>
                  <span>击杀</span>
                  <strong>{me.kills}</strong>
                </div>
                <div>
                  <span>死亡</span>
                  <strong>{me.deaths}</strong>
                </div>
                <div>
                  <span>命中率</span>
                  <strong>{formatPercent(me.accuracy)}</strong>
                </div>
                <div>
                  <span>命中 / 射击</span>
                  <strong>
                    {me.hits} / {me.shots}
                  </strong>
                </div>
              </div>
            ) : (
              <p className="empty-copy">本局没有找到你的个人数据。</p>
            )}
          </div>

          <div className="results-save-state">
            {historySaved ? (
              <>
                <IconCheck />
                <span>战绩已保存到本机</span>
              </>
            ) : (
              <>
                <IconHistory />
                <span>正在保存战绩…</span>
              </>
            )}
          </div>

          <div className="results-actions">
            {session.isHost ? (
              <button className="primary-button primary-button--large" onClick={onReturnLobby}>
                <IconPlay />
                返回大厅
              </button>
            ) : (
              <div className="waiting-box">
                <IconShield />
                <div>
                  <strong>等待房主返回大厅</strong>
                  <span>房主返回后，所有人会自动回到大厅</span>
                </div>
              </div>
            )}
            <button className="ghost-button danger-text" onClick={onLeave}>
              <IconLogout />
              离开房间
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
