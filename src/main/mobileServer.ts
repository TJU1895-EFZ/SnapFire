/**
 * HTTPS + WSS server for the mobile PWA.
 *
 * The desktop room server speaks plain `ws://` on its own port.  Phones need
 * an HTTPS page (for getUserMedia and service workers) and a `wss://` socket.
 * This server serves the built SnapFire-Mobile `dist/` over HTTPS and tunnels
 * WebSocket upgrades to the existing LanServer, so the desktop protocol and
 * room state stay untouched.
 *
 * Certificates are generated locally: a persistent CA is created once under
 * userData/mobile-certs, and a short-lived leaf certificate (with the current
 * LAN IPs in its SAN) is issued for every room.  Install `ca-cert.pem` on each
 * phone once; the leaf is then trusted automatically.
 */

import {
  createServer as createHttpsServer,
  type Server as HttpsServer
} from 'node:https'
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse
} from 'node:http'
import { createReadStream, existsSync, promises as fs } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { networkInterfaces } from 'node:os'
import net from 'node:net'
import forge from 'node-forge'

const DEFAULT_MOBILE_PORT = 8443
const PORT_ATTEMPTS = 20
const CA_CERT_FILE = 'ca-cert.pem'
const CA_KEY_FILE = join('private', 'ca-key.pem')
const CA_READ_ME = 'README.txt'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

export interface MobileServerOptions {
  distDir: string
  certDir: string
  startPort?: number
  /** Shown on the phone install page together with the CA download link. */
  roomCode?: string
}

export interface MobileServerInfo {
  port: number
  url: string
  /** Plain-HTTP page for downloading the CA and opening the phone client. */
  installUrl: string | null
  certPath: string
  lanIps: string[]
}

export interface MobileServerStatus {
  mobileUrl: string | null
  mobilePort: number | null
  mobileInstallUrl: string | null
  mobileCertPath: string | null
}

interface CertificatePair {
  key: string
  cert: string
}

interface LocalCa {
  cert: forge.pki.Certificate
  key: forge.pki.rsa.PrivateKey
  certPath: string
}

export function getLanIps(): string[] {
  const result = new Set<string>()
  const interfaces = networkInterfaces()
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      // Link-local and benchmark/VPN virtual adapters are not reachable from
      // a phone in practice.
      if (entry.address.startsWith('169.254.')) continue
      if (entry.address.startsWith('198.18.')) continue
      result.add(entry.address)
    }
  }
  return [...result]
}

function cacheControl(pathname: string): string {
  if (pathname.startsWith('/assets/')) {
    return 'public, max-age=31536000, immutable'
  }
  if (pathname.startsWith('/icons/') || pathname.startsWith('/models/')) {
    return 'public, max-age=604800'
  }
  return 'no-cache'
}

function safeFilePath(root: string, pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const candidate = resolve(root, `.${decoded}`)
  if (candidate !== root && !candidate.startsWith(root + sep)) return null
  return candidate
}

function randomSerial(): string {
  return forge.util.bytesToHex(forge.random.getBytesSync(16))
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

async function loadOrCreateCa(certDir: string): Promise<LocalCa> {
  const certPath = join(certDir, CA_CERT_FILE)
  const keyPath = join(certDir, CA_KEY_FILE)

  await fs.mkdir(join(certDir, 'private'), { recursive: true })

  if (existsSync(certPath) && existsSync(keyPath)) {
    try {
      const [certPem, keyPem] = await Promise.all([
        fs.readFile(certPath, 'utf8'),
        fs.readFile(keyPath, 'utf8')
      ])
      return {
        cert: forge.pki.certificateFromPem(certPem),
        key: forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey,
        certPath
      }
    } catch (error) {
      throw new Error(
        `本地 CA 证书损坏：${certPath}。请删除 ${certDir} 后重试。` +
          (error instanceof Error ? `（${error.message}）` : '')
      )
    }
  }

  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = randomSerial()
  cert.validity.notBefore = new Date(Date.now() - 60_000)
  cert.validity.notAfter = new Date(
    Date.now() + 10 * 365 * 24 * 60 * 60 * 1000
  )
  const attributes = [
    { shortName: 'CN', value: 'SnapFire Mobile Local CA' },
    { shortName: 'O', value: 'SnapFire' }
  ]
  cert.setSubject(attributes)
  cert.setIssuer(attributes)
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    {
      name: 'keyUsage',
      keyCertSign: true,
      cRLSign: true,
      digitalSignature: true,
      critical: true
    },
    { name: 'subjectKeyIdentifier' }
  ])
  cert.sign(keys.privateKey, forge.md.sha256.create())

  await fs.writeFile(certPath, forge.pki.certificateToPem(cert), 'utf8')
  await fs.writeFile(keyPath, forge.pki.privateKeyToPem(keys.privateKey), {
    encoding: 'utf8',
    mode: 0o600
  })
  await fs.writeFile(
    join(certDir, CA_READ_ME),
    [
      'SnapFire Mobile 本地 CA',
      '',
      '把 ca-cert.pem 传到每台手机，并安装为受信任的 CA：',
      '  Android: 设置 → 安全 → 加密与凭据 → 安装证书 → CA 证书',
      '  iOS: 安装描述文件后，到 设置 → 通用 → 关于本机 →',
      '       证书信任设置 中开启完全信任',
      '',
      '不要分享 private/ 目录；里面是 CA 私钥。',
      ''
    ].join('\n'),
    'utf8'
  )

  console.log(`[mobile] created local CA at ${certPath}`)
  return { cert, key: keys.privateKey, certPath }
}

