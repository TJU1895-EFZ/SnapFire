import { useEffect, useMemo, useState } from 'react'
import type {
  AppearanceData,
  PlayerPublic,
  ProfileData,
  RoomSettings,
  Team
} from '@shared/types'
import { MAX_TEAM_SIZE } from '@shared/types'
import {
  IconAlert,
  IconArrowLeft,
  IconCamera,
  IconCheck,
  IconCopy,
  IconCrosshair,
  IconLock,
  IconPlay,
  IconSettings,
  IconShield,
  IconUsers,
  IconWifi,
  IconClose
} from '../components/Icons'
import { copyToClipboard } from '../utils/clipboard'
import { monogram } from '../utils/format'
import { teamLabel } from '../utils/teamLabels'
import { warmupHuman } from '../vision/human'
import type { RoomSession } from '../types'

interface LobbyScreenProps {
  session: RoomSession
  profile: ProfileData
  appearance: AppearanceData | null
  onLeave: () => void
  onOpenEnrollment: () => void
  onSetTeam: (team: Team) => void
  onSetReady: (ready: boolean) => void
  onUpdateSettings: (settings: RoomSettings) => void
  onStart: () => void
  onOpenSettings: () => void
}

function PlayerCard({
  player,
  isSelf
}: {
  player: PlayerPublic
  isSelf: boolean
}): React.JSX.Element {
  return (
    <div
      className={`lobby-player ${player.connected ? '' : 'lobby-player--offline'} ${
        isSelf ? 'lobby-player--self' : ''
      }`}
    >
      <div className={`avatar avatar--tiny avatar--${player.team ?? 'neutral'}`}>
        {monogram(player.name)}
      </div>
      <div className="lobby-player__body">
        <div className="lobby-player__name">
          <span>{player.name}</span>
          {player.isHost && <span className="micro-tag micro-tag--amber">房主</span>}
          {isSelf && <span className="micro-tag">你</span>}
        </div>
        <div className="lobby-player__badges">
          <span className={`micro-status ${player.ready ? 'is-ok' : ''}`}>
            <span className="dot" />
            {player.ready ? '已准备' : '未准备'}
          </span>
          <span className={`micro-status ${player.appearanceReady ? 'is-ok' : 'is-warn'}`}>
            <span className="dot" />
            {player.appearanceReady ? '已建档' : '未建档'}
          </span>
          {!player.connected && <span className="micro-status is-danger">离线</span>}
        </div>
      </div>
      <span className={`team-stripe team-stripe--${player.team ?? 'neutral'}`} />
    </div>
  )
}

function TeamColumn({
  team,
  title,
  players,
  selfId,
  currentTeam,
  canJoin,
  full,
  onJoin
}: {
  team: Team
  title: string
  players: PlayerPublic[]
  selfId: string
  currentTeam: Team | null
  canJoin: boolean
  full: boolean
  onJoin: () => void
}): React.JSX.Element {
  return (
    <section className={`team-column team-column--${team}`}>
      <header className="team-column__head">
        <div className="team-column__title">
          <span className="team-emblem">{team === 'red' ? 'R' : 'B'}</span>
          <div>
            <strong>{title}</strong>
            <span>{players.length} / {MAX_TEAM_SIZE} 人</span>
          </div>
        </div>
        <span className="team-column__count">
          {players.length >= MAX_TEAM_SIZE ? '满员' : `${MAX_TEAM_SIZE - players.length} 个空位`}
        </span>
      </header>

      <div className="team-column__list">
        {players.length === 0 && (
          <div className="team-empty">
            <IconUsers />
            <span>还没有玩家</span>
          </div>
        )}
        {players.map((player) => (
          <PlayerCard key={player.id} player={player} isSelf={player.id === selfId} />
        ))}
      </div>

      <div className="team-column__footer">
        {currentTeam === team ? (
          <span className="team-current">
            <IconCheck /> 你在这个队伍
          </span>
        ) : canJoin ? (
          <button
            className={`team-join team-join--${team}`}
            onClick={onJoin}
            disabled={full}
          >
            {full ? '队伍已满' : `加入${title}`}
          </button>
        ) : (
          <span className="team-current team-current--muted">开局后不可换队</span>
        )}
      </div>
    </section>
  )
}

function ChecklistItem({
  ok,
  children
}: {
  ok: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <li className={`checklist__item ${ok ? 'is-ok' : ''}`}>
      <span className="checklist__icon">{ok ? <IconCheck /> : <IconClose />}</span>
      <span>{children}</span>
    </li>
  )
}

