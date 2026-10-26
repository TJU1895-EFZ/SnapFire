import { IconChevronRight } from './Icons'

interface Props {
  tag: string
  title: string
  subtitle: string
  description: string
  state?: 'ready' | 'planned'
  tone?: 'amber' | 'red' | 'blue'
  className?: string
  onClick: () => void
}

/**
 * Shared entry tile for the desktop mode menus. Planned modes stay clickable
 * so the screen can explain that they are not available yet.
 */
export function ModeTile({
  tag,
  title,
  subtitle,
  description,
  state = 'ready',
  tone = 'amber',
  className,
  onClick
}: Props): React.JSX.Element {
  const classes = [
    'mode-tile',
    `mode-tile--${tone}`,
    state === 'planned' ? 'mode-tile--planned' : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={classes} onClick={onClick}>
      <span className="mode-tile__tag">{tag}</span>
      <span className="mode-tile__body">
        <span className="mode-tile__head">
          <strong>{title}</strong>
          <span className={`mode-tile__badge mode-tile__badge--${state}`}>
            {state === 'ready' ? '可进入' : '待开发'}
          </span>
        </span>
        <span className="mode-tile__subtitle">{subtitle}</span>
        <span className="mode-tile__desc">{description}</span>
      </span>
      <IconChevronRight className="mode-tile__arrow" />
    </button>
  )
}