function issueServerCertificate(ca: LocalCa, lanIps: string[]): CertificatePair {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = randomSerial()
  cert.validity.notBefore = new Date(Date.now() - 60_000)
  cert.validity.notAfter = new Date(
    Date.now() + 365 * 24 * 60 * 60 * 1000
  )
  cert.setSubject([{ shortName: 'CN', value: 'SnapFire Mobile' }])
  cert.setIssuer(ca.cert.subject.attributes)

  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    ...lanIps.map((ip) => ({ type: 7, ip }))
  ]
  cert.setExtensions([
    { name: 'basicConstraints', cA: false, critical: true },
    {
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true,
      critical: true
    },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames }
  ])
  cert.sign(ca.key, forge.md.sha256.create())

  return {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert)
  }
}

interface Tunnel {
  client: net.Socket
  backend: net.Socket
}

export class MobileServer {
  private server: HttpsServer | null = null
  private port: number | null = null
  private backendPort: number | null = null
  private distDir = ''
  private certPath = ''
  private caCertPath = ''
  private lanIps: string[] = []
  private roomCode = ''
  private appUrl = ''
  private installServer: HttpServer | null = null
  private installPort: number | null = null
  private tunnels = new Set<Tunnel>()

  isRunning(): boolean {
    return this.server !== null && this.port !== null
  }

  getInfo(): MobileServerStatus {
    return {
      mobileUrl: this.isRunning() ? this.url() : null,
      mobilePort: this.isRunning() ? this.port : null,
      mobileInstallUrl: this.installUrl(),
      mobileCertPath: this.certPath || null
    }
  }

  private installUrl(): string | null {
    if (!this.installServer || this.installPort === null) return null
    const host = this.lanIps[0] ?? '127.0.0.1'
    return `http://${host}:${this.installPort}`
  }

  getCertPath(): string | null {
    return this.certPath || null
  }

  async start(
    backendPort: number,
    options: MobileServerOptions
  ): Promise<MobileServerInfo> {
    if (this.isRunning() && this.backendPort === backendPort) {
      return {
        port: this.port as number,
        url: this.url(),
        installUrl: this.installUrl(),
        certPath: this.certPath,
        lanIps: this.lanIps
      }
    }
    if (this.server) await this.stop()

    const distDir = resolve(options.distDir)
    if (!existsSync(join(distDir, 'index.html'))) {
      throw new Error(
        `未找到手机客户端构建：${join(distDir, 'index.html')}。` +
          '请先在 SnapFire-Mobile 仓库运行 npm run build，或设置 SNAPFIRE_MOBILE_DIST。'
      )
    }

    const lanIps = getLanIps()
    const ca = await loadOrCreateCa(options.certDir)
    const leaf = issueServerCertificate(ca, lanIps)
    const server = await this.listen(
      leaf,
      distDir,
      backendPort,
      options.startPort ?? DEFAULT_MOBILE_PORT
    )

    this.server = server
    this.backendPort = backendPort
    this.distDir = distDir
    this.certPath = ca.certPath
    this.caCertPath = ca.certPath
    this.lanIps = lanIps
    this.roomCode = options.roomCode ?? ''
    this.appUrl = this.url()

    let installUrl: string | null = null
    try {
      const install = await this.startInstallServer(
        (this.port ?? DEFAULT_MOBILE_PORT) + 1
      )
      this.installServer = install.server
      this.installPort = install.port
      installUrl = this.installUrl()
      console.log(`[mobile] phone install page at ${installUrl}`)
    } catch (error) {
      console.warn('[mobile] install page unavailable', error)
    }

    console.log(`[mobile] serving ${distDir} at ${this.url()}`)
    console.log(`[mobile] WSS proxy -> ws://127.0.0.1:${backendPort}`)
    console.log(`[mobile] CA certificate: ${ca.certPath}`)

    return {
      port: this.port as number,
      url: this.url(),
      installUrl,
      certPath: ca.certPath,
      lanIps
    }
  }

