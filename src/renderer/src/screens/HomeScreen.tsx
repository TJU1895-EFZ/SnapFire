import { useMemo, useState } from 'react'
import type { AppInfo, AppSettings } from '@shared/types'
import { OperatorArt } from '../components/OperatorArt'
import {
  IconChevronRight,
  IconCombat,
  IconHistory,
  IconOverview,
  IconSettings,
  IconShield,
  SnapFireMark
} from '../components/Icons'
import { formatDateTime, formatPercent, monogram, shortId } from '../utils/format'
import type { HistoryData, ProfileData } from '@shared/types'

interface HomeScreenProps {
  profile: ProfileData
  settings: AppSettings
  history: HistoryData
  appInfo: AppInfo | null
  onUpdateName: (name: string) => void
  onOpenSettings: () => void
  onOpenHistory: () => void
  onRegularCombat: () => void
  onLongMarch: () => void
}

export function HomeScreen({
  profile,
  history,
  appInfo,
  onUpdateName,
  onOpenSettings,
  onOpenHistory,
  onRegularCombat,
  onLongMarch
}: HomeScreenProps): React.JSX.Element {
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(profile.name)

  const stats = useMemo(() => {
    let matches = 0
    let wins = 0
    let kills = 0
    let deaths = 0
    let shots = 0
    let hits = 0
    for (const match of history.matches) {
      matches += 1
      const me = match.players.find((player) => player.id === profile.id)
      if (!me) continue
      kills += me.kills
      deaths += me.deaths
      shots += me.shots
      hits += me.hits
      if (match.winner === me.team) wins += 1
    }
    return {
      matches,
      wins,
      kills,
      deaths,
      winRate: matches > 0 ? wins / matches : 0,
      accuracy: shots > 0 ? hits / shots : 0
    }
  }, [history, profile.id])

  const commitName = (): void => {
    const clean = draftName.trim().slice(0, 16)
    if (clean && clean !== profile.name) onUpdateName(clean)
    setEditingName(false)
  }

  return (
    <div className="home-screen screen">
      <div className="home-bg" aria-hidden="true" />
      <header className="topbar">
        <div className="brand">
          <SnapFireMark className="brand__mark" />
          <div className="brand__text">
            <strong>SNAPFIRE</strong>
            <span>MIXED REALITY COMBAT</span>
          </div>
        </div>
        <div className="topbar__right">
          <span className="status-chip">
            <span className="status-dot" />
            本地模式 · 离线可用
          </span>
          <span className="version-tag">V{appInfo?.version ?? '0.1.1'}</span>
        </div>
      </header>

      <aside className="sidebar sidebar--left">
        <div className="player-card">
          <div className="avatar">{monogram(profile.name)}</div>
          <div className="player-card__info">
            {editingName ? (
              <input
                className="name-input"
                value={draftName}
                maxLength={16}
                autoFocus
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={commitName}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitName()
                  if (event.key === 'Escape') {
                    setDraftName(profile.name)
                    setEditingName(false)
                  }
                }}
              />
            ) : (
              <button
                className="player-name"
                title="点击修改昵称"
                onClick={() => {
                  setDraftName(profile.name)
                  setEditingName(true)
                }}
              >
                {profile.name}
              </button>
            )}
            <span className="player-id">ID // {shortId(profile.id)}</span>
          </div>
          <span className="local-badge">本地档案</span>
        </div>

        <nav className="side-nav">
          <button className="side-nav__item side-nav__item--active">
            <IconOverview />
            <span>总览</span>
            <span className="side-nav__hint">01</span>
          </button>
          <button className="side-nav__item" onClick={onRegularCombat}>
            <IconCombat />
            <span>作战</span>
            <span className="side-nav__hint">02</span>
          </button>
          <button className="side-nav__item" onClick={onOpenHistory}>
            <IconHistory />
            <span>战绩</span>
            <span className="side-nav__hint">03</span>
          </button>
          <button className="side-nav__item" onClick={onOpenSettings}>
            <IconSettings />
            <span>设置</span>
            <span className="side-nav__hint">04</span>
          </button>
        </nav>

        <div className="sidebar__footer">
          <IconShield />
          <div>
            <strong>本机运行</strong>
            <span>无登录 · 无云端 · 数据不出本机</span>
          </div>
        </div>
      </aside>

      <main className="home-center">
        <div className="operator-stage">
          <div className="stage-caption stage-caption--left">
            <span>OPERATOR</span>
            <strong>READY</strong>
          </div>
          <OperatorArt />
          <div className="stage-caption stage-caption--right">
            <span>MR LINK</span>
            <strong>STABLE</strong>
          </div>
          <div className="stage-scanline" aria-hidden="true" />
          <div className="stage-coords" aria-hidden="true">
            <span>34.0522 N</span>
            <span>118.2437 W</span>
            <span>LOCAL // LAN</span>
          </div>
        </div>

        <div className="home-heading">
          <span className="eyebrow">TACTICAL MIXED REALITY</span>
          <h1>作战行动</h1>
          <p>选择常规作战，或走进长征胜利 90 周年纪念。</p>
        </div>

        <div className="mode-cards">
          <button
            className="mode-card mode-card--active home-mode-card home-mode-card--regular"
            onClick={onRegularCombat}
          >
            <span className="mode-card__icon">
              <IconCombat />
            </span>
            <span className="mode-card__body">
              <span className="mode-card__title">
                常规作战
                <span className="mode-badge">可进入</span>
              </span>
              <span className="mode-card__meta">单人 · 团战 · 夺旗 · 拆弹</span>
            </span>
            <IconChevronRight className="mode-card__arrow" />
          </button>

          <button
            className="mode-card mode-card--active mode-card--campaign home-mode-card home-mode-card--campaign"
            onClick={onLongMarch}
          >
            <span className="mode-card__icon">
              <IconShield />
            </span>
            <span className="mode-card__body">
              <span className="mode-card__title">
                长征胜利 90 周年纪念
                <span className="mode-badge mode-badge--campaign">纪念</span>
              </span>
              <span className="mode-card__meta">导读 · 常规 · 历史场景</span>
            </span>
            <IconChevronRight className="mode-card__arrow" />
          </button>
        </div>
      </main>

      <aside className="sidebar sidebar--right">
        <section className="panel">
          <div className="panel__head">
            <span>总览</span>
            <span className="panel__tag">LOCAL</span>
          </div>
          <div className="stat-grid">
            <div className="stat-cell">
              <span>总场次</span>
              <strong>{stats.matches}</strong>
            </div>
            <div className="stat-cell">
              <span>击杀</span>
              <strong>{stats.kills}</strong>
            </div>
            <div className="stat-cell">
              <span>命中率</span>
              <strong>{formatPercent(stats.accuracy)}</strong>
            </div>
            <div className="stat-cell">
              <span>胜率</span>
              <strong>{formatPercent(stats.winRate)}</strong>
            </div>
          </div>
        </section>

        <section className="panel panel--grow">
          <div className="panel__head">
            <span>最近战绩</span>
            <button className="text-button" onClick={onOpenHistory}>
              全部
            </button>
          </div>
          {history.matches.length === 0 ? (
            <div className="empty-state">
              <IconHistory />
              <span>还没有比赛记录</span>
              <small>完成第一局后，战绩会保存在这里</small>
            </div>
          ) : (
            <div className="recent-list">
              {history.matches.slice(0, 3).map((match) => {
                const me = match.players.find((player) => player.id === profile.id)
                const outcome =
                  match.winner === 'draw'
                    ? '平局'
                    : me
                      ? match.winner === me.team
                        ? '胜利'
                        : '失败'
                      : match.winner === 'red'
                        ? '红队胜'
                        : '蓝队胜'
                return (
                  <div className="recent-row" key={match.matchId}>
                    <div className="recent-row__meta">
                      <span>{formatDateTime(match.endedAt)}</span>
                      <small>
                        巷战 · {match.durationMin} 分钟 / {match.killLimit} 杀
                      </small>
                    </div>
                    <div className="recent-row__score">
                      <span className="score-red">{match.score.red}</span>
                      <span className="score-sep">:</span>
                      <span className="score-blue">{match.score.blue}</span>
                    </div>
                    <span
                      className={`outcome-tag ${
                        outcome === '胜利'
                          ? 'outcome-tag--win'
                          : outcome === '失败'
                            ? 'outcome-tag--loss'
                            : 'outcome-tag--draw'
                      }`}
                    >
                      {outcome}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <div className="local-note">
          <IconShield />
          <div>
            <strong>数据仅保存在本机</strong>
            <span>关闭、重启或刷新后不会丢失</span>
          </div>
        </div>
      </aside>
    </div>
  )
}
