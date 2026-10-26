import assert from 'node:assert/strict'
import { _electron as electron } from 'playwright-core'
import electronPath from 'electron'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Long March desktop smoke:
 *   home → 长征导读（10 秒门禁）→ 常规 → 建房/加入 → 红军/国民党军大厅
 *   → 开局 → 战斗画面换装画布
 *
 * Run after `npm run build`; the sibling SnapFire-Mobile checkout is not
 * required because this test only uses the desktop renderer.
 */

const artifactsDir = join(process.cwd(), 'artifacts')
await mkdir(artifactsDir, { recursive: true })
const errors = []

function watchPage(page, label) {
  page.on('pageerror', (error) => errors.push(`${label}: ${String(error)}`))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`${label} [console] ${message.text()}`)
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
    volume: 0,
    detectionQuality: 'performance',
    cameraDeviceId: null,
    showDebug: false,
    fieldTestLog: false
  }
  await writeFile(join(dataDir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf8')
}

async function launchApp(userDataDir) {
  const app = await electron.launch({
    executablePath: electronPath,
    args: ['.'],
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

async function enterLongMarch(page) {
  await page.waitForSelector('.home-screen', { timeout: 30000 })
  await page.click('.home-mode-card--campaign')
  await page.waitForSelector('.campaign-screen--intro', { timeout: 15000 })
  await page.getByText(/还需等待 \d+ 秒/).waitFor({ timeout: 5000 })
  assert.equal(
    await page.locator('.campaign-gate__button').isDisabled(),
    true,
    'next must stay locked during the 10 second introduction'
  )
  await page.waitForFunction(
    () => {
      const button = document.querySelector('.campaign-gate__button')
      return button instanceof HTMLButtonElement && !button.disabled
    },
    null,
    { timeout: 20000 }
  )
  await page.click('.campaign-gate__button')
  await page.waitForSelector('.campaign-screen--menu', { timeout: 10000 })
}

let hostApp = null
let clientApp = null

try {
  const hostData = await mkdtemp(join(tmpdir(), 'snapfire-lm-host-'))
  const clientData = await mkdtemp(join(tmpdir(), 'snapfire-lm-client-'))
  await prepareUserData(hostData)
  await prepareUserData(clientData)

  const host = await launchApp(hostData)
  hostApp = host.app
  watchPage(host.page, 'host')
  const client = await launchApp(clientData)
  clientApp = client.app
  watchPage(client.page, 'client')

  // The 10 second gate runs concurrently in both apps.
  await Promise.all([enterLongMarch(host.page), enterLongMarch(client.page)])
  await host.page.screenshot({ path: join(artifactsDir, 'long-march-menu.png') })

  for (const page of [host.page, client.page]) {
    await page.click('.mode-tile--campaign-combat')
    await page.waitForSelector('.entry-screen', { timeout: 10000 })
    const entryText = (await page.textContent('.entry-screen')) ?? ''
    assert.match(entryText, /长征 90 周年/)
    assert.match(entryText, /红军 \/ 国民党军/)
  }

  await host.page.click('.entry-panel--create .primary-button')
  await host.page.waitForSelector('.lobby-screen', { timeout: 20000 })
  await host.page.waitForSelector('.room-code-box strong', { timeout: 20000 })
  const roomCode = (await host.page.textContent('.room-code-box strong'))?.trim()
  const address = (await host.page.textContent('.room-address code'))?.trim()
  assert.ok(roomCode && /^\d{4}$/.test(roomCode), 'room code missing')
  const port = address.match(/:(\d+)$/)?.[1] ?? '17890'
  const joinAddress = `127.0.0.1:${port}`

  const joinInputs = client.page.locator('.join-form input')
  await joinInputs.nth(0).fill(joinAddress)
  await joinInputs.nth(1).fill(roomCode)
  await client.page.click('.join-form button[type="submit"]')
  await client.page.waitForSelector('.lobby-screen', { timeout: 20000 })

  for (const page of [host.page, client.page]) {
    const text = (await page.textContent('.lobby-screen')) ?? ''
    assert.match(text, /红军/)
    assert.match(text, /国民党军/)
  }

  await host.page.click('.team-column--red .team-join')
  await client.page.click('.team-column--blue .team-join')
  await client.page.locator('.lobby-self-actions .secondary-button').nth(1).click()
  await host.page.waitForSelector('.lobby-start:not([disabled])', { timeout: 15000 })
  await host.page.screenshot({ path: join(artifactsDir, 'long-march-lobby.png') })
  await host.page.click('.lobby-start')

  await host.page.waitForSelector('.battle-screen', { timeout: 20000 })
  await client.page.waitForSelector('.battle-screen', { timeout: 20000 })
  for (const page of [host.page, client.page]) {
    await page.waitForSelector('[data-uniform-overlay="true"]', { timeout: 20000 })
    await page.waitForFunction(
      () => {
        const canvas = document.querySelector('[data-uniform-overlay="true"]')
        return (
          canvas instanceof HTMLCanvasElement &&
          canvas.width > 0 &&
          canvas.height > 0
        )
      },
      null,
      { timeout: 20000 }
    )
    const text = (await page.textContent('.battle-screen')) ?? ''
    assert.match(text, /红军/)
    assert.match(text, /国民党军/)
  }

  await host.page.screenshot({
    path: join(artifactsDir, 'long-march-host-battle.png'),
    timeout: 60000
  })
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`)
  console.log('SMOKE_LONG_MARCH_OK', { roomCode })
} finally {
  if (clientApp) await clientApp.close().catch(() => undefined)
  if (hostApp) await hostApp.close().catch(() => undefined)
}
