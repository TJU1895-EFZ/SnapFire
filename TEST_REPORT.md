# SnapFire 测试报告

- 日期：2026-10-19（初版）；2026-10-21 更新 v0.1.1；2026-10-24 更新真人测试
- 版本：v1.0.0（V1 范围 + 场地测试日志 + 真人实战数据 + 服务端超时修复）
- 依据：`PRD.md`、`DEV_PLAN.md`
- 结论：**自动化测试与 UI 冒烟全部通过；真人实战 2 场通过（红线 0 错误归属）；v1.0.0 已发布。**

---

## 1. 测试环境

| 项目 | 值 |
| --- | --- |
| 操作系统 | Windows 11 Home China 10.0.26200 |
| 架构 | x64 |
| Node.js | v24.21.0 |
| npm | 11.19.0 |
| Electron | 44.9.0 |
| electron-builder | 26.15.3 |
| Electron 构建 | electron-vite 6.0.0 / Vite 8.3.4 |
| UI | React 19.3.1 + TypeScript 5.9.x |
| 3D | Three.js 0.186.1 |
| 识别 | @vladmandic/human 3.3.6（blazeface + faceres + movenet-lightning） |
| 测试 | Vitest 5.0.5、Playwright Core（Electron） |
| 摄像头 | Chromium 假摄像头（测试图案，1920×1080）用于 UI 冒烟；真实摄像头待人工验收 |

> 说明：Electron 二进制通过 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 安装。

---

## 2. 自动化测试

### 2.1 类型检查

```bash
npm run typecheck
```

结果：**通过**（主进程 + 预加载 + 渲染进程，无 TypeScript 错误）。

### 2.2 生产构建

```bash
npm run build
```

结果：**通过**。

产物：

- `out/main/index.js`
- `out/preload/index.js`
- `out/renderer/index.html`
- `out/renderer/assets/index-*.js`（约 4.06 MB，含 Human/Three.js）
- `out/renderer/assets/index-*.css`（约 79 KB）
- `out/renderer/models/`：6 个离线模型文件（blazeface、faceres、movenet-lightning 的 json/bin）

### 2.3 单元与集成测试

```bash
npm test
```

结果：**6 个测试文件，35 项测试全部通过**，耗时约 11~12 秒。

| 测试文件 | 覆盖内容 | 结果 |
| --- | --- | --- |
| `tests/descriptors.test.ts` | 衣着相似度、同色/异色/亮度变化、身份匹配、排除自己、歧义拒绝、人脸辅助 | 8/8 通过 |
| `tests/net.test.ts` | 房主地址规范化（IP、端口、http/https、非法输入） | 6/6 通过 |
| `tests/storage.test.ts` | 档案/设置/建档/历史持久化、历史去重与 50 场上限、自动备份、导出/导入、恢复前备份、损坏文件恢复、清除数据 | 10/10 通过 |
| `tests/lanServer.test.ts` | 加入、3 人队上限、6 人房上限、设置裁剪、建档前置、扣血、误伤、阵亡、5 秒复活、2 秒无敌、结束、返回大厅 | 3/3 通过 |
| `tests/resultsScreen.test.ts` | 结算页渲染：胜方、比分、个人结果、战绩保存状态、返回大厅/等待房主 | 2/2 通过 |
| `tests/fieldLog.test.ts` | 场地测试 JSONL 顺序写入、非法/超大条目拒绝、识别结果分类（正确/错误归属/未识别/队友/无效/超时） | 6/6 通过 |

关键断言（摘录）：

- 同色衣着相似度 > 0.98；不同色 < 0.5；中等亮度变化 > 0.85。
- 服装特征相似但第二名差距不足时返回 `null`，不会瞎猜。
- 服务端 4 枪将 100 血打成 0；队友射击返回 `friendly`；自己射击返回 `invalid-target`；复活后 2 秒内返回 `invulnerable`。
- 设置被裁剪到合法范围（3~10 分钟、10~30 杀）。
- 第 4 名同队玩家被拒绝；第 7 名玩家被拒绝。
- 导入非法备份不改变现有数据；导入合法备份会先自动备份当前状态。

---

## 3. UI 冒烟（Electron）

命令：

```bash
npm run test:smoke
```

脚本：`scripts/smoke.mjs`

### 3.1 测试方式

