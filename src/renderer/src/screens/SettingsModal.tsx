import { useEffect, useState } from 'react'
import type { AppInfo, AppSettings, DetectionQuality } from '@shared/types'
import { listCameras } from '../hooks/useCamera'
import {
  IconAlert,
  IconCamera,
  IconCheck,
  IconClose,
  IconDownload,
  IconPulse,
  IconRefresh,
  IconSettings,
  IconShield,
  IconTrash,
  IconUpload
} from '../components/Icons'
import type { ToastTone } from '../types'

interface SettingsModalProps {
  settings: AppSettings
  appInfo: AppInfo | null
  onChange: (patch: Partial<AppSettings>) => void
  onClose: () => void
  onDataChanged: (message: string) => Promise<void> | void
  showToast: (message: string, tone?: ToastTone) => void
}

const QUALITY_OPTIONS: Array<{
  value: DetectionQuality
  label: string
  detail: string
}> = [
  { value: 'performance', label: '性能', detail: '识别频率较低，适合较老的笔记本' },
  { value: 'balanced', label: '均衡', detail: '默认，兼顾识别率与流畅度' },
  { value: 'accurate', label: '精准', detail: '识别频率更高，CPU/GPU 占用更大' }
]

export function SettingsModal({
  settings,
  appInfo,
  onChange,
  onClose,
  onDataChanged,
  showToast
}: SettingsModalProps): React.JSX.Element {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [fieldLogPath, setFieldLogPath] = useState<string | null>(null)

  useEffect(() => {
    void listCameras().then(setCameras)
  }, [])

  useEffect(() => {
    void window.snapfire.fieldLog
      .info()
      .then((info) => setFieldLogPath(info.directory))
      .catch(() => setFieldLogPath(null))
  }, [])

  const openFieldLogDirectory = async (): Promise<void> => {
    const result = await window.snapfire.fieldLog.openDirectory()
    if (!result.ok) {
      showToast(result.error ?? '无法打开日志目录', 'error')
    }
  }

  const exportBackup = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.snapfire.backup.export()
      if (result.ok) {
        showToast(`备份已导出：${result.path ?? ''}`, 'success')
      } else if (!result.canceled) {
        showToast(result.error ?? '导出备份失败', 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  const importBackup = async (): Promise<void> => {
    const confirmed = window.confirm(
      '导入备份会覆盖当前的玩家档案、设置、建档和历史战绩。确定继续吗？'
    )
    if (!confirmed) return
    setBusy(true)
    try {
      const result = await window.snapfire.backup.import()
      if (result.ok) {
        await onDataChanged('备份已恢复，本地数据已重新加载')
      } else if (!result.canceled) {
        showToast(result.error ?? '导入备份失败', 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  const resetAll = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.snapfire.storage.resetAll()
      await onDataChanged('本地数据已清除，已重新生成玩家档案')
    } finally {
      setBusy(false)
      setConfirmReset(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="设置">
      <div className="settings-modal">
        <header className="modal-head">
          <div>
            <span className="eyebrow">SYSTEM / SETTINGS</span>
            <h2>设置</h2>
          </div>
          <button className="icon-button" onClick={onClose} disabled={busy} aria-label="关闭">
            <IconClose />
          </button>
        </header>

        <div className="settings-body">
          <section className="settings-section">
            <div className="settings-section__head">
              <IconSettings />
              <div>
                <h3>声音</h3>
                <p>枪声、命中提示和界面音效的音量。</p>
              </div>
            </div>
            <div className="settings-slider">
              <div className="settings-slider__label">
                <span>主音量</span>
                <strong>{Math.round(settings.volume * 100)}%</strong>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={settings.volume}
                onChange={(event) => onChange({ volume: Number(event.target.value) })}
              />
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section__head">
              <IconCamera />
              <div>
                <h3>识别与摄像头</h3>
                <p>识别质量越高，身份判断越稳定，但占用也更高。</p>
              </div>
            </div>
            <div className="quality-options">
              {QUALITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`quality-option ${
                    settings.detectionQuality === option.value ? 'is-active' : ''
                  }`}
                  onClick={() => onChange({ detectionQuality: option.value })}
                >
                  <span className="quality-option__label">
                    {option.label}
                    {settings.detectionQuality === option.value && <IconCheck />}
                  </span>
                  <span className="quality-option__detail">{option.detail}</span>
                </button>
              ))}
            </div>
            <label className="field field--inline">
              <span>摄像头</span>
              <select
                value={settings.cameraDeviceId ?? ''}
                onChange={(event) =>
                  onChange({ cameraDeviceId: event.target.value || null })
                }
              >
                <option value="">默认摄像头</option>
                {cameras.map((camera, index) => (
                  <option key={camera.deviceId || index} value={camera.deviceId}>
                    {camera.label || `摄像头 ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <p className="settings-hint">
              摄像头实际分辨率会在进入战斗或建档时显示。若列表为空，请先打开一次摄像头并允许权限。
            </p>
            <label className="toggle-row">
              <span>
                <strong>显示调试信息</strong>
                <small>在战斗中显示识别耗时、匹配分数和来源</small>
              </span>
              <input
                type="checkbox"
                checked={settings.showDebug}
                onChange={(event) => onChange({ showDebug: event.target.checked })}
              />
            </label>
          </section>

          <section className="settings-section">
            <div className="settings-section__head">
              <IconPulse />
              <div>
                <h3>场地测试日志</h3>
                <p>为真人验收逐枪记录识别分数与服务端结果；只写本机 JSONL，不保存图像。</p>
              </div>
            </div>
            <label className="toggle-row">
              <span>
                <strong>启用逐枪日志</strong>
                <small>战斗页显示 FIELD TEST 面板，用于标注距离、朝向、光照和意图目标。</small>
              </span>
              <input
                type="checkbox"
                checked={settings.fieldTestLog}
                onChange={(event) => onChange({ fieldTestLog: event.target.checked })}
              />
            </label>
            <div className="data-path">
              <span>日志目录</span>
              <code>{fieldLogPath ?? '—'}</code>
            </div>
            <button
              className="secondary-button"
              onClick={() => void openFieldLogDirectory()}
              disabled={busy}
            >
              打开日志目录
            </button>
            <p className="settings-hint">
              日志包含玩家昵称、识别分数和比赛结果，仅保存在本机，不会随备份导出。JSONL
              可直接用于核对现场记录表；提交前请按 field-tests/README.md 脱敏。
            </p>
          </section>

          <section className="settings-section">
            <div className="settings-section__head">
              <IconShield />
              <div>
                <h3>本地数据与备份</h3>
                <p>所有数据只保存在本机；关闭、重启或刷新不会丢失。</p>
              </div>
            </div>
            <div className="data-path">
              <span>数据目录</span>
              <code>{appInfo?.userDataPath ?? '—'}</code>
            </div>
            <div className="backup-actions">
              <button className="secondary-button" onClick={() => void exportBackup()} disabled={busy}>
                <IconDownload />
                导出备份
              </button>
              <button className="secondary-button" onClick={() => void importBackup()} disabled={busy}>
                <IconUpload />
                导入备份
              </button>
            </div>
            <p className="settings-hint">
              应用启动和每局结束后会自动备份，最多保留最近 10 份。导入前会再生成一份恢复前备份。
            </p>

            {!confirmReset ? (
              <button
                className="ghost-button danger-text"
                onClick={() => setConfirmReset(true)}
                disabled={busy}
              >
                <IconTrash />
                清除本地数据
              </button>
            ) : (
              <div className="danger-box">
                <IconAlert />
                <div>
                  <strong>确定清除本地数据？</strong>
                  <p>玩家档案、设置、建档和历史战绩都会被清空，且无法撤销。</p>
                  <div className="danger-box__actions">
                    <button className="ghost-button" onClick={() => setConfirmReset(false)} disabled={busy}>
                      取消
                    </button>
                    <button className="danger-button" onClick={() => void resetAll()} disabled={busy}>
                      {busy ? '清除中…' : '确认清除'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="settings-section settings-section--about">
            <div className="settings-section__head">
              <IconRefresh />
              <div>
                <h3>关于 SnapFire</h3>
                <p>本机离线运行的混合现实团战应用。</p>
              </div>
            </div>
            <div className="about-grid">
              <span>版本</span>
              <strong>V{appInfo?.version ?? '0.1.0'}</strong>
              <span>平台</span>
              <strong>{appInfo?.platform ?? 'win32'}</strong>
              <span>模式</span>
              <strong>团战 · 巷战（室内）</strong>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
