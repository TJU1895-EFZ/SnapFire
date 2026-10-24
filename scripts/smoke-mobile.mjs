#!/usr/bin/env node
/**
 * Focused smoke test for the embedded mobile server.
 *
 * Launches the desktop app, creates a room, reads the phone URL from the
 * lobby, then verifies:
 *   - the built mobile PWA is served over HTTPS
 *   - models and service-worker headers are reachable
 *   - a WSS client can join the desktop room through the proxy
 *
 * Run after `npm run build` (the sibling SnapFire-Mobile/dist must exist).
 */

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright-core'
import electronPath from 'electron'
import { WebSocket } from 'ws'

// The leaf certificate is signed by the app's local CA, which is not in the
// Node trust store.  This is a local-only test.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const dataDir = await mkdtemp(join(tmpdir(), 'snapfire-mobile-smoke-'))
const packagedExe = process.env.SNAPFIRE_APP_EXE
let app = null
let page = null

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForMessage(socket, predicate, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage)
      reject(new Error('timed out waiting for a websocket message'))
    }, timeoutMs)
    const onMessage = (raw) => {
      let message
      try {
        message = JSON.parse(String(raw))
      } catch {
        return
      }
      if (!predicate(message)) return
      clearTimeout(timer)
      socket.off('message', onMessage)
      resolve(message)
    }
    socket.on('message', onMessage)
  })
}

try {
  console.log('APP', packagedExe ? `packaged: ${packagedExe}` : 'source: electron .')
  app = await electron.launch({
    executablePath: packagedExe || electronPath,
    args: packagedExe ? [] : ['.'],
    env: {
      ...process.env,
      SNAPFIRE_USER_DATA_DIR: dataDir,
      SNAPFIRE_FAKE_CAMERA: '1',
      SNAPFIRE_TEST: '1'
    }
  })
  page = await app.firstWindow()
  page.on('pageerror', (error) => {
    console.error('[pageerror]', error)
  })

  await page.waitForSelector('.home-screen', { timeout: 30000 })
  await page.click('.mode-card--active')
  await page.waitForSelector('.entry-screen', { timeout: 10000 })
  await page.click('.entry-panel--create .primary-button')
  await page.waitForSelector('.lobby-screen', { timeout: 30000 })
  await page.waitForSelector('.mobile-join-card__url code', { timeout: 30000 })
  const artifactsDir = join(process.cwd(), 'artifacts')
  await mkdir(artifactsDir, { recursive: true })
  await page.screenshot({ path: join(artifactsDir, 'mobile-lobby-qr.png') })

  const roomCode = (await page.textContent('.room-code-box strong'))?.trim()
  const mobileUrl = (await page.textContent('.mobile-join-card__url code'))?.trim()
  const installUrl = (
    await page.textContent('.mobile-join-card__install-url')
  )?.trim()
  const qrSrc = await page.getAttribute('.mobile-join-card__qr img', 'src')
  assert.ok(roomCode && /^\d{4}$/.test(roomCode), 'room code missing')
  assert.ok(mobileUrl?.startsWith('https://'), 'mobile URL missing')
  assert.ok(installUrl?.startsWith('http://'), 'install URL missing')
  assert.ok(
    qrSrc?.startsWith('data:image/png;base64,'),
    'phone QR data URL missing'
  )

  const parsed = new URL(mobileUrl)
  const port = parsed.port || '443'
  const localBase = `https://127.0.0.1:${port}`

  const index = await fetch(`${localBase}/`)
  assert.equal(index.status, 200)
  const html = await index.text()
  assert.match(html, /<div id="root">/)

  const model = await fetch(`${localBase}/models/blazeface.json`)
  assert.equal(model.status, 200)

  const worker = await fetch(`${localBase}/service-worker.js`)
  assert.equal(worker.status, 200)
  assert.equal(worker.headers.get('service-worker-allowed'), '/')

  const installParsed = new URL(installUrl)
  const installBase = `http://127.0.0.1:${installParsed.port || '80'}`
  const installPage = await fetch(`${installBase}/`)
  assert.equal(installPage.status, 200)
  const installHtml = await installPage.text()
  assert.match(installHtml, new RegExp(roomCode))
  assert.match(installHtml, /ca-cert\.crt/)
  assert.match(installHtml, new RegExp(`https://127\\.0\\.0\\.1:${port}`))

  const ca = await fetch(`${installBase}/ca-cert.crt`)
  assert.equal(ca.status, 200)
  assert.match(await ca.text(), /BEGIN CERTIFICATE/)
  assert.match(
    ca.headers.get('content-disposition') ?? '',
    /snapfire-ca\.crt/
  )

  const socket = new WebSocket(`wss://127.0.0.1:${port}`, {
    rejectUnauthorized: false
  })
  await new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
  socket.send(
    JSON.stringify({
      type: 'join',
      roomCode,
      playerId: 'mobile-smoke-player',
      name: 'Mobile Smoke'
    })
  )
  const welcome = await waitForMessage(
    socket,
    (message) => message.type === 'welcome'
  )
  assert.equal(welcome.room.roomCode, roomCode)
  assert.equal(welcome.selfId, 'mobile-smoke-player')

  socket.send(JSON.stringify({ type: 'leave' }))
  socket.close()
  await wait(150)

  console.log('SMOKE_MOBILE_OK', {
    roomCode,
    mobileUrl,
    installUrl,
    qr: qrSrc.slice(0, 22),
    http: index.status,
    model: model.status,
    installPage: installPage.status,
    caDownload: ca.status,
    wssJoin: true
  })
} catch (error) {
  console.error('SMOKE_MOBILE_FAILED', error)
  if (page) {
    const text = await page.evaluate(() => document.body.innerText).catch(() => '')
    console.error('HOST_BODY_TEXT', text.slice(0, 1600))
  }
  process.exitCode = 1
} finally {
  if (app) await app.close().catch(() => undefined)
  await rm(dataDir, { recursive: true, force: true }).catch(() => undefined)
}
