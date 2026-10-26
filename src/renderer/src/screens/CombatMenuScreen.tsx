import { ModeTile } from '../components/ModeTile'
import { IconArrowLeft } from '../components/Icons'

interface Props {
  onBack: () => void
  onTeam: () => void
  onPlaceholder: (mode: string) => void
}

const MODES = [
  {
    id: 'solo',
    tag: '单',
    title: '单人',
    subtitle: 'SOLO',
    description: '独自完成训练与挑战',
    ready: false
  },
  {
    id: 'team',
    tag: '团',
    title: '团战',
    subtitle: 'TEAM BATTLE',
    description: '与队友协同作战，进入巷战或野战',
    ready: true
  },
  {
    id: 'ctf',
    tag: '旗',
    title: '夺旗',
    subtitle: 'CAPTURE THE FLAG',
    description: '夺取并护送旗帜返回己方阵地',
    ready: false
  },
  {
    id: 'bomb',
    tag: '弹',
    title: '拆弹',
    subtitle: 'DEFUSE',
    description: '进攻布防或拆除炸弹',
    ready: false
  }
] as const

export function CombatMenuScreen({
  onBack,
  onTeam,
  onPlaceholder
}: Props): React.JSX.Element {
  return (
    <div className="menu-screen screen menu-screen--combat">
      <div className="screen-bg" aria-hidden="true" />
      <header className="subpage-header">
        <button className="icon-button" onClick={onBack} aria-label="返回">
          <IconArrowLeft />
        </button>
        <div className="subpage-title">
          <span className="eyebrow">STANDARD COMBAT</span>
          <h2>常规作战</h2>
        </div>
        <div className="subpage-header__right">
          <span className="status-chip">
            <span className="status-dot" />
            选择作战方式
          </span>
        </div>
      </header>

      <main className="menu-main">
        <div className="menu-heading">
          <span className="eyebrow">MODE SELECT</span>
          <h1>常规作战</h1>
          <p>目前只有“团战 → 巷战”接入局域网房间，其余模式将陆续开放。</p>
        </div>

        <div className="menu-grid">
          {MODES.map((mode) => (
            <ModeTile
              key={mode.id}
              tag={mode.tag}
              title={mode.title}
              subtitle={mode.subtitle}
              description={mode.description}
              state={mode.ready ? 'ready' : 'planned'}
              className={`mode-tile--${mode.id}`}
              onClick={() => {
                if (mode.id === 'team') onTeam()
                else onPlaceholder(mode.title)
              }}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
