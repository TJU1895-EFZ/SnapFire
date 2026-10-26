import { ModeTile } from '../components/ModeTile'
import { IconArrowLeft, IconShield } from '../components/Icons'

interface Props {
  onBack: () => void
  onCombat: () => void
  onScenes: () => void
}

export function LongMarchMenuScreen({
  onBack,
  onCombat,
  onScenes
}: Props): React.JSX.Element {
  return (
    <div className="campaign-screen screen campaign-screen--menu">
      <div className="screen-bg" aria-hidden="true" />
      <header className="subpage-header">
        <button className="icon-button" onClick={onBack} aria-label="返回">
          <IconArrowLeft />
        </button>
        <div className="subpage-title">
          <span className="eyebrow">LONG MARCH · 90TH ANNIVERSARY</span>
          <h2>长征胜利 90 周年纪念</h2>
        </div>
        <div className="subpage-header__right">
          <span className="status-chip status-chip--campaign">
            <IconShield />
            1936 — 2026
          </span>
        </div>
      </header>

      <main className="menu-main">
        <section className="campaign-hero campaign-hero--compact">
          <span className="campaign-hero__years">1936 — 2026</span>
          <h1>长征胜利 90 周年纪念</h1>
          <p>选择常规对抗，或回望长征中的著名战役</p>
        </section>

        <div className="menu-grid menu-grid--two">
          <ModeTile
            tag="战"
            title="常规"
            subtitle="STANDARD · 红军 vs 国民党军"
            description="选择阵营并加入局域网房间，屏幕中会按阵营显示军服"
            tone="red"
            className="mode-tile--campaign-combat"
            onClick={onCombat}
          />
          <ModeTile
            tag="史"
            title="历史场景"
            subtitle="HISTORICAL SCENES"
            description="湘江、赤水、大渡河、泸定桥……长征著名战役一览"
            tone="red"
            className="mode-tile--campaign-scenes"
            onClick={onScenes}
          />
        </div>

        <div className="notice notice--warning">
          历史场景目前为资料展示，战斗场景将在后续版本开放。
        </div>
      </main>
    </div>
  )
}
