import { _electron as electron } from 'playwright-core'
import electronPath from 'electron'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const artifactsDir = join(process.cwd(), 'artifacts')
await mkdir(artifactsDir, { recursive: true })

const errors = []
const relevantLogs = []

function watchPage(page, label) {
  page.on('pageerror', (error) => errors.push(`${label}: ${String(error)}`))
  page.on('console', (message) => {
    const text = message.text()
    if (text.includes('[vision]') || message.type() === 'error') {
      relevantLogs.push(`${label} [${message.type()}] ${text}`)
    }
  })
}

async function prepareUserData(dir) {
  const dataDir = join(dir, 'data')
  await mkdir(dataDir, { recursive: true })
  const histogram = Array.from({ length: 48 }, () => 1 / 48)
  const grid = Array.from({ length: 27 }, () => 0.5)
  const appearance = {
    version: 1,
    faceEmbeddings: [Array.from({ length: 128 }, () => 0.1)],
    clothing: [
      {
        version: 1,
        view: 'front',
        histogram,
        grid,
        aspect: 0.6,
        capturedAt: Date.now()
      }
    ],
    updatedAt: Date.now()
  }
  await writeFile(
    join(dataDir, 'appearance.json'),
    JSON.stringify(appearance, null, 2),
    'utf8'
  )
  const settings = {
    volume: 0.8,
    detectionQuality: 'balanced',
    cameraDeviceId: null,
    showDebug: true,
    fieldTestLog: true
  }
  await writeFile(join(dataDir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf8')
}

const packagedExe = process.env.SNAPFIRE_APP_EXE

async function launchApp(userDataDir) {
  const executablePath = packagedExe || electronPath
  const args = packagedExe ? [] : ['.']
  const app = await electron.launch({
    executablePath,
    args,
    env: {
      ...process.env,
      SNAPFIRE_USER_DATA_DIR: userDataDir,
      SNAPFIRE_FAKE_CAMERA: '1',
      SNAPFIRE_TEST: '1'
    }
  })
  const page = await app.firstWindow()
  return { app, page }
}

let hostApp = null
let clientApp = null
let hostPage = null
let clientPage = null
let hostData = null
let clientData = null

async function readFieldLog(userDataDir) {
  const dir = join(userDataDir, 'field-logs')
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const files = await readdir(dir).catch(() => [])
    if (files.length > 0) {
      const raw = await readFile(join(dir, files[0]), 'utf8').catch(() => '')
      const entries = raw
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line)
          } catch {
            return null
          }
        })
        .filter(Boolean)
      if (entries.some((entry) => entry.type === 'shot')) {
        return { dir, files, entries }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return { dir, files: [], entries: [] }
}

console.log('APP', packagedExe ? `packaged: ${packagedExe}` : 'source: electron .')

