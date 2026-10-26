import { ModeTile } from '../components/ModeTile'
import { IconArrowLeft } from '../components/Icons'

interface Props {
  onBack: () => void
  onUrban: () => void
  onField: () => void
}

export function TeamModeScreen({
  onBack,
  onUrban,
  onField
}: Props): React.JSX.Element {
  return (
    <div className="menu-screen screen menu-screen--team">
      <div className="screen-bg" aria-hidden="true" />
      <header className="subpage-header">
        <button className="icon-button" onClick={onBack} aria-label="返回">
          <IconArrowLeft />
        </button>
        <div className="subpage-title">
          <span className="eyebrow">TEAM BATTLE</span>
          <h2>团战</h2>
        </div>
        <div className="subpage-header__right">
          <span className="status-chip">
            <span className="status-dot" />
            选择作战场地
          </span>
        </div>
      </header>

      <main className="menu-main">
        <div className="menu-heading">
          <span className="eyebrow">FIELD SELECT</span>
          <h1>团战</h1>
          <p>选择作战场地。巷战为现有 3V3 局域网房间玩法。</p>
        </div>

        <div className="menu-grid menu-grid--two">
          <ModeTile
            tag="巷"
            title="巷战"
            subtitle="URBAN · 3V3"
            description="现有局域网房间玩法：选队、建档、识别射击"
            className="mode-tile--urban"
            onClick={onUrban}
          />
          <ModeTile
            tag="野"
            title="野战"
            subtitle="FIELD · 3V3"
            description="开阔地形下的团战，地图与规则仍在开发"
            state="planned"
            className="mode-tile--field"
            onClick={onField}
          />
        </div>
      </main>
    </div>
  )
}