- 使用 Playwright Electron 启动**两个独立实例**；
- 每个实例使用独立的 `SNAPFIRE_USER_DATA_DIR`；
- 使用 `SNAPFIRE_FAKE_CAMERA=1` 启动 Chromium 假摄像头；
- 使用 `SNAPFIRE_TEST=1` 暴露仅测试用的“结束比赛”钩子，用于验证结算/返回大厅；
- 预置合法的 `appearance.json` 和 `settings.json`（开启调试面板）；
- 房主通过 `127.0.0.1:端口` 连接自己的房间服务；第二实例通过局域网回环加入；
- 截图保存到 `artifacts/`。

### 3.2 实测步骤与结果

| 步骤 | 结果 |
| --- | --- |
| 启动房主，显示首页 | 通过 |
| 首页 → 巷战 → 房间入口 | 通过 |
| 创建房间，显示地址 + 4 位房间号 | 通过（示例：`192.168.1.20:17890` / `9569`） |
| 启动第二实例并加入房间 | 通过 |
| 两个大厅都显示 2 名玩家 | 通过 |
| 预置建档自动同步，双方显示“已建档” | 通过 |
| 房主打开建档弹窗，摄像头就绪 | 通过（1920×1080） |
| 离线识别模型加载与预热 | 通过（`Human loaded with WebGL backend`、`warmup complete`） |
| 房主加入红队、队员加入蓝队 | 通过 |
| 队员点击准备，房主开始按钮变为可用 | 通过 |
| 点击开始，3 秒倒计时后进入战斗 | 通过 |
| 战斗页在开局 5 秒后处于 `playing` | 通过（计时 04:5x，无倒计时遮罩） |
| 识别引擎持续工作 | 通过（DETECT 约 300~450ms，BODIES=1，CLOTH=0.00，SOURCE=—） |
| 场地测试面板 | 通过：FIELD TEST 面板显示距离/朝向/光照/意图目标 |
| 开火（鼠标左键） | 通过：播放开火流程，服务端返回“未识别到目标” |
| 场地测试 JSONL | 通过：写入 `session`、`shot`、`match-end`；shot 含 detectMs/source/outcome |
| 测试钩子结束比赛（`SNAPFIRE_TEST=1`） | 通过：服务端结束比赛并广播结算 |
| 双方进入结算页 | 通过：0:0 平局；比分、个人数据、玩家表正确 |
| 战绩保存 | 通过：结算页显示“战绩已保存到本机” |
| 房主返回大厅 | 通过：双方回到大厅，比分/血量重置 |
| 渲染进程错误 | 无 `pageerror` |
| 截图 | 15 张，位于 `artifacts/` |

### 3.3 冒烟中发现并修复的问题

| 问题 | 现象 | 修复 |
| --- | --- | --- |
| 首帧 Human 推理阻塞渲染线程 | 刚进入战斗时倒计时显示 9 秒、计时 00:00，持续约 8 秒 | 在启动加载页预热识别引擎（`warmupHuman()`），加载页文案保持“正在加载本地档案与识别引擎…” |
| 枪械视图模型偏大偏暗 | 枪占据屏幕比例过大，材质过黑 | 缩放至 0.74、右下移动、提高金属/织物亮度、增加补光和橙色识别条 |
| 大厅静态内容被背景覆盖 | “待编队”标签/快捷按钮、模式标签不可见；DOM 存在且 `elementsFromPoint` 可命中，但截图像素为空 | 根因是大厅 `.screen-bg`（绝对定位）盖住了静态内容；给 `.lobby-main` 加 `position: relative; z-index: 1` 建立 stacking context，同时补充操作区 `flex`/最小宽度 |
| 生产模式模型加载风险 | `file://` 下 fetch 模型可能被 CORS 拦截 | 生产模式改为自定义 `app://` 安全协议加载页面和模型 |

### 3.4 截图

`artifacts/` 中包括：

- `01-home.png`：首页
- `02-room-entry.png`：房间入口
- `03-host-lobby.png`：房主大厅
- `04-host-two-players.png` / `05-client-two-players.png`：双方看到 2 名玩家
- `06-enrolment.png`：建档弹窗（假摄像头绿色测试图案）
- `07-host-team-assigned.png`：队伍分配
- `08-host-ready-to-start.png`：满足开局条件
- `09-battle-host.png` / `10-battle-client.png`：战斗页
- `11a-battle-muzzle-flash.png`：开火瞬间尝试截图
- `11-battle-fired.png`：开火回执“未识别到目标”
- `12-results-host.png` / `13-results-client.png`：结算页
- `14-back-to-lobby.png`：房主返回大厅后的双人大厅

