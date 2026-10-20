import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AppInfo,
  AppSettings,
  AppearanceData,
  ClientMessage,
  HistoryData,
  HostInfo,
  ProfileData,
  RoomPublicState,
  RoomSettings,
  Team
} from '@shared/types'
import { HomeScreen } from './screens/HomeScreen'
import { RoomEntryScreen } from './screens/RoomEntryScreen'
import { LobbyScreen } from './screens/LobbyScreen'
import { EnrollmentModal } from './screens/EnrollmentModal'
import { BattleScreen } from './screens/BattleScreen'
import { ResultsScreen } from './screens/ResultsScreen'
import { SettingsModal } from './screens/SettingsModal'
import { HistoryModal } from './screens/HistoryModal'
import { NetClient, normalizeHostAddress, type NetEvent } from './net/NetClient'
import { warmupHuman } from './vision/human'
import { audio } from './game/audio'
import { logFieldMatchEnd } from './fieldLog'
import type { RoomSession, ToastTone } from './types'
import { SnapFireMark, IconAlert, IconRefresh } from './components/Icons'

type Screen = 'home' | 'entry' | 'lobby' | 'battle' | 'results'

interface ToastState {
  id: number
  message: string
  tone: ToastTone
}

export function App(): React.JSX.Element {
  const [booted, setBooted] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [appearance, setAppearance] = useState<AppearanceData | null>(null)
  const [history, setHistory] = useState<HistoryData>({ matches: [] })
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [screen, setScreen] = useState<Screen>('home')
  const [session, setSession] = useState<RoomSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [entryError, setEntryError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [enrollmentOpen, setEnrollmentOpen] = useState(false)
  const [historySaved, setHistorySaved] = useState(false)

  const netRef = useRef<NetClient | null>(null)
  const netOffRef = useRef<(() => void) | null>(null)
  const sessionRef = useRef<RoomSession | null>(null)
  const profileRef = useRef<ProfileData | null>(null)
  const appearanceRef = useRef<AppearanceData | null>(null)
  const settingsRef = useRef<AppSettings | null>(null)
  const pendingConnectRef = useRef<{ hostInfo: HostInfo | null; address: string } | null>(null)
  const leavingRef = useRef(false)
  const hostStartedRef = useRef(false)
  const savedMatchesRef = useRef<Set<string>>(new Set())
  const toastTimerRef = useRef<number | null>(null)
  const toastIdRef = useRef(0)

  useEffect(() => {
    sessionRef.current = session
  }, [session])
  useEffect(() => {
    profileRef.current = profile
  }, [profile])
  useEffect(() => {
    appearanceRef.current = appearance
  }, [appearance])
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    toastIdRef.current += 1
    setToast({ id: toastIdRef.current, message, tone })
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3800)
  }, [])

  // --- Boot ----------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!window.snapfire) {
        setFatal('未检测到 SnapFire 桌面接口。请通过 Electron 桌面应用启动，而不是直接打开网页。')
        return
      }
      try {
        const [nextProfile, nextSettings, nextAppearance, nextHistory, nextAppInfo] =
          await Promise.all([
            window.snapfire.storage.loadProfile(),
            window.snapfire.storage.loadSettings(),
            window.snapfire.storage.loadAppearance(),
            window.snapfire.storage.loadHistory(),
            window.snapfire.app.info()
          ])
        const warnings = await window.snapfire.storage.consumeWarnings()
        if (cancelled) return
        setProfile(nextProfile)
        profileRef.current = nextProfile
        setSettings(nextSettings)
        settingsRef.current = nextSettings
        setAppearance(nextAppearance)
        appearanceRef.current = nextAppearance
        setHistory(nextHistory)
        setAppInfo(nextAppInfo)
        audio.setVolume(nextSettings.volume)
        // Keep the branded boot screen up while the one-off Human model /
        // shader warmup runs. Without this the first inference would freeze
        // the lobby or the opening seconds of a match.
        await Promise.race([
          warmupHuman(),
          new Promise<void>((resolve) => setTimeout(resolve, 20_000))
        ])
        if (cancelled) return
        setBooted(true)
        if (warnings.length > 0) {
          showToast(warnings.join(' '), 'error')
        }
      } catch (error) {
        if (!cancelled) {
          setFatal(
            error instanceof Error
              ? `读取本地数据失败：${error.message}`
              : '读取本地数据失败'
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showToast])

  const cleanupSession = useCallback(async (stopHost: boolean) => {
    netOffRef.current?.()
    netOffRef.current = null
    const net = netRef.current
    netRef.current = null
    if (net) net.close()
    setSession(null)
    sessionRef.current = null
    setEnrollmentOpen(false)
    setHistorySaved(false)
    if (stopHost || hostStartedRef.current) {
      hostStartedRef.current = false
      try {
        await window.snapfire.host.stop()
      } catch {
        // ignore
      }
    }
  }, [])

  const handleNetEvent = useCallback(
    (event: NetEvent) => {
      switch (event.type) {
        case 'welcome': {
          const net = netRef.current
          if (!net) return
          const pending = pendingConnectRef.current
          const next: RoomSession = {
            net,
            room: event.room,
            gallery: event.gallery,
            selfId: event.selfId,
            isHost: event.isHost,
            hostInfo: pending?.hostInfo ?? null,
            address: pending?.address ?? ''
          }
          setSession(next)
          sessionRef.current = next
          setEntryError(null)
          setBusy(false)
          if (event.room.phase === 'lobby') setScreen('lobby')
          else if (event.room.phase === 'ended') setScreen('results')
          else setScreen('battle')
          const localAppearance = appearanceRef.current
          if (localAppearance) {
            const { thumbnail: _thumbnail, ...rest } = localAppearance
            net.send({
              type: 'set-appearance',
              appearance: { ...rest, thumbnail: undefined }
            })
          }
          break
        }
        case 'room': {
          setSession((previous) => {
            if (!previous) return previous
            const next = { ...previous, room: event.room }
            sessionRef.current = next
            return next
          })
          if (event.room.phase === 'countdown' || event.room.phase === 'playing') {
            setScreen('battle')
          } else if (event.room.phase === 'ended') {
            setScreen('results')
          } else if (event.room.phase === 'lobby') {
            setHistorySaved(false)
            setScreen((previous) => (previous === 'results' ? 'lobby' : previous))
          }
          break
        }
        case 'gallery': {
          setSession((previous) => {
            if (!previous) return previous
            const next = { ...previous, gallery: event.gallery }
            sessionRef.current = next
            return next
          })
          break
        }
        case 'match-start': {
          setSession((previous) => {
            if (!previous) return previous
            const next = { ...previous, room: event.room }
            sessionRef.current = next
            return next
          })
          setScreen('battle')
          break
        }
        case 'match-end': {
          const result = event.result
          if (settingsRef.current?.fieldTestLog) {
            logFieldMatchEnd(
              result,
              result.score,
              sessionRef.current?.room.roomCode ?? ''
            )
          }
          setSession((previous) => {
            if (!previous) return previous
            const room: RoomPublicState = {
              ...previous.room,
              phase: 'ended',
              result
            }
            const next = { ...previous, room }
            sessionRef.current = next
            return next
          })
          setScreen('results')
          if (!savedMatchesRef.current.has(result.matchId)) {
            savedMatchesRef.current.add(result.matchId)
            void window.snapfire.storage
              .addHistory(result)
              .then((nextHistory) => {
                setHistory(nextHistory)
                setHistorySaved(true)
              })
              .catch((error) => {
                showToast(
                  `保存战绩失败：${error instanceof Error ? error.message : '未知错误'}`,
                  'error'
                )
              })
          } else {
            setHistorySaved(true)
          }
          break
        }
        case 'error':
          showToast(event.message, 'error')
          break
        case 'socket-closed': {
          if (leavingRef.current) break
          showToast('与房间的连接已断开', 'error')
          void cleanupSession(true)
          setScreen('home')
          break
        }
        case 'socket-error':
          showToast(event.message, 'error')
          break
        default:
          break
      }
    },
    [cleanupSession, showToast]
  )

  const createRoom = useCallback(async () => {
    if (!profile || busy) return
    setBusy(true)
    setEntryError(null)
    try {
      const info = await window.snapfire.host.start()
      hostStartedRef.current = true
      const address = `${info.lanIps[0] ?? '127.0.0.1'}:${info.port}`
      pendingConnectRef.current = { hostInfo: info, address }
      const net = new NetClient()
      netRef.current = net
      netOffRef.current = net.on(handleNetEvent)
      leavingRef.current = false
      await net.connect(`ws://127.0.0.1:${info.port}`, {
        roomCode: info.roomCode,
        playerId: profile.id,
        name: profile.name,
        hostToken: info.hostToken
      })
    } catch (error) {
      netOffRef.current?.()
      netOffRef.current = null
      netRef.current?.close()
      netRef.current = null
      if (hostStartedRef.current) {
        hostStartedRef.current = false
        try {
          await window.snapfire.host.stop()
        } catch {
          // ignore
        }
      }
      setEntryError(error instanceof Error ? error.message : '创建房间失败')
    } finally {
      setBusy(false)
    }
  }, [busy, handleNetEvent, profile])

  const joinRoom = useCallback(
    async (addressInput: string, roomCode: string) => {
      if (!profile || busy) return
      setBusy(true)
      setEntryError(null)
      try {
        const url = normalizeHostAddress(addressInput)
        pendingConnectRef.current = { hostInfo: null, address: addressInput.trim() }
        const net = new NetClient()
        netRef.current = net
        netOffRef.current = net.on(handleNetEvent)
        leavingRef.current = false
        await net.connect(url, {
          roomCode,
          playerId: profile.id,
          name: profile.name
        })
      } catch (error) {
        netOffRef.current?.()
        netOffRef.current = null
        netRef.current?.close()
        netRef.current = null
        setEntryError(error instanceof Error ? error.message : '加入房间失败')
      } finally {
        setBusy(false)
      }
    },
    [busy, handleNetEvent, profile]
  )

  const leaveRoom = useCallback(async () => {
    leavingRef.current = true
    const current = sessionRef.current
    if (current) {
      current.net.send({ type: 'leave' })
    }
    await cleanupSession(true)
    setScreen('home')
    setBusy(false)
    setEntryError(null)
    setSettingsOpen(false)
    setHistoryOpen(false)
    setEnrollmentOpen(false)
    leavingRef.current = false
  }, [cleanupSession])

  const updateName = useCallback(
    async (name: string) => {
      const current = profileRef.current
      if (!current) return
      const clean = name.trim().slice(0, 16) || current.name
      const next: ProfileData = { ...current, name: clean, updatedAt: Date.now() }
      setProfile(next)
      profileRef.current = next
      try {
        await window.snapfire.storage.saveProfile(next)
      } catch {
        showToast('保存昵称失败', 'error')
      }
      const live = sessionRef.current
      if (live && live.room.phase === 'lobby') {
        live.net.send({ type: 'set-name', name: clean })
      }
    },
    [showToast]
  )

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      const current = settingsRef.current
      if (!current) return
      const next: AppSettings = { ...current, ...patch }
      setSettings(next)
      settingsRef.current = next
      audio.setVolume(next.volume)
      void window.snapfire.storage.saveSettings(next).catch(() => {
        showToast('保存设置失败', 'error')
      })
    },
    [showToast]
  )

  const saveAppearance = useCallback(
    async (next: AppearanceData) => {
      await window.snapfire.storage.saveAppearance(next)
      setAppearance(next)
      appearanceRef.current = next
      const live = sessionRef.current
      if (live) {
        const { thumbnail: _thumbnail, ...rest } = next
        const sent = live.net.send({
          type: 'set-appearance',
          appearance: { ...rest, thumbnail: undefined }
        })
        if (!sent) {
          showToast('建档已保存到本机，但同步到房间失败', 'error')
        }
      }
      setEnrollmentOpen(false)
      showToast('建档已保存', 'success')
    },
    [showToast]
  )

  const send = useCallback(
    (message: ClientMessage): boolean => {
      const live = sessionRef.current
      if (!live) return false
      const ok = live.net.send(message)
      if (!ok) showToast('网络未连接，操作未发送', 'error')
      return ok
    },
    [showToast]
  )

  const setTeam = useCallback((team: Team) => send({ type: 'set-team', team }), [send])
  const setReady = useCallback((ready: boolean) => send({ type: 'set-ready', ready }), [send])
  const updateRoomSettings = useCallback(
    (next: RoomSettings) => send({ type: 'update-settings', settings: next }),
    [send]
  )
  const startMatch = useCallback(() => send({ type: 'start-match' }), [send])
  const returnLobby = useCallback(() => send({ type: 'return-lobby' }), [send])

  const clearHistory = useCallback(async () => {
    try {
      await window.snapfire.storage.clearHistory()
      setHistory({ matches: [] })
    } catch {
      showToast('清空战绩失败', 'error')
      throw new Error('清空战绩失败')
    }
  }, [showToast])

  const reloadLocalData = useCallback(
    async (message: string) => {
      if (sessionRef.current) {
        await leaveRoom()
      }
      const [nextProfile, nextSettings, nextAppearance, nextHistory, nextAppInfo] =
        await Promise.all([
          window.snapfire.storage.loadProfile(),
          window.snapfire.storage.loadSettings(),
          window.snapfire.storage.loadAppearance(),
          window.snapfire.storage.loadHistory(),
          window.snapfire.app.info()
        ])
      setProfile(nextProfile)
      profileRef.current = nextProfile
      setSettings(nextSettings)
      settingsRef.current = nextSettings
      setAppearance(nextAppearance)
      appearanceRef.current = nextAppearance
      setHistory(nextHistory)
      setAppInfo(nextAppInfo)
      audio.setVolume(nextSettings.volume)
      savedMatchesRef.current.clear()
      setScreen('home')
      setSettingsOpen(false)
      setHistoryOpen(false)
      setEnrollmentOpen(false)
      setHistorySaved(false)
      showToast(message, 'success')
    },
    [leaveRoom, showToast]
  )

  // --- Render --------------------------------------------------------------
  if (fatal) {
    return (
      <div className="fatal-screen">
        <div className="fatal-card">
          <IconAlert />
          <h1>SnapFire 无法启动</h1>
          <p>{fatal}</p>
          <button className="primary-button" onClick={() => window.location.reload()}>
            <IconRefresh /> 重新加载
          </button>
        </div>
      </div>
    )
  }

  if (!booted || !profile || !settings) {
    return (
      <div className="boot-screen">
        <div className="boot-mark">
          <SnapFireMark />
        </div>
        <h1>SNAPFIRE</h1>
        <p>正在加载本地档案与识别引擎…</p>
        <div className="boot-bar">
          <span />
        </div>
        <small>MIXED REALITY COMBAT // OFFLINE</small>
      </div>
    )
  }

  let content: React.JSX.Element
  if (screen === 'entry') {
    content = (
      <RoomEntryScreen
        profile={profile}
        busy={busy}
        error={entryError}
        onBack={() => {
          setEntryError(null)
          setScreen('home')
        }}
        onCreate={() => void createRoom()}
        onJoin={(address, roomCode) => void joinRoom(address, roomCode)}
      />
    )
  } else if (screen === 'lobby' && session) {
    content = (
      <LobbyScreen
        session={session}
        profile={profile}
        appearance={appearance}
        onLeave={() => void leaveRoom()}
        onOpenEnrollment={() => setEnrollmentOpen(true)}
        onSetTeam={setTeam}
        onSetReady={setReady}
        onUpdateSettings={updateRoomSettings}
        onStart={startMatch}
        onOpenSettings={() => setSettingsOpen(true)}
      />
    )
  } else if (screen === 'battle' && session) {
    content = (
      <BattleScreen
        session={session}
        settings={settings}
        appInfo={appInfo}
        onLeave={() => void leaveRoom()}
      />
    )
  } else if (screen === 'results' && session) {
    content = (
      <ResultsScreen
        session={session}
        profile={profile}
        historySaved={historySaved}
        onReturnLobby={returnLobby}
        onLeave={() => void leaveRoom()}
      />
    )
  } else {
    content = (
      <HomeScreen
        profile={profile}
        settings={settings}
        history={history}
        appInfo={appInfo}
        onUpdateName={(name) => void updateName(name)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        onEnterCombat={() => {
          setEntryError(null)
          setScreen('entry')
        }}
      />
    )
  }

  return (
    <div className="app-root">
      {content}

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          appInfo={appInfo}
          onChange={updateSettings}
          onClose={() => setSettingsOpen(false)}
          onDataChanged={reloadLocalData}
          showToast={showToast}
        />
      )}

      {historyOpen && (
        <HistoryModal
          history={history}
          profile={profile}
          onClose={() => setHistoryOpen(false)}
          onClear={clearHistory}
          showToast={showToast}
        />
      )}

      {enrollmentOpen && session && (
        <EnrollmentModal
          cameraDeviceId={settings.cameraDeviceId}
          existing={appearance}
          onClose={() => setEnrollmentOpen(false)}
          onSave={saveAppearance}
        />
      )}

      {toast && (
        <div className={`toast toast--${toast.tone}`} key={toast.id} role="status">
          {toast.message}
        </div>
      )}
    </div>
  )
}