export function LobbyScreen({
  session,
  profile,
  appearance,
  onLeave,
  onOpenEnrollment,
  onSetTeam,
  onSetReady,
  onUpdateSettings,
  onStart,
  onOpenSettings
}: LobbyScreenProps): React.JSX.Element {
  const room = session.room
  const me = room.players.find((player) => player.id === session.selfId)
  const red = room.players.filter((player) => player.team === 'red')
  const blue = room.players.filter((player) => player.team === 'blue')
  const unassigned = room.players.filter((player) => !player.team)
  const connected = room.players.filter((player) => player.connected)

  const [copied, setCopied] = useState<string | null>(null)
  const [duration, setDuration] = useState(room.settings.durationMin)
  const [killLimit, setKillLimit] = useState(room.settings.killLimit)

  useEffect(() => {
    setDuration(room.settings.durationMin)
    setKillLimit(room.settings.killLimit)
  }, [room.settings.durationMin, room.settings.killLimit])

  // Pay the one-off model/shader warmup cost while everyone is still in the
  // lobby so the first shot of the match does not stall the HUD.
  useEffect(() => {
    void warmupHuman()
  }, [])

  const copy = async (text: string, label: string): Promise<void> => {
    const ok = await copyToClipboard(text)
    setCopied(ok ? label : '复制失败')
    window.setTimeout(() => setCopied(null), 1600)
  }

  const commitSettings = (): void => {
    if (duration !== room.settings.durationMin || killLimit !== room.settings.killLimit) {
      onUpdateSettings({ durationMin: duration, killLimit })
    }
  }

  const readiness = useMemo(() => {
    return {
      enough: connected.length >= 2,
      bothTeams: red.length >= 1 && blue.length >= 1,
      allTeams: connected.every((player) => player.team !== null),
      allAppearance: connected.every((player) => player.appearanceReady),
      allReady: connected.every((player) => player.id === room.hostId || player.ready)
    }
  }, [connected, red.length, blue.length, room.hostId])

  const canStart =
    session.isHost &&
    readiness.enough &&
    readiness.bothTeams &&
    readiness.allTeams &&
    readiness.allAppearance &&
    readiness.allReady

  const address = session.address || '—'
  const roomCode = room.roomCode
  const mobileUrl = session.hostInfo?.mobileUrl ?? null
  const mobileInstallUrl = session.hostInfo?.mobileInstallUrl ?? null
  const mobileQr = session.hostInfo?.mobileQr ?? null
  const mobileCertPath = session.hostInfo?.mobileCertPath ?? null
  const mobileError = session.hostInfo?.mobileError ?? null
  const shareText = [
    `SnapFire 房间号：${roomCode}`,
    `桌面地址：${address}`,
    mobileInstallUrl ? `手机安装页：${mobileInstallUrl}` : null,
    mobileUrl ? `手机客户端：${mobileUrl}` : null
  ]
    .filter(Boolean)
    .join('\n')

  const joinTeam = (team: Team): void => {
    onSetTeam(team)
  }

  return (
    <div className="lobby-screen screen">
      <div className="screen-bg" aria-hidden="true" />
      <header className="subpage-header lobby-header">
        <button className="icon-button" onClick={onLeave} aria-label="离开房间">
          <IconArrowLeft />
        </button>
        <div className="subpage-title">
          <span className="eyebrow">
            {session.mode === 'long-march'
              ? 'TEAM DEATHMATCH / LONG MARCH / LOBBY'
              : 'TEAM DEATHMATCH / URBAN / LOBBY'}
          </span>
          <h2>房间大厅</h2>
        </div>
        <div className="lobby-header__room">
          <div className="room-address">
            <span className="room-address__label">房主地址</span>
            <code>{address}</code>
            <button
              className="icon-button icon-button--small"
              onClick={() => void copy(address, '地址已复制')}
              aria-label="复制地址"
            >
              <IconCopy />
            </button>
          </div>
          <div className="room-code-box">
            <span>房间号</span>
            <strong>{roomCode}</strong>
            <button
              className="icon-button icon-button--small"
              onClick={() => void copy(shareText, '房间信息已复制')}
              aria-label="复制房间信息"
            >
              <IconCopy />
            </button>
          </div>
        </div>
        <button className="icon-button" onClick={onOpenSettings} aria-label="设置">
          <IconSettings />
        </button>
      </header>

      {copied && <div className="copy-toast">{copied}</div>}

      <main className="lobby-main">
        <div className="lobby-board">
        {session.isHost && (
          <section className="mobile-join-card">
            <div className="mobile-join-card__icon" aria-hidden="true">
              <IconWifi />
            </div>
            <div className="mobile-join-card__body">
              <div className="mobile-join-card__eyebrow">MOBILE BROWSER CLIENT</div>
              <div className="mobile-join-card__title">手机加入</div>
              {mobileUrl ? (
                <>
                  <div className="mobile-join-card__url">
                    <span className="mobile-join-card__url-label">客户端</span>
                    <code>{mobileUrl}</code>
                    <button
                      className="icon-button icon-button--small"
                      onClick={() => void copy(mobileUrl, '手机地址已复制')}
                      aria-label="复制手机客户端地址"
                    >
                      <IconCopy />
                    </button>
                  </div>
                  {mobileInstallUrl && (
                    <div className="mobile-join-card__url">
                      <span className="mobile-join-card__url-label">安装页</span>
                      <code className="mobile-join-card__install-url">
                        {mobileInstallUrl}
                      </code>
                      <button
                        className="icon-button icon-button--small"
                        onClick={() => void copy(mobileInstallUrl, '手机安装页地址已复制')}
                        aria-label="复制手机安装页地址"
                      >
                        <IconCopy />
                      </button>
                    </div>
                  )}
                  <p className="mobile-join-card__hint">
                    {mobileInstallUrl ? (
                      <>
                        手机扫码打开安装页：先下载并安装 CA 证书，再点“打开手机客户端”。
                        房间号 <strong>{roomCode}</strong>。
                      </>
                    ) : (
                      <>
                        手机浏览器打开此地址，输入房间号 <strong>{roomCode}</strong>。
                        首次使用需在手机上安装 CA 证书。
                      </>
                    )}
                  </p>
                  <div className="mobile-join-card__actions">
                    <button
                      className="ghost-button"
                      onClick={() => void window.snapfire.host.openCertFolder()}
                    >
                      打开证书目录
                    </button>
                    {mobileCertPath && (
                      <code className="mobile-join-card__cert" title={mobileCertPath}>
                        {mobileCertPath}
                      </code>
                    )}
                  </div>
                </>
              ) : (
                <p className="mobile-join-card__error">
                  {mobileError ?? '手机服务未启动'}
                </p>
              )}
            </div>
            {mobileQr && (
              <div className="mobile-join-card__qr">
                <img src={mobileQr} alt="手机安装页二维码" />
                <span>扫码安装证书 / 加入</span>
              </div>
            )}
          </section>
        )}

          <div className="lobby-board__meta">
            <span className="status-chip">
              <span className="status-dot" />
              已连接 · {connected.length} / 6 人
            </span>
            <span className="lobby-mode">
              <IconCrosshair />{' '}
              {session.mode === 'long-march'
                ? '长征 90 周年 · 红军 vs 国民党军'
                : '巷战 · 室内 · 最远 10 米'}
            </span>
            <span className="lobby-mode">
              <IconWifi /> 局域网
            </span>
          </div>

          {unassigned.length > 0 && (
            <div className="unassigned-strip">
              <div className="unassigned-strip__label">
                <IconAlert />
                待编队
              </div>
              <div className="unassigned-strip__players">
                {unassigned.map((player) => (
                  <PlayerCard key={player.id} player={player} isSelf={player.id === session.selfId} />
                ))}
              </div>
              {me && !me.team && (
                <div className="unassigned-strip__actions">
                  <button className="team-join team-join--red" onClick={() => joinTeam('red')} disabled={red.length >= MAX_TEAM_SIZE}>
                    加入{teamLabel('red', session.mode)}
                  </button>
                  <button className="team-join team-join--blue" onClick={() => joinTeam('blue')} disabled={blue.length >= MAX_TEAM_SIZE}>
                    加入{teamLabel('blue', session.mode)}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="teams-grid">
            <TeamColumn
              team="red"
              title={teamLabel('red', session.mode)}
              players={red}
              selfId={session.selfId}
              currentTeam={me?.team ?? null}
              canJoin={Boolean(me) && room.phase === 'lobby'}
              full={red.length >= MAX_TEAM_SIZE}
              onJoin={() => joinTeam('red')}
            />
            <div className="versus-mark" aria-hidden="true">
              <span>VS</span>
            </div>
            <TeamColumn
              team="blue"
              title={teamLabel('blue', session.mode)}
              players={blue}
              selfId={session.selfId}
              currentTeam={me?.team ?? null}
              canJoin={Boolean(me) && room.phase === 'lobby'}
              full={blue.length >= MAX_TEAM_SIZE}
              onJoin={() => joinTeam('blue')}
            />
          </div>
        </div>

        <aside className="lobby-side">
          <section className="panel">
            <div className="panel__head">
              <span>比赛设置</span>
              <span className="panel__tag">{session.isHost ? 'HOST' : 'READ ONLY'}</span>
            </div>
            <div className="settings-slider">
              <div className="settings-slider__label">
                <span>比赛时长</span>
                <strong>{duration} 分钟</strong>
              </div>
              <input
                type="range"
                min={3}
                max={10}
                step={1}
                value={duration}
                disabled={!session.isHost}
                onChange={(event) => setDuration(Number(event.target.value))}
                onPointerUp={commitSettings}
                onKeyUp={commitSettings}
                onBlur={commitSettings}
              />
              <div className="settings-slider__range">
                <span>3 分钟</span>
                <span>10 分钟</span>
              </div>
            </div>
            <div className="settings-slider">
              <div className="settings-slider__label">
                <span>击杀上限</span>
                <strong>{killLimit} 杀</strong>
              </div>
              <input
                type="range"
                min={10}
                max={30}
                step={1}
                value={killLimit}
                disabled={!session.isHost}
                onChange={(event) => setKillLimit(Number(event.target.value))}
                onPointerUp={commitSettings}
                onKeyUp={commitSettings}
                onBlur={commitSettings}
              />
              <div className="settings-slider__range">
                <span>10 杀</span>
                <span>30 杀</span>
              </div>
            </div>
            <p className="settings-note">
              时间到或某队先达到击杀上限，任一条件满足即结束。
            </p>
          </section>

          <section className="panel">
            <div className="panel__head">
              <span>开局检查</span>
              <span className="panel__tag">{canStart ? 'READY' : 'WAITING'}</span>
            </div>
            <ul className="checklist">
              <ChecklistItem ok={readiness.enough}>至少 2 名玩家</ChecklistItem>
              <ChecklistItem ok={readiness.bothTeams}>
                {teamLabel('red', session.mode)}和{teamLabel('blue', session.mode)}
                各有玩家
              </ChecklistItem>
              <ChecklistItem ok={readiness.allTeams}>所有玩家已选择队伍</ChecklistItem>
              <ChecklistItem ok={readiness.allAppearance}>所有玩家完成建档</ChecklistItem>
              <ChecklistItem ok={readiness.allReady}>所有玩家已准备</ChecklistItem>
            </ul>

            <div className="lobby-self-actions">
              {me && (
                <button
                  className={`secondary-button ${me.appearanceReady ? 'is-done' : ''}`}
                  onClick={onOpenEnrollment}
                >
                  <IconCamera />
                  {me.appearanceReady ? '重新建档' : appearance ? '同步建档…' : '去建档'}
                </button>
              )}
              {!session.isHost && me && (
                <button
                  className={`secondary-button ${me.ready ? 'is-done' : ''}`}
                  onClick={() => onSetReady(!me.ready)}
                >
                  <IconCheck />
                  {me.ready ? '取消准备' : '准备'}
                </button>
              )}
            </div>

            {session.isHost ? (
              <button
                className="primary-button primary-button--large lobby-start"
                disabled={!canStart}
                onClick={onStart}
                title={canStart ? '开始比赛' : '请先满足左侧检查项'}
              >
                <IconPlay />
                开始比赛
              </button>
            ) : (
              <div className="waiting-box">
                <IconShield />
                <div>
                  <strong>等待房主开始</strong>
                  <span>你可以在等待时重新建档或切换队伍</span>
                </div>
              </div>
            )}

            {!canStart && session.isHost && (
              <p className="start-hint">
                开始按钮灰显时，请根据“开局检查”补全条件。
              </p>
            )}
          </section>

          <section className="panel panel--compact">
            <div className="panel__head">
              <span>你的状态</span>
            </div>
            <div className="self-status">
              <div className="self-status__row">
                <span>队伍</span>
                <strong className={me?.team ? `text-${me.team}` : ''}>
                  {me?.team ? teamLabel(me.team, session.mode) : '未编队'}
                </strong>
              </div>
              <div className="self-status__row">
                <span>建档</span>
                <strong className={me?.appearanceReady ? 'text-ok' : 'text-warn'}>
                  {me?.appearanceReady ? '已完成' : '未完成'}
                </strong>
              </div>
              <div className="self-status__row">
                <span>准备</span>
                <strong className={me?.ready ? 'text-ok' : 'text-warn'}>
                  {me?.ready ? '已准备' : '未准备'}
                </strong>
              </div>
            </div>
          </section>

          <button className="ghost-button danger-text" onClick={onLeave}>
            离开房间
          </button>
        </aside>
      </main>
    </div>
  )
}