try {
  hostData = await mkdtemp(join(tmpdir(), 'snapfire-smoke-host-'))
  clientData = await mkdtemp(join(tmpdir(), 'snapfire-smoke-client-'))
  await prepareUserData(hostData)
  await prepareUserData(clientData)

  const host = await launchApp(hostData)
  hostApp = host.app
  hostPage = host.page
  watchPage(host.page, 'host')

  await host.page.waitForSelector('.home-screen', { timeout: 30000 })
  await host.page.waitForTimeout(900)
  await host.page.screenshot({ path: join(artifactsDir, '01-home.png') })

  await host.page.click('.home-mode-card--regular')
  await host.page.waitForSelector('.menu-screen--combat', { timeout: 10000 })
  await host.page.screenshot({ path: join(artifactsDir, '01a-combat-menu.png') })
  await host.page.click('.mode-tile--team')
  await host.page.waitForSelector('.menu-screen--team', { timeout: 10000 })
  await host.page.screenshot({ path: join(artifactsDir, '01b-team-menu.png') })
  await host.page.click('.mode-tile--urban')
  await host.page.waitForSelector('.entry-screen', { timeout: 10000 })
  await host.page.screenshot({ path: join(artifactsDir, '02-room-entry.png') })

  await host.page.click('.entry-panel--create .primary-button')
  await host.page.waitForSelector('.lobby-screen', { timeout: 20000 })
  await host.page.waitForTimeout(700)
  await host.page.screenshot({ path: join(artifactsDir, '03-host-lobby.png') })

  const roomCode = (await host.page.textContent('.room-code-box strong'))?.trim()
  const address = (await host.page.textContent('.room-address code'))?.trim()
  if (!roomCode || !address) throw new Error('Room code or address missing from lobby')
  console.log('ROOM', { roomCode, address })

  const portMatch = address.match(/:(\d+)$/)
  const joinAddress = `127.0.0.1:${portMatch ? portMatch[1] : '17890'}`

  const client = await launchApp(clientData)
  clientApp = client.app
  clientPage = client.page
  watchPage(client.page, 'client')

  await client.page.waitForSelector('.home-screen', { timeout: 30000 })
  await client.page.click('.home-mode-card--regular')
  await client.page.waitForSelector('.menu-screen--combat', { timeout: 10000 })
  await client.page.click('.mode-tile--team')
  await client.page.waitForSelector('.menu-screen--team', { timeout: 10000 })
  await client.page.click('.mode-tile--urban')
  await client.page.waitForSelector('.entry-screen', { timeout: 10000 })
  await client.page.locator('.join-form input').nth(0).fill(joinAddress)
  await client.page.locator('.join-form input').nth(1).fill(roomCode)
  await client.page.click('.join-form button[type="submit"]')
  await client.page.waitForSelector('.lobby-screen', { timeout: 20000 })

  await host.page.waitForFunction(
    () => document.querySelectorAll('.lobby-player').length >= 2,
    null,
    { timeout: 12000 }
  )
  await client.page.waitForFunction(
    () => document.querySelectorAll('.lobby-player').length >= 2,
    null,
    { timeout: 12000 }
  )

  const joinAction = host.page.locator('.unassigned-strip__actions .team-join--red')
  if (!(await joinAction.isVisible())) {
    throw new Error('Lobby team-join action is not visible')
  }

  // Both clients auto-sync their pre-seeded appearance on join.
  await host.page.waitForFunction(
    () => {
      const cards = Array.from(document.querySelectorAll('.lobby-player'))
      return cards.length >= 2 && cards.every((card) => card.textContent.includes('已建档'))
    },
    null,
    { timeout: 12000 }
  )
  await host.page.waitForTimeout(400)
  await host.page.screenshot({ path: join(artifactsDir, '04-host-two-players.png') })
  await client.page.screenshot({ path: join(artifactsDir, '05-client-two-players.png') })

  // Host opens enrolment to validate camera + offline model loading.
  await host.page.click('.lobby-self-actions .secondary-button')
  await host.page.waitForSelector('.enroll-modal', { timeout: 15000 })
  await host.page.waitForFunction(
    () => {
      const status = document.querySelector('.enroll-camera__status')
      return (
        Boolean(status) &&
        status.textContent.includes('摄像头已就绪') &&
        !status.textContent.includes('识别引擎加载中')
      )
    },
    null,
    { timeout: 60000 }
  )
  await host.page.screenshot({ path: join(artifactsDir, '06-enrolment.png') })
  await host.page.click('.enroll-modal .modal-head .icon-button')
  await host.page.waitForSelector('.enroll-modal', { state: 'detached', timeout: 10000 })

  // Team selection and readiness.
  await host.page.click('.team-column--red .team-join')
  await client.page.click('.team-column--blue .team-join')
  await host.page.waitForFunction(
    () =>
      document.querySelectorAll('.team-column--red .lobby-player').length >= 1 &&
      document.querySelectorAll('.team-column--blue .lobby-player').length >= 1,
    null,
    { timeout: 12000 }
  )
  await host.page.screenshot({ path: join(artifactsDir, '07-host-team-assigned.png') })

  await client.page.locator('.lobby-self-actions .secondary-button').nth(1).click()
  await host.page.waitForSelector('.lobby-start:not([disabled])', { timeout: 12000 })
  await host.page.screenshot({ path: join(artifactsDir, '08-host-ready-to-start.png') })

  await host.page.click('.lobby-start')
  await host.page.waitForSelector('.battle-screen', { timeout: 20000 })
  await client.page.waitForSelector('.battle-screen', { timeout: 20000 })
  await host.page.waitForTimeout(5000)
  const battleDebug = await host.page.evaluate(() => ({
    hasBattle: Boolean(document.querySelector('.battle-screen')),
    hasTimer: Boolean(document.querySelector('.match-timer')),
    timerText: document.querySelector('.match-timer')?.textContent ?? null,
    countdownText: document.querySelector('.countdown-overlay')?.textContent ?? null,
    cameraOverlay: document.querySelector('.camera-overlay')?.textContent ?? null,
    deathOverlay: document.querySelector('.death-overlay')?.textContent ?? null,
    bodyText: document.body.innerText.slice(0, 1200)
  }))
  console.log('BATTLE_DEBUG', battleDebug)
  await host.page.screenshot({ path: join(artifactsDir, '09-battle-host.png') })
  await client.page.screenshot({ path: join(artifactsDir, '10-battle-client.png') })
  await host.page.waitForFunction(
    () => Boolean(document.querySelector('.match-timer')) && !document.querySelector('.countdown-overlay'),
    null,
    { timeout: 12000 }
  )
  await host.page.waitForTimeout(800)

  // Fire once. The fake camera contains no person, so the expected result is
  // "target not recognised" rather than a hit.
  await host.page.mouse.click(760, 500)
  await host.page.screenshot({ path: join(artifactsDir, '11a-battle-muzzle-flash.png') })
  await host.page.waitForSelector('.shot-feedback', { timeout: 20000 })
  const shotFeedback = (await host.page.textContent('.shot-feedback'))?.trim()
  await host.page.screenshot({ path: join(artifactsDir, '11-battle-fired.png') })
  console.log('SHOT_FEEDBACK', shotFeedback)
  if (!shotFeedback || !shotFeedback.includes('未识别')) {
    throw new Error(`Expected an unrecognised-target response, got: ${shotFeedback}`)
  }

  const fieldLog = await readFieldLog(hostData)
  const fieldSession = fieldLog.entries.find((entry) => entry.type === 'session')
  const fieldShot = fieldLog.entries.find((entry) => entry.type === 'shot')
  if (!fieldSession) {
    throw new Error('Field-test JSONL is missing the session entry')
  }
  if (!fieldShot || fieldShot.server?.reason !== 'no-target') {
    throw new Error(
      `Field-test JSONL did not record the shot: ${JSON.stringify(fieldShot ?? null)}`
    )
  }
  if (fieldShot.debug?.detectMs === undefined || fieldShot.debug?.source === undefined) {
    throw new Error('Field-test shot entry is missing recognition diagnostics')
  }
  console.log('FIELD_LOG', {
    file: fieldLog.files[0],
    entries: fieldLog.entries.length,
    outcome: fieldShot.outcome,
    detectMs: fieldShot.debug.detectMs,
    source: fieldShot.debug.source
  })

  const battlePlayers = await host.page.locator('.roster-row').count().catch(() => 0)

  // Test-only hook: finish the match without waiting for the 5 minute timer.
  await hostApp.evaluate(() => {
    const hook = globalThis.__snapfireTest
    if (!hook) throw new Error('SNAPFIRE_TEST end-match hook is unavailable')
    hook.endMatch()
  })
  await host.page.waitForSelector('.results-screen', { timeout: 15000 })
  await client.page.waitForSelector('.results-screen', { timeout: 15000 })
  await host.page.waitForFunction(
    () => document.body.innerText.includes('战绩已保存到本机'),
    null,
    { timeout: 15000 }
  )
  const resultsText = (await host.page.textContent('.results-screen')) ?? ''
  if (!resultsText.includes('平局') && !resultsText.includes('获胜')) {
    throw new Error('Results screen did not show a winner or draw')
  }
  const fieldLogAfterMatch = await readFieldLog(hostData)
  const fieldMatchEnd = fieldLogAfterMatch.entries.find(
    (entry) => entry.type === 'match-end'
  )
  if (!fieldMatchEnd) {
    throw new Error('Field-test JSONL is missing the match-end entry')
  }
  await host.page.screenshot({ path: join(artifactsDir, '12-results-host.png') })
  await client.page.screenshot({ path: join(artifactsDir, '13-results-client.png') })

  await host.page.click('.results-actions .primary-button')
  await host.page.waitForSelector('.lobby-screen', { timeout: 15000 })
  await client.page.waitForSelector('.lobby-screen', { timeout: 15000 })
  await host.page.screenshot({ path: join(artifactsDir, '14-back-to-lobby.png') })

  console.log('SMOKE_OK', {
    roomCode,
    joinAddress,
    battlePlayers,
    shotFeedback,
    resultsFlow: 'ok',
    fieldLog: {
      file: fieldLog.files[0],
      entries: fieldLogAfterMatch.entries.length,
      shotOutcome: fieldShot.outcome,
      matchEnd: Boolean(fieldMatchEnd)
    }
  })
  console.log('VISION_LOGS', relevantLogs.filter((line) => line.includes('[vision]')).join('\n'))
  if (errors.length > 0) {
    throw new Error(`Renderer errors detected:\n${errors.join('\n')}`)
  }
} catch (error) {
  console.error('SMOKE_FAILED', error)
  console.error('RENDERER_ERRORS', errors.join('\n'))
  console.error('RELEVANT_LOGS', relevantLogs.join('\n'))
  if (hostPage) {
    await hostPage
      .screenshot({ path: join(artifactsDir, 'failure-host.png') })
      .catch(() => undefined)
    const text = await hostPage.evaluate(() => document.body.innerText).catch(() => '')
    console.error('HOST_BODY_TEXT', text.slice(0, 1600))
  }
  if (clientPage) {
    await clientPage
      .screenshot({ path: join(artifactsDir, 'failure-client.png') })
      .catch(() => undefined)
  }
  process.exitCode = 1
} finally {
  if (clientApp) {
    await clientApp.close().catch(() => undefined)
  }
  if (hostApp) {
    await hostApp.close().catch(() => undefined)
  }
  if (clientData) {
    await rm(clientData, { recursive: true, force: true }).catch(() => undefined)
  }
  if (hostData) {
    await rm(hostData, { recursive: true, force: true }).catch(() => undefined)
  }
}
