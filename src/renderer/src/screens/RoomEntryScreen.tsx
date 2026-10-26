import { useState } from 'react'
import type { CombatMode, ProfileData } from '@shared/types'
import {
  IconArrowLeft,
  IconCombat,
  IconPlus,
  IconShield,
  IconUsers,
  IconWifi
} from '../components/Icons'
import { monogram, shortId } from '../utils/format'

interface RoomEntryScreenProps {
  profile: ProfileData
  mode: CombatMode
  busy: boolean
  error: string | null
  onBack: () => void
  onCreate: () => void
  onJoin: (address: string, roomCode: string) => void
}

export function RoomEntryScreen({
  profile,
  mode,
  busy,
  error,
  onBack,
  onCreate,
  onJoin
}: RoomEntryScreenProps): React.JSX.Element {
  const [address, setAddress] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const submitJoin = (event: React.FormEvent): void => {
    event.preventDefault()
    setLocalError(null)
    if (!address.trim()) {
      setLocalError('请输入房主电脑的地址，例如 192.168.1.20:17890')
      return
    }
    if (!/^\d{4}$/.test(roomCode.trim())) {
      setLocalError('房间号是 4 位数字')
      return
    }
    onJoin(address.trim(), roomCode.trim())
  }

  return (
    <div className="entry-screen screen">
      <div className="screen-bg" aria-hidden="true" />
      <header className="subpage-header">
        <button className="icon-button" onClick={onBack} disabled={busy} aria-label="返回">
          <IconArrowLeft />
        </button>
        <div className="subpage-title">
          <span className="eyebrow">
            {mode === 'long-march'
              ? 'TEAM DEATHMATCH / LONG MARCH'
              : 'TEAM DEATHMATCH / URBAN'}
          </span>
          <h2>{mode === 'long-march' ? '长征 90 周年 · 常规' : '巷战 · 室内'}</h2>
        </div>
        <div className="subpage-header__right">
          <span className="status-chip">
            <span className="status-dot" />
            局域网联机
          </span>
        </div>
      </header>

      <main className="entry-main">
        <section className="entry-intro">
          <div className="entry-intro__icon">
            <IconCombat />
          </div>
          <div>
            <h3>
              {mode === 'long-march' ? '3V3 长征常规对抗' : '3V3 室内团战'}
            </h3>
            <p>
              {mode === 'long-march'
                ? '阵营为红军 / 国民党军。战斗画面会按阵营显示军服，换装只影响屏幕显示，不改变识别与命中判定。'
                : '每名玩家使用一台带摄像头的 Windows 笔记本。创建房间的人成为房主，其他玩家在同一局域网内输入房主地址和 4 位房间号加入。'}
              创建房间的人成为房主，其他玩家在同一局域网内输入房主地址和 4 位房间号加入。
            </p>
          </div>
          <div className="entry-facts">
            <span>
              <IconUsers /> 最多 6 人 ·{' '}
              {mode === 'long-march' ? '红军 / 国民党军各 3 人' : '红蓝各 3 人'}
            </span>
            <span>
              <IconWifi /> 同一 Wi-Fi / 热点
            </span>
            <span>
              <IconShield /> 无需互联网
            </span>
          </div>
        </section>

        <div className="entry-grid">
          <section className="entry-panel entry-panel--create">
            <div className="entry-panel__head">
              <span className="entry-panel__index">01</span>
              <div>
                <h3>创建房间</h3>
                <p>在自己的电脑上开房，并成为房主。</p>
              </div>
            </div>
            <ul className="entry-list">
              <li>自动显示房间号和局域网地址</li>
              <li>可以设置比赛时长和击杀上限</li>
              <li>负责开始比赛和返回大厅</li>
            </ul>
            <button className="primary-button primary-button--large" onClick={onCreate} disabled={busy}>
              <IconPlus />
              {busy ? '正在启动房间服务…' : '创建房间'}
            </button>
          </section>

          <section className="entry-panel">
            <div className="entry-panel__head">
              <span className="entry-panel__index">02</span>
              <div>
                <h3>加入房间</h3>
                <p>向房主询问地址和房间号。</p>
              </div>
            </div>
            <form className="join-form" onSubmit={submitJoin}>
              <label className="field">
                <span>房主地址</span>
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="192.168.1.20:17890"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                />
              </label>
              <label className="field">
                <span>房间号</span>
                <input
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="4 位数字"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={busy}
                />
              </label>
              {(localError || error) && (
                <div className="form-error" role="alert">
                  {localError ?? error}
                </div>
              )}
              <button className="secondary-button secondary-button--large" type="submit" disabled={busy}>
                {busy ? '正在连接…' : '加入房间'}
              </button>
            </form>
          </section>
        </div>

        <section className="entry-profile">
          <div className="avatar avatar--small">{monogram(profile.name)}</div>
          <div>
            <span>当前玩家</span>
            <strong>{profile.name}</strong>
          </div>
          <span className="player-id">ID // {shortId(profile.id)}</span>
        </section>

        <p className="entry-hint">
          首次创建房间时，Windows 防火墙可能弹出提示，请允许应用在“专用网络”上通信，
          否则其他电脑无法加入。所有电脑必须处于同一局域网。
        </p>
      </main>
    </div>
  )
}
