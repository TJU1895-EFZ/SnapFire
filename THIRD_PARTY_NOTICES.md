# Third-Party Notices

SnapFire's own source code is licensed under the **Apache License, Version 2.0**.
See `LICENSE` for the full text.

The distributed Windows application includes the third-party components listed
below. Their licenses continue to apply to those components; SnapFire does not
relicense them.

## Runtime dependencies

| Component | Version | License | Notes |
| --- | --- | --- | --- |
| `@vladmandic/human` | 3.3.6 | MIT | Copyright (c) Vladimir Mandic. License copy: `src/renderer/public/models/LICENSE-human.txt` (also copied into builds). |
| React | 19.3.1 | MIT | |
| React DOM | 19.3.1 | MIT | |
| Three.js | 0.186.1 | MIT | |
| `ws` | 8.22.0 | MIT | |
| `node-forge` | 1.4.0 | BSD-3-Clause OR GPL-2.0 | Used only to generate the local CA / HTTPS certificate for the optional phone server. |
| `qrcode` | 1.5.4 | MIT | Generates the phone install-page QR code in the lobby. |
| Electron | 44.9.0 | MIT | The Electron distribution contains Chromium and other third-party components; see the `LICENSES.chromium.html` and license files shipped with Electron. |

## Bundled mobile client (optional)

The desktop app can serve the separately built **SnapFire-Mobile** PWA from
`resources/mobile-dist`. Its own runtime dependencies are React, React DOM,
Three.js and `@vladmandic/human` (all MIT); see
`SnapFire-Mobile/THIRD_PARTY_NOTICES.md` in the mobile repository for the full
list and model licenses.

## Bundled AI models

`blazeface`, `faceres` and `movenet-lightning` are redistributed unmodified as
part of `@vladmandic/human`. Model credits and upstream licenses are listed at:

- https://github.com/vladmandic/human/wiki/Models

Keep the Human license file in the model directory when redistributing the
packaged application.

## Development-only dependencies

The following are build/test tools and are not intended to be shipped inside
the application bundle (their compiled output may be included):

- Vite, electron-vite, Vitest, `@vitejs/plugin-react`: MIT
- TypeScript: Apache-2.0
- Playwright Core: Apache-2.0
- `@types/*`: MIT

See each package's license file under `node_modules/` and `package-lock.json`
for the complete dependency set.

## Original assets

The SnapFire icon (`build/icon.ico`, `build/icon.png`,
`src/renderer/public/icon.png`), the homepage operator SVG, and the 3D
weapon/arm primitives are original to this project and are covered by the
project license.

## Full license texts

- Apache-2.0: `LICENSE`
- MIT texts for the runtime packages: `third-party-licenses/`
  - `human-LICENSE.txt`
  - `react-LICENSE.txt`
  - `react-dom-LICENSE.txt`
  - `three-LICENSE.txt`
  - `ws-LICENSE.txt`
  - `node-forge-LICENSE.txt`
  - `qrcode-LICENSE.txt`
  - `electron-LICENSE.txt`
- Human license copy inside the model directory:
  `src/renderer/public/models/LICENSE-human.txt`
- Chromium and Electron's other bundled third-party licenses: see
  `LICENSES.chromium.html` and the license documents shipped with the Electron
  runtime.

When publishing the portable zip, keep `LICENSE`, `THIRD_PARTY_NOTICES.md` and
the `third-party-licenses/` directory alongside the application files.