  async stop(): Promise<void> {
    const server = this.server
    const installServer = this.installServer
    const wasRunning = this.isRunning()
    this.server = null
    this.port = null
    this.backendPort = null
    this.installServer = null
    this.installPort = null
    this.roomCode = ''
    this.appUrl = ''

    for (const tunnel of this.tunnels) {
      try {
        tunnel.client.destroy()
        tunnel.backend.destroy()
      } catch {
        // ignore
      }
    }
    this.tunnels.clear()

    if (server) {
      ;(server as HttpsServer & { closeAllConnections?: () => void })
        .closeAllConnections?.()
      await new Promise<void>((resolveStop) => {
        server.close(() => resolveStop())
      })
    }
    if (installServer) {
      ;(installServer as HttpServer & { closeAllConnections?: () => void })
        .closeAllConnections?.()
      await new Promise<void>((resolveStop) => {
        installServer.close(() => resolveStop())
      })
    }
    if (wasRunning) console.log('[mobile] server stopped')
  }

  private url(): string {
    const host = this.lanIps[0] ?? '127.0.0.1'
    return `https://${host}:${this.port}`
  }

  private async listen(
    leaf: CertificatePair,
    distDir: string,
    backendPort: number,
    startPort: number
  ): Promise<HttpsServer> {
    let lastError: unknown = null

    for (let attempt = 0; attempt < PORT_ATTEMPTS; attempt += 1) {
      const port = startPort + attempt
      const server = createHttpsServer(
        { key: leaf.key, cert: leaf.cert, minVersion: 'TLSv1.2' },
        (req, res) => {
          void this.handleStatic(req, res, distDir).catch((error) => {
            console.error('[mobile] static handler failed', error)
            if (!res.headersSent) res.writeHead(500)
            res.end()
          })
        }
      )

      server.on('upgrade', (req, socket, head) => {
        this.handleUpgrade(req, socket as net.Socket, head, backendPort)
      })
      server.on('clientError', (_error, socket) => {
        if (socket.writable) {
          socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
        } else {
          socket.destroy()
        }
      })

      try {
        await new Promise<void>((resolveListen, rejectListen) => {
          const onError = (error: NodeJS.ErrnoException): void => {
            server.removeListener('listening', onListening)
            rejectListen(error)
          }
          const onListening = (): void => {
            server.removeListener('error', onError)
            resolveListen()
          }
          server.once('error', onError)
          server.once('listening', onListening)
          server.listen(port, '0.0.0.0')
        })
        this.port = port
        server.on('error', (error) => {
          console.error('[mobile] server error', error)
        })
        return server
      } catch (error) {
        lastError = error
        try {
          server.close()
        } catch {
          // ignore
        }
      }
    }

    throw new Error(
      `无法在 ${startPort}~${startPort + PORT_ATTEMPTS - 1} 端口启动手机服务：` +
        (lastError instanceof Error ? lastError.message : String(lastError))
    )
  }

  private async startInstallServer(
    startPort: number
  ): Promise<{ server: HttpServer; port: number }> {
    let lastError: unknown = null

    for (let attempt = 0; attempt < PORT_ATTEMPTS; attempt += 1) {
      const port = startPort + attempt
      const server = createHttpServer((req, res) => {
        void this.handleInstall(req, res).catch((error) => {
          console.error('[mobile] install page failed', error)
          if (!res.headersSent) res.writeHead(500)
          res.end()
        })
      })
      server.on('clientError', (_error, socket) => {
        if (socket.writable) {
          socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
        } else {
          socket.destroy()
        }
      })

      try {
        await new Promise<void>((resolveListen, rejectListen) => {
          const onError = (error: NodeJS.ErrnoException): void => {
            server.removeListener('listening', onListening)
            rejectListen(error)
          }
          const onListening = (): void => {
            server.removeListener('error', onError)
            resolveListen()
          }
          server.once('error', onError)
          server.once('listening', onListening)
          server.listen(port, '0.0.0.0')
        })
        server.on('error', (error) => {
          console.error('[mobile] install server error', error)
        })
        return { server, port }
      } catch (error) {
        lastError = error
        try {
          server.close()
        } catch {
          // ignore
        }
      }
    }

    throw new Error(
      `无法在 ${startPort}~${startPort + PORT_ATTEMPTS - 1} 端口启动手机安装页：` +
        (lastError instanceof Error ? lastError.message : String(lastError))
    )
  }

