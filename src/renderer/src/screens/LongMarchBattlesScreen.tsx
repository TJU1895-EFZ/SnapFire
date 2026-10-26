import { LONG_MARCH_BATTLES } from '../content/longMarch'
import { IconArrowLeft, IconShield } from '../components/Icons'

interface Props {
  onBack: () => void
  onSelect: (name: string) => void
}

export function LongMarchBattlesScreen({
  onBack,
  onSelect
}: Props): React.JSX.Element {
  return (
    <div className="campaign-screen screen campaign-screen--battles">
      <div className="screen-bg" aria-hidden="true" />
      <header className="subpage-header">
        <button className="icon-button" onClick={onBack} aria-label="返回">
          <IconArrowLeft />
        </button>
        <div className="subpage-title">
          <span className="eyebrow">HISTORICAL SCENES</span>
          <h2>长征著名战役</h2>
        </div>
        <div className="subpage-header__right">
          <span className="status-chip status-chip--campaign">
            <IconShield />
            资料展示
          </span>
        </div>
      </header>

      <main className="campaign-main">
        <div className="menu-heading">
          <span className="eyebrow">1934 — 1936</span>
          <h1>长征著名战役</h1>
          <p>从湘江血战到山城堡，每一场战斗都改变了长征的走向。</p>
        </div>

        <div className="campaign-battle-list">
          {LONG_MARCH_BATTLES.map((battle, index) => (
            <button
              key={battle.id}
              type="button"
              className="campaign-battle-card"
              onClick={() => onSelect(battle.name)}
            >
              <span className="campaign-battle-card__index">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="campaign-battle-card__body">
                <span className="campaign-battle-card__head">
                  <strong>{battle.name}</strong>
                  <span className="mode-tile__badge mode-tile__badge--planned">
                    场景待开发
                  </span>
                </span>
                <span className="campaign-battle-card__meta">
                  {battle.date} · {battle.place}
                </span>
                <span className="campaign-battle-card__summary">
                  {battle.summary}
                </span>
              </span>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