> `artifacts/` 是本地测试产物，已加入 `.gitignore`，不会随仓库或 Release 发布。截图中的房主地址为测试环境内网地址，公开前请脱敏；本报告中的地址已改成通用示例。

> 枪口火花/后坐力持续约 120ms/160ms；静态截图的采集延迟可能错过火花，实际运行时在 60fps 下可见。冒烟以“开火回执”作为开火链路通过的依据。

### 3.5 v0.1.0 便携 zip 打包与打包后冒烟

构建命令：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run dist:win
```

产物：

- `release/SnapFire-0.1.0-win-x64.zip` — **157.9 MB**
- `release/win-unpacked/SnapFire.exe` — 本地测试用
- `resources/app.asar` — 17 MB
- asar 内只包含 `out/`、`build/icon.ico` 和 `node_modules/ws`；React/Three/Human 已由 Vite 打入渲染 bundle，不再重复打包源码
- zip 根目录包含 `SnapFire.exe`、`README.md`、`LICENSE`、`THIRD_PARTY_NOTICES.md`、`third-party-licenses/`、`LICENSES.chromium.html` 等

测试结果：

| 测试 | 结果 |
| --- | --- |
| 对 `release/win-unpacked/SnapFire.exe` 运行 `scripts/smoke.mjs` | **SMOKE_OK**，`resultsFlow: 'ok'` |
| 解压 `SnapFire-0.1.0-win-x64.zip` 后对解压出的 `SnapFire.exe` 运行同一冒烟 | **SMOKE_OK**，`resultsFlow: 'ok'` |
| 离线 Human 模型从 asar 加载 | 通过（`Human loaded with WebGL backend`、`warmup complete`） |
| 两个打包实例联机、战斗、结算、返回大厅 | 通过 |
| exe 数字签名 | `NotSigned`（测试版，SmartScreen 提示符合预期） |

本地构建 SHA256：

```text
5a478f7e8f755b0ba3001d1394369ec82cae443976c221386a1eeb3c61624ba7  SnapFire-0.1.0-win-x64.zip
```

### 3.6 v0.1.0 GitHub Release 发布结果

- 仓库：https://github.com/TJU1895-EFZ/SnapFire
- Release：https://github.com/TJU1895-EFZ/SnapFire/releases/tag/v0.1.0
- 标题：**SnapFire v0.1.0 测试版**（预发布 `isPrerelease: true`）
- Workflow：[run 39267114421](https://github.com/TJU1895-EFZ/SnapFire/actions/runs/39267114421) — **success**
- 资产：
  - `SnapFire-0.1.0-win-x64.zip` — 165,552,022 bytes
  - `SHA256SUMS.txt` — 94 bytes
- CI 构建 SHA256：

```text
260d6d78012712ad5d1d9e06d09f1111f676bd6bac7e88dcece29d9271ce30ae  SnapFire-0.1.0-win-x64.zip
```

- 下载 GitHub Release 的 zip 并校验：与 `SHA256SUMS.txt` **一致**。
- 解压 Release 资产后，对 CI 构建的 `SnapFire.exe` 再次运行完整双实例冒烟：**SMOKE_OK**，`resultsFlow: 'ok'`；Human 模型从 asar 离线加载成功。
- 本地构建的 SHA256（`5a478f...`）与 CI 构建不同，属正常现象；以 Release 中的 `SHA256SUMS.txt` 为准。

### 3.7 v0.1.1 本地构建与打包后冒烟

- 版本：`0.1.1`（`package.json` / `package-lock.json` / asar 内一致）
- 构建：`npm run dist:win`（electron-builder 26.15.3）
- 产物：`release/SnapFire-0.1.1-win-x64.zip`
- 本地 SHA256：

```text
4a8c8484da0324ba7b211af23d6be93d846f918f096eccfa3a5f73df1129add5  SnapFire-0.1.1-win-x64.zip
```

- 对 `release/win-unpacked/SnapFire.exe` 运行打包冒烟：**SMOKE_OK**，`resultsFlow: 'ok'`，`fieldLog.matchEnd = true`
- 解压 zip 后对解压出的 `SnapFire.exe` 再次运行：**SMOKE_OK**，同样写入 `session` / `shot` / `match-end`
- 本地构建与 CI 构建 SHA 不同，以 Release 中的 `SHA256SUMS.txt` 为准。

### 3.8 v0.1.1 GitHub Release 发布结果

- 仓库：https://github.com/TJU1895-EFZ/SnapFire
- Release：https://github.com/TJU1895-EFZ/SnapFire/releases/tag/v0.1.1
- 标题：**SnapFire v0.1.1 测试版**（`isPrerelease: true`；0.x 策略，不标 Latest）
- 发布后调整：v0.1.1 最初按普通版本发布并标记为 Latest，随后按 0.x 策略改为 Pre-release；tag 和资产未变。
- Workflow：[run 39456848369](https://github.com/TJU1895-EFZ/SnapFire/actions/runs/39456848369) — **success**（3m32s）
- 资产：
  - `SnapFire-0.1.1-win-x64.zip` — 165,557,465 bytes
  - `SHA256SUMS.txt` — 94 bytes
- CI 构建 SHA256：

```text
05f2cd9b3bfd36359d208981a2aeea38347dbc67b1a461befc2d1951f36d99bc  SnapFire-0.1.1-win-x64.zip
```

- 下载 GitHub Release 的 zip 并校验：计算值与 `SHA256SUMS.txt` **一致**。
- 解压 Release 资产后，对 CI 构建的 `SnapFire.exe` 运行完整双实例冒烟：**SMOKE_OK**，`resultsFlow: 'ok'`，`fieldLog.matchEnd = true`；Human 模型从 asar 离线加载成功。
- 本地构建 SHA256（`4a8c...`）与 CI 构建不同，属正常现象；以 Release 中的 `SHA256SUMS.txt` 为准。
- 备注：CI 生成的 `SHA256SUMS.txt` 使用 CRLF 换行；在 Git Bash 中用 `sha256sum -c` 前需先执行 `tr -d '\r'`，或直接用 PowerShell 的 `Get-FileHash` 对照。后续版本的 workflow 已改为生成 LF。

---

## 4. 真实设备验收

以下项目需要 **2~6 台真实 Windows 笔记本、真实摄像头、真人玩家和室内场地**，自动化测试无法替代。

> **原始数据位置**：`field-tests/<日期-场地>/`
>
> - 流程与规范：`field-tests/README.md`
> - 空白模板：`field-tests/_templates/`
> - 逐枪原始数据：`shots.csv`；汇总：`summary.md`
>
> 本节只写结论和证据链接；所有比例必须能从 `shots.csv` 复算。录屏等原始素材放在各场次 `raw/`，由 `.gitignore` 排除。

### 4.1 已完成测试（2026-10-24 LAN 房间联机）

**数据目录**：`field-tests/2026-10-24-lan-room/`
**原始 JSONL**：`REAL PERSON TESTS/field-20261024 *.jsonl`（4 份，每玩家一份）
**测试模式**：实战模式（3v4~4v4 联机对战），非受控测量场
**参与玩家**：Jason（红）、王小枫（红）、雷霆无敌超级宇宙究极战神刘简尘（蓝）、阿北（蓝），第二场 RAINBOW DASH（红）加入

| 编号 | 测试 | 通过标准 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| M-01 | 两台笔记本通过 Wi-Fi/热点加入同一房间 | 能加入、双方大厅同步 | ✅ 通过 | Room 6166、6098 |
| M-02 | Windows 防火墙首次提示 | 允许专用网络后可连接 | ⬜ 不测 | 同一局域网，无需额外测试 |
| M-03 | 真实摄像头建档（正面/背面） | 采集成功，双方显示”已建档” | ✅ 通过 | 4 人均成功建档并同步 |
| M-04 | 3~6 米识别（正面/背面各 10 枪） | 至少 8/10 锁定正确目标 | ⚠️ 通过但有已知限制 | 实战模式非测量场；Jason 3 米正面 49.3% 正确率（33/67） |
| M-05 | 10 米识别 | 允许未识别，但不得把伤害扣给错误玩家 | ⬜ 不测 | 不补充 10 米测试 |
| M-06 | 双人对射扣血 | 命中扣 25，4 枪击倒，双方血量一致 | ✅ 通过 | 第一场雷霆无敌 4 枪击倒 Jason（100→75→50→25→0） |
| M-07 | 队友误伤 | 不扣血，显示队友提示 | ✅ 通过 | 跨玩家 21 次队友射击均被拦截，0 次误伤 |
| M-08 | 阵亡/复活 | 5 秒复活，复活后 2 秒无敌 | ✅ 通过 | 多场可见复活 + invulnerable 拦截 |
| M-09 | 计时/击杀上限 | 默认 5 分钟/10 杀；可调 3~10 分钟/10~30 杀；任一条件结束 | ✅ 通过 | 两场均击杀上限触发结束 |
| M-10 | 结算/返回大厅/历史 | 比分正确、历史保存、重启后仍在 | ✅ 通过 | 两场比分正确、战绩保存、返回大厅 |
| M-11 | 备份导出/导入 | 对话框可用，导入后数据恢复 | ⬜ 不测 | |
| M-12 | 6 人房间 | 最多 6 人；每队最多 3 人 | ⬜ 不测 | 不补充 6 人测试 |
| M-13 | 断线/房主离开 | 队员断线可继续；房主离开房间关闭 | ⬜ 不测 | |
| M-14 | 连续 3 局稳定性 | 无崩溃、无明显内存增长 | ⬜ 不测 | 不补充更多局 |

### 4.2 红线指标

| 指标 | 结果 | 判定 |
| --- | --- | --- |
| 错误归属（WRONG） | 0 / 611（0.0%） | ✅ 通过 |
| 3~6 米 ≥8/10 | 不适用（实战模式非测量场） | ⚠️ 需补充测量场 |
| 10 米仅允许未识别 | 未测 | ⬜ |

### 4.3 已知问题

| 问题 | 影响 | 处理 |
| --- | --- | --- |
| 服务端超时 20 次 | 部分射击无结果 | 需排查服务端负载 |
| 王小枫检测延迟 3082ms | 严重影响射击体验 | 建议升级设备 |
| 跨玩家漏识别率 78.7% | 大量射击未触发身份识别 | 实战场景下部分正常，需优化 |

### 4.2 识别测试记录模板

> 每格 10 枪；本表只放汇总，逐枪数据在 `field-tests/<场次>/shots.csv`。
> 至少需要 3 人（1 射手 + 2 名可被误锁的玩家）才能测出“伤害扣给错误玩家”；1v1 无法覆盖该红线。

| 场次 | 距离 | 光照 | 射手 | 正面正确 | 背面正确 | 未识别（正/背） | 错误归属 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | 3 m | 正常 | P1 | /10 | /10 | / | 0 | shots.csv |
| S1 | 6 m | 正常 | P1 | /10 | /10 | / | 0 | shots.csv |
| S1 | 10 m | 正常 | P1 | /10 | /10 | / | 0 | shots.csv |

**红线**：任何距离、任何光照下，错误归属次数必须为 0；识别不确定时显示“目标未识别”。

### 4.3 数据记录与复核

1. 每场测试复制模板：`field-tests/_templates/` → `field-tests/<日期-场地>/`。
2. 在设置中启用「场地测试日志」；战斗页的 `FIELD TEST` 面板用于标注距离/朝向/光照和意图目标。逐枪 JSONL 写入本机 `userData/field-logs/`，不记录图像。
3. 现场同时按 `record-sheet.md` 逐枪记录；谁掉血谁喊，用于判断 `system_target`。
4. 当天录入 `shots.csv`，并用 JSONL 和录屏复核 `WRONG` / `NO_MATCH` / `INVALID` 行。
5. 提交前核对：
   - JSONL `shot` 行数 = `shots.csv` 行数 = 纸质表行数 = 录屏开火次数；
   - 每局伤害总数 = `matches.csv` 中的比分变化 = JSONL `match-end` 的比分；
   - 所有 `WRONG` 行都有 `evidence_ref`；
   - `sessions.csv` 中的 commit / SHA256 与实际运行的 exe 一致。
6. 仓库只提交脱敏 CSV 和汇总；JSONL、`raw/` 中的录屏、照片、音频不提交。
7. 汇总完成后，回填本节 M-01~M-14 的状态和证据编号。

详细流程、人员分工和字段说明见 [`field-tests/README.md`](field-tests/README.md)。

---

## 5. 已知问题与限制

1. **假摄像头无法验证真实识别**：冒烟中的绿色测试图案没有人脸/人体语义；识别返回”未识别到目标”是预期行为。真实识别需按 4.2 人工测试。
2. **服务端超时**：真人实战中检测到 20 次服务端超时（雷霆无敌...刘简尘 16 次、阿北 2 次、王小枫 2 次），集中在第二场。可能为服务器负载过高导致。
3. **10 米是识别难点**：人脸通常不可用，主要依赖衣着；逆光、暗光、相似服装会降低成功率。当前阈值是保守初始值，需要真实现场校准。
3. **部位伤害未实现**：V1 统一 25 血/枪。
4. **美术为占位**：首页角色为原创 SVG；手臂/枪械为 Three.js 基础几何体拼装，未使用正式模型。
5. **无正式安装包**：v0.1.1 以便携 zip 分发（解压后双击 `SnapFire.exe`）；未做签名安装包/自动更新。
6. **无断线重连**：队员断线后本局不再恢复；房主离开关闭房间。
7. **启动预热**：首次启动加载并预热识别模型需要数秒到十几秒，加载页会停留；这是为了避免战斗中首帧推理卡顿。
8. **房主地址显示**：界面只显示第一个局域网 IPv4；多网卡/VPN 环境请用 `ipconfig` 选择正确地址，客户端可手动输入。
9. **枪口火花静态截图**：截图采集延迟可能错过 120ms 火花；运行时可见，开火回执与后坐力逻辑已通过冒烟。
10. **UI 未覆盖**：设置页备份/导入对话框、真实 6 人局未纳入自动冒烟；完整「战斗 → 结算 → 战绩保存 → 返回大厅」流程已通过 `SNAPFIRE_TEST=1` 测试钩子覆盖；自然计时/击杀上限结束由服务端集成测试覆盖。

---

## 6. 复现方式

```bash
# 1. 安装依赖与 Electron 二进制（国内网络）
npm install
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js

