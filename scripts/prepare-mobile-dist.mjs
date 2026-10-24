#!/usr/bin/env node
/**
 * Copies the built SnapFire-Mobile client into resources/ so electron-builder
 * can ship it as `resources/mobile-dist` alongside the desktop app.
 *
 * Development does not need this: the main process also looks for the
 * sibling `../SnapFire-Mobile/dist` checkout.
 *
 * Usage:
 *   npm run prepare:mobile
 *   SNAPFIRE_MOBILE_DIST=/path/to/dist npm run prepare:mobile
 */

import { existsSync } from 'node:fs'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const source = resolve(
  process.env.SNAPFIRE_MOBILE_DIST || join(root, '..', 'SnapFire-Mobile', 'dist')
)
const target = resolve(root, 'resources', 'mobile-dist')
const optional = process.argv.includes('--optional')

if (!existsSync(join(source, 'index.html'))) {
  if (optional) {
    // Keep the desktop release buildable without the sibling mobile repo.
    // electron-builder still gets a directory, and the app reports that the
    // phone client is unavailable in the lobby.
    await rm(target, { recursive: true, force: true })
    await mkdir(target, { recursive: true })
    await writeFile(
      join(target, 'README.txt'),
      'SnapFire-Mobile was not built when this package was created.\n' +
        'Run `npm run prepare:mobile` after building the mobile client to include it.\n',
      'utf8'
    )
    console.warn(
      `\n[prepare:mobile] 未找到手机客户端构建：${join(source, 'index.html')}\n` +
        '本次打包不包含手机端（桌面功能不受影响）。\n'
    )
    process.exit(0)
  }
  console.error(
    `\n[prepare:mobile] 找不到手机客户端构建：${join(source, 'index.html')}\n` +
      '请先在 SnapFire-Mobile 仓库运行 npm run build，\n' +
      '或设置 SNAPFIRE_MOBILE_DIST 指向 dist 目录。\n'
  )
  process.exit(1)
}

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await cp(source, target, { recursive: true })

console.log(`[prepare:mobile] ${source} -> ${target}`)