  private async handleInstall(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' })
      res.end('Method Not Allowed')
      return
    }

    let pathname: string
    try {
      pathname = new URL(req.url || '/', 'http://mobile.local').pathname
    } catch {
      res.writeHead(400)
      res.end('Bad Request')
      return
    }

    if (pathname === '/ca-cert.pem' || pathname === '/ca-cert.crt') {
      if (!this.caCertPath) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('CA certificate not available')
        return
      }
      const pem = await fs.readFile(this.caCertPath, 'utf8')
      res.writeHead(200, {
        'Content-Type': 'application/x-x509-ca-cert; charset=utf-8',
        'Content-Length': Buffer.byteLength(pem),
        'Content-Disposition': 'attachment; filename="snapfire-ca.crt"',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      })
      if (req.method === 'HEAD') {
        res.end()
      } else {
        res.end(pem)
      }
      return
    }

    if (pathname === '/app') {
      res.writeHead(302, { Location: this.appUrl || '/' })
      res.end()
      return
    }

    if (pathname === '/' || pathname === '/index.html') {
      // Use the address the phone actually used, so multi-NIC hosts still
      // produce a reachable HTTPS link.  Only accept hosts that belong to
      // this machine, otherwise fall back to the advertised LAN address.
      const hostHeader = String(req.headers.host || '').split(':')[0]
      const knownHost =
        hostHeader === 'localhost' ||
        hostHeader === '127.0.0.1' ||
        this.lanIps.includes(hostHeader)
      const host = knownHost ? hostHeader : this.lanIps[0] || '127.0.0.1'
      const appUrl =
        this.port !== null ? `https://${host}:${this.port}` : this.appUrl
      const html = this.renderInstallPage(appUrl)
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(html),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      })
      if (req.method === 'HEAD') {
        res.end()
      } else {
        res.end(html)
      }
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not Found')
  }

  private renderInstallPage(appUrl: string): string {
    const room = this.roomCode ? escapeHtml(this.roomCode) : ''
    const roomLine = room
      ? `<p class="room">房间号 <strong>${room}</strong></p>`
      : ''
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>SnapFire 手机客户端</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; padding: 24px 18px 40px;
    background: radial-gradient(circle at 50% 0%, #1a2024, #07090a 55%);
    color: #e0e0e0; font-family: system-ui, -apple-system, "Microsoft YaHei", sans-serif;
    line-height: 1.6;
  }
  main { max-width: 520px; margin: 0 auto; }
  h1 { margin: 0 0 4px; font-size: 26px; letter-spacing: .08em; }
  .sub { margin: 0 0 18px; color: #8a9199; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; }
  .room { margin: 0 0 18px; font-size: 14px; color: #8a9199; }
  .room strong { color: #ffb340; font-size: 22px; letter-spacing: .16em; }
  .card { background: rgba(17,21,24,.92); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 16px; margin-bottom: 14px; }
  .card h2 { margin: 0 0 8px; font-size: 15px; }
  .card h3 { margin: 14px 0 4px; font-size: 13px; color: #ffb340; }
  .card p, .card li { color: #b7bdc4; font-size: 13px; }
  ol { padding-left: 20px; margin: 6px 0; }
  .btn { display: flex; align-items: center; justify-content: center; min-height: 48px; margin: 10px 0; border-radius: 8px; background: #f0a030; color: #000; font-weight: 700; font-size: 15px; text-decoration: none; }
  .btn.secondary { background: rgba(255,255,255,.08); color: #e0e0e0; border: 1px solid rgba(255,255,255,.14); }
  .url { word-break: break-all; font-size: 11px; color: #8a9199; }
  .tip { font-size: 12px; color: #8a9199; }
  .warn { color: #ffb340; }
</style>
</head>
<body>
<main>
  <h1>SNAPFIRE</h1>
  <p class="sub">Mobile Client · LAN Install</p>
  ${roomLine}

  <section class="card">
    <h2>1. 下载并安装 CA 证书</h2>
    <p>只需安装一次。安装后浏览器才会信任房主电脑提供的 HTTPS 手机客户端。</p>
    <a class="btn" href="/ca-cert.crt" download="snapfire-ca.crt">下载 CA 证书</a>
    <h3>Android</h3>
    <ol>
      <li>下载后打开系统设置 → 安全 → 加密与凭据 → 安装证书 → CA 证书。</li>
      <li>选择刚下载的 <code>snapfire-ca.crt</code>。部分机型还需在“信任的凭据 → 用户”中启用。</li>
    </ol>
    <h3>iPhone / iPad</h3>
    <ol>
      <li>用 Safari 下载后，到 设置 → 通用 → VPN与设备管理 安装描述文件。</li>
      <li>再到 设置 → 通用 → 关于本机 → 证书信任设置，开启该证书的完全信任。</li>
    </ol>
  </section>

  <section class="card">
    <h2>2. 打开手机客户端</h2>
    <p>安装证书后，点击下面的按钮。首次打开需要允许摄像头权限。</p>
    <a class="btn secondary" href="${escapeHtml(appUrl)}">打开 SnapFire 手机客户端</a>
    <p class="url">${escapeHtml(appUrl)}</p>
    <p class="tip warn">如果浏览器仍提示证书不受信任，请确认 CA 已安装并启用完全信任，然后刷新本页重试。</p>
  </section>

  <p class="tip">证书只保存在房主电脑和你的手机上；房主不会上传照片或视频。请只在你信任的局域网中使用。</p>
</main>
</body>
</html>`
  }

  private async handleStatic(
    req: IncomingMessage,
    res: ServerResponse,
    root: string
  ): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' })
      res.end('Method Not Allowed')
      return
    }

    let pathname: string
    try {
      pathname = new URL(req.url || '/', 'https://mobile.local').pathname
    } catch {
      res.writeHead(400)
      res.end('Bad Request')
      return
    }

    const requestPath = pathname === '/' ? '/index.html' : pathname
    let filePath = safeFilePath(root, requestPath)
    if (!filePath) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    let stats: Awaited<ReturnType<typeof fs.stat>> | null = null
    try {
      stats = await fs.stat(filePath)
    } catch {
      stats = null
    }

    if (stats?.isDirectory()) {
      filePath = join(filePath, 'index.html')
      try {
        stats = await fs.stat(filePath)
      } catch {
        stats = null
      }
    }

    if (!stats && !extname(requestPath)) {
      const wantsHtml = String(req.headers.accept || '').includes('text/html')
      if (wantsHtml) {
        filePath = join(root, 'index.html')
        try {
          stats = await fs.stat(filePath)
        } catch {
          stats = null
        }
      }
    }

    if (!stats || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not Found')
      return
    }

    const extension = extname(filePath).toLowerCase()
    const headers: Record<string, string | number> = {
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
      'Content-Length': stats.size,
      'Cache-Control': cacheControl(pathname),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
    if (pathname === '/service-worker.js') {
      headers['Cache-Control'] = 'no-cache'
      headers['Service-Worker-Allowed'] = '/'
    }

    res.writeHead(200, headers)
    if (req.method === 'HEAD') {
      res.end()
      return
    }

    const stream = createReadStream(filePath)
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
    stream.pipe(res)
  }

  private handleUpgrade(
    req: IncomingMessage,
    client: net.Socket,
    head: Buffer,
    backendPort: number
  ): void {
    if (String(req.headers.upgrade || '').toLowerCase() !== 'websocket') {
      client.destroy()
      return
    }

    let backend: net.Socket
    try {
      backend = net.connect({ host: '127.0.0.1', port: backendPort }, () => {
        const lines = [`${req.method} ${req.url} HTTP/1.1`]
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          const name = req.rawHeaders[i]
          if (name.toLowerCase() === 'host') continue
          lines.push(`${name}: ${req.rawHeaders[i + 1]}`)
        }
        lines.push(`Host: 127.0.0.1:${backendPort}`)
        backend.write(`${lines.join('\r\n')}\r\n\r\n`)
        if (head.length) backend.write(head)
        backend.setNoDelay(true)
        client.setNoDelay(true)
        client.pipe(backend).pipe(client)
      })
    } catch (error) {
      console.warn('[mobile] websocket proxy setup failed', error)
      client.destroy()
      return
    }

    const tunnel: Tunnel = { client, backend }
    this.tunnels.add(tunnel)
    let closed = false
    const cleanup = (): void => {
      if (closed) return
      closed = true
      this.tunnels.delete(tunnel)
      client.destroy()
      backend.destroy()
    }

    backend.setTimeout(0)
    client.setTimeout(0)
    backend.on('error', (error) => {
      console.warn('[mobile] websocket backend error', error.message)
      cleanup()
    })
    backend.on('close', cleanup)
    client.on('error', cleanup)
    client.on('close', cleanup)
  }
}