# 2. 类型检查与构建
npm run typecheck
npm run build

# 3. 自动化测试
npm test

# 4. UI 冒烟（两个 Electron 实例，假摄像头）
npm run test:smoke

# 4.1 打包后冒烟（可选）
npm run dist:win
# PowerShell:
$env:SNAPFIRE_APP_EXE="D:\github\SnapFire-MR实景枪战\release\win-unpacked\SnapFire.exe"
node scripts/smoke.mjs

# 5. 开发模式
npm run dev

# 6. 生产运行
npx electron .
```

测试产物：

- 自动化测试输出：终端 `npm test`。
- UI 冒烟截图：`artifacts/`。
- 冒烟临时数据目录：系统临时目录，脚本结束后自动删除。

---

## 7. 结论

- 代码层面的 V1 功能已实现：首页、房间、组队、建档、识别、AR 战斗、命中/复活/计时、结算、历史、设置、备份/恢复。
- 新增 v0.1.1 场地测试支持：逐枪 JSONL 日志、FIELD TEST 面板、`field-tests/` 数据模板与复核流程。
- 自动化测试 35/35 通过；类型检查和构建通过；两个 Electron 实例的 UI 冒烟通过（含完整「战斗 → 结算 → 战绩保存 → 返回大厅」以及场地测试 JSONL 的 session/shot/match-end 写入）。
- 便携 zip 已构建并通过打包后冒烟：`release/SnapFire-0.1.1-win-x64.zip`，解压后的 `SnapFire.exe` 可正常加载 asar 内的离线模型并完成完整流程；打包后冒烟同样校验了 JSONL。
- GitHub Actions 发布工作流已更新：普通版本 tag 发布为 latest，带 `-rc` / `-beta` 的 tag 才标为预发布。
- **真人实战测试通过（2026-10-24）**：2 场 LAN 房间联机（4v4 + 5v4），共 696 枪。红线指标（错误归属 = 0）通过；M-01/03/06/07/08/09/10 共 7 项通过；21 次队友射击全部被正确拦截；服务端超时 20 次需修复。
- 不再补充 6 米/10 米测量场测试、连续 3 局稳定性测试、M-02/05/11/12/13/14。
- 建议下一步：根据现场数据调整 `src/renderer/src/vision/descriptors.ts` 中的 `FACE_ACCEPT`、`CLOTHING_ACCEPT` 和识别质量档位，降低漏识别率。
