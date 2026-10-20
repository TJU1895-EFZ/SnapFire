# SnapFire V1 开发计划

- 依据文档：`PRD.md` v1.0
- 计划版本：v1.0
- 日期：2026-10-19
- 目标平台：Windows 10/11 笔记本
- 交付目标：可在局域网内完成「创建房间 → 建档 → 3V3 巷战 → 结算 → 本地战绩」的可运行 V1

---

## 0. 当前状态与完成定义

### 0.1 当前状态

工程骨架已建立，核心模块已开始实现，但**尚未形成可运行闭环**（缺少渲染入口、App 状态机、战斗页、设置页、结算页和样式）。

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 工程脚手架 / 依赖 / 离线模型 | ✅ 已完成 | Electron + Vite + React + TS；Human 模型已复制到本地 |
| 共享类型 / WebSocket 协议 | ✅ 已完成 | `src/shared/types.ts` |
| 本地持久化（基础） | ✅ 已完成 | 档案/设置/建档/历史 + 备份/导入/损坏恢复，单元测试通过 |
| 局域网房间与比赛服务 | ✅ 已完成 | `src/main/lanServer.ts`，含房间、队伍、血量、复活、计时、胜负，集成测试通过 |
| 主进程 IPC / 预加载桥 | ✅ 已完成 | 存储、开房、备份/导入、测试用 userData/假摄像头开关 |
| 首页 / 房间入口 / 大厅 / 建档 UI | ✅ 已完成 | 组件与样式已接；双实例 UI 冒烟通过 |
| 识别模块（Human + 衣着特征） | ✅ 已完成（待校准） | 人脸特征 + 衣着描述符 + 匹配；离线模型已打包 |
| AR 视图模型（手臂/枪/枪口火花） | ✅ 已完成（待视觉调优） | `BattleScene.ts`，含后坐力/火光/准心联动 |
| 战斗页 / 开火闭环 | ✅ 已完成（待真机验证） | 摄像头、识别锁定、开火、扣血、复活、HUD |
| 结算页 / 战绩弹窗 / 设置弹窗 | ✅ 已完成 | 含历史保存、返回大厅、备份/恢复/清除 |
| 备份 / 恢复 | ✅ 已完成 | 自动备份、手动导出/导入、恢复前备份；单元测试通过 |
| 全局样式 / 响应式 | ✅ 已完成 | 首页/入口/大厅/建档/战斗/结算/设置/战绩；首页/大厅/建档/战斗截图已检查 |
| 自动化测试 / 验收 | 🟡 进行中 | 35/35 测试通过；双实例 UI 冒烟通过（含场地测试 JSONL）；真实双机/真人识别验收待完成 |
| README / 交付说明 | ✅ 已完成 | README、TEST_REPORT、Apache-2.0 LICENSE、第三方声明、便携 zip、GitHub Actions；已发布 v0.1.1（v0.1.0 为历史预发布） |

### 0.2 完成定义（DoD）

V1 视为完成，必须同时满足：

1. `npm run typecheck` 通过。
2. `npm run build` 通过，`out/` 产物可启动。
3. 两台 Windows 笔记本在同一局域网内可完成一整局 3V3（或 1V1）比赛。
4. 命中扣血、队友误伤、阵亡复活、计时/击杀上限、结算、返回大厅全部可用。
5. 玩家档案、设置、建档、历史战绩关闭/重启后不丢失。
6. 自动备份、手动导出、手动导入、清除数据可用。
7. `PRD.md` 第 6 节的关键验收项全部通过，或在 `TEST_REPORT.md` 中记录为已知限制。
8. 不依赖互联网、登录、云数据库、手机端。

---

## 1. 技术方案与架构

### 1.1 技术栈

| 层 | 选型 | 用途 |
| --- | --- | --- |
| 桌面壳 | Electron 44 | Windows 窗口、摄像头权限、文件对话框、本地数据目录 |
| 构建 | electron-vite 6 + Vite 8 | 主进程/预加载/渲染进程构建 |
| UI | React 19 + TypeScript 5.9 | 页面与状态 |
| 3D/AR | Three.js 0.186 | 手臂、枪械、后坐力、枪口火花 |
| 识别 | `@vladmandic/human` 3.3.6 | 人体姿态、人脸检测、人脸特征 |
| 联机 | `ws` 8 | 房主电脑上的 WebSocket 房间服务 |
| 持久化 | 本地 JSON 文件 | 档案、设置、建档、历史、备份 |
| 样式 | 原生 CSS + CSS 变量 | 深色战术风；Bahnschrift/微软雅黑 |

### 1.2 进程与模块

```
┌────────────────────────── 房主电脑 ──────────────────────────┐
│ Electron 主进程                                               │
│  ├─ BrowserWindow / 摄像头权限 / 文件对话框                    │
│  ├─ Storage：本地 JSON + 备份                                  │
│  └─ LanServer：房间状态 + 比赛规则（唯一权威）                  │
│         ▲ WebSocket (ws://127.0.0.1:端口)                      │
│         │                                                      │
│  渲染进程（房主）── 摄像头 / Human 识别 / Three.js / UI         │
└───────────────────────────────────────────────────────────────┘
                    ▲ 局域网 WebSocket
                    │
┌───────────────────┴───────────────────────────────────────────┐
│ 其他玩家电脑：Electron 渲染进程 + 同样的识别/AR/UI              │
│ 各自本地保存档案、设置、建档、历史                              │
└───────────────────────────────────────────────────────────────┘
```

设计要点：

- **服务端权威**：血量、比分、复活、比赛阶段、计时、胜负全部由房主主进程的 `LanServer` 决定，避免各客户端各算一套。
- **识别在客户端**：每台电脑用自己的摄像头识别目标；识别结果只上报“打中的是谁”，服务端校验后扣血。
- **不传视频**：局域网只同步昵称、队伍、识别特征、血量、比分、命中事件，不传摄像头画面。
- **本地优先**：所有玩家数据存本机；房间状态只在内存中存在，应用重启/房主离开则房间结束。
- **时钟基准**：服务端在每次房间状态中附带 `serverNow`，客户端用它换算倒计时、复活和比赛结束时间，避免电脑时钟不一致。

### 1.3 关键数据流

1. 房主点击“创建房间” → 主进程启动 `LanServer`，生成 4 位房间号和 `hostToken`。
2. 房主渲染进程连接 `ws://127.0.0.1:端口`，携带 `hostToken` 加入。
3. 其他玩家连接 `ws://房主IP:端口`，携带房间号加入。
4. 每位玩家在本地采集人脸/衣着 → 发送 `set-appearance` → 服务端广播 `gallery` 给所有人。
5. 点击开始 → 服务端进入 3 秒倒计时 → 进入 `playing`。
6. 玩家开火 → 本地 `VisionEngine` 分析准心附近画面 → 得到目标 `playerId` → 发送 `shot`。
7. 服务端校验（阶段、存活、敌我、无敌、射速）→ 扣血/击杀 → 广播 `damage`/`room`。
8. 时间到或达到击杀上限 → 服务端生成 `MatchResult` → 客户端保存历史 → 结算页。
9. 房主返回大厅 → 服务端重置比分/血量/击杀 → 可开下一局。

---

## 2. 工程结构与文件状态

```
SnapFire/
├─ package.json                         ✅ 依赖与脚本
├─ electron.vite.config.ts              ✅ 主/预加载/渲染构建配置
├─ tsconfig*.json                       ✅ TypeScript 配置
├─ PRD.md                               ✅ 产品需求
├─ DEV_PLAN.md                          ✅ 本文件
├─ README.md                            ⬜ 运行与联机说明
├─ TEST_REPORT.md                       ⬜ 验收记录
├─ src/
│  ├─ shared/
│  │  └─ types.ts                       ✅ 共享类型、协议、常量
│  ├─ main/
│  │  ├─ index.ts                       🟡 窗口/IPC/权限；备份 IPC 与测试开关待补
│  │  ├─ storage.ts                     🟡 基础读写；备份/损坏提示待补
│  │  └─ lanServer.ts                   ✅ 房间与比赛权威服务
│  ├─ preload/
│  │  └─ index.ts                       🟡 基础 API；备份 API 待补
│  └─ renderer/
│     ├─ index.html                     ✅ 入口页面 + CSP
│     ├─ public/models/                 ✅ Human 离线模型
│     └─ src/
│        ├─ main.tsx                    ⬜ React 入口
│        ├─ App.tsx                     ⬜ 应用状态机 / 网络接线
│        ├─ env.d.ts                    ✅ window.snapfire 类型
│        ├─ types.ts                    ✅ RoomSession / Toast
│        ├─ net/NetClient.ts            ✅ WebSocket 客户端
│        ├─ hooks/useCamera.ts          ✅ 摄像头
│        ├─ hooks/useServerClock.ts     ✅ 服务端时钟
│        ├─ vision/human.ts             ✅ Human 加载/串行检测
│        ├─ vision/descriptors.ts       ✅ 衣着/人脸匹配
│        ├─ vision/engine.ts            ✅ 准心区域连续识别
│        ├─ vision/enrollment.ts        ✅ 建档采集
│        ├─ game/audio.ts               ✅ 程序化音效
│        ├─ game/BattleScene.ts         ✅ 3D 手臂/枪/火花
│        ├─ components/OperatorArt.tsx  ✅ 首页角色
│        ├─ components/Icons.tsx        ✅ 图标
│        ├─ screens/HomeScreen.tsx      ✅ 首页
│        ├─ screens/RoomEntryScreen.tsx ✅ 房间入口
│        ├─ screens/LobbyScreen.tsx     ✅ 大厅
│        ├─ screens/EnrollmentModal.tsx ✅ 建档弹窗
│        ├─ screens/BattleScreen.tsx    ⬜ 战斗页
│        ├─ screens/ResultsScreen.tsx   ⬜ 结算页
│        ├─ screens/SettingsModal.tsx   ⬜ 设置/备份
│        ├─ screens/HistoryModal.tsx    ⬜ 战绩
│        ├─ styles/global.css           ⬜ 全局样式
│        ├─ styles/home.css             ⬜ 首页样式
│        ├─ styles/screens.css          ⬜ 入口/大厅/弹窗样式
│        ├─ styles/battle.css           ⬜ 战斗样式
│        └─ utils/*.ts                  ✅ 格式化、剪贴板
```

---

## 3. 里程碑总览

| 里程碑 | 目标 | 依赖 | 状态 |
| --- | --- | --- | --- |
| M0 | 工程脚手架、依赖、离线模型 | — | ✅ |
| M1 | 共享协议 + 房间/比赛服务 | M0 | ✅ |
| M2 | 本地持久化 | M0 | 🟡 |
| M3 | 识别与人脸/衣着建档 | M0 | ✅（待校准） |
| M4 | 首页/入口/大厅/建档 UI | M3 | ✅ |
| M5 | AR 视图模型 | M0 | ✅ |
| M6 | 战斗页 + 开火/扣血闭环 | M1/M3/M5 | ✅（UI 冒烟通过；真实双机命中待验收） |
| M7 | 结算/战绩/设置 | M6 | ✅ |
| M8 | 备份/恢复 | M2 | ✅ |
| M9 | 全局样式与响应式 | M4/M6/M7 | ✅ |
| M10 | 自动化 + 手工验收 | 全部 | 🟡（自动化与 UI 冒烟通过；真实双机/真人识别待验收） |
| M11 | README 与交付 | M10 | ✅（已发布 v0.1.1；v0.1.0 为历史预发布） |

### 进度更新（2026-10-19）

| 阶段 | 已完成 | 待验证 / 未完成 |
| --- | --- | --- |
| Phase A 可运行入口 | A1-A6：`main.tsx`、`App.tsx`、样式、测试开关、类型检查、Electron 启动 | 无 |
| Phase B 联机房间 | B1-B6：创建/加入、网络事件、建档同步、大厅操作、离开、双实例冒烟 | 真实局域网多机验收 |
| Phase C 战斗闭环 | C1-C7：战斗页、摄像头、AR、识别、开火、结算事件、HUD、清理；开火回执冒烟通过 | C8：真实摄像头/双机对射命中验证 |
| Phase D 结算/战绩 | D1-D5：结算页、历史保存、战绩弹窗、返回大厅；结算页 SSR 测试 + UI 冒烟中的「结束比赛 → 结算 → 保存战绩 → 返回大厅」通过 | 自然计时/击杀上限结束的实机验证 |
| Phase E 设置/备份 | E1-E6：备份类型、存储备份、IPC、预加载、设置页、损坏提示；存储/备份测试通过 | 备份导出/导入对话框手工验收 |
| Phase F 视觉样式 | F1-F5：全局/首页/子页/战斗/结算样式；首页、入口、大厅、建档、战斗、结算截图已检查 | 1366×768/全屏尺寸复核 |
| Phase G 测试 | G1：`typecheck` + `build` 通过；G2/G3：35/35 测试通过；UI 冒烟通过（含场地测试 JSONL） | G4：双笔记本手工验收；G5：目标硬件性能观察 |
| Phase H 交付 | `README.md`、`TEST_REPORT.md`、生产构建、应用图标、`start-snapfire.cmd`、Apache-2.0 `LICENSE`、`THIRD_PARTY_NOTICES.md`、第三方许可证、便携 zip、electron-builder 配置、GitHub Actions 发布工作流、Release 说明与检查清单；**v0.1.1 已发布** | 真实设备验收签字 |

**已执行的验证命令与结果**

- `npm run typecheck`：通过（主进程 + 渲染进程）。
- `npm run build`：通过；`out/renderer/models/` 包含 6 个离线模型文件。
- `npm test`：**6 个测试文件、35 项测试全部通过**（识别匹配、地址解析、存储/备份、房间服务对战规则、结算页渲染、场地测试 JSONL）。
- `npm run test:smoke`：**通过**（两个 Electron 实例、假摄像头、独立 userData；首页 → 房间入口 → 房主大厅 → 第二客户端加入 → 建档同步 → 选队 → 准备 → 开始 → 战斗页 → 开火回执“未识别到目标” → 测试钩子结束比赛 → 结算页 → 战绩保存 → 返回大厅）。
- 冒烟中发现并修复：首帧 Human 推理阻塞 8 秒导致倒计时冻结 → 启动页预热；枪械偏大偏暗 → 缩放/补光/材质；`file://` 模型加载风险 → `app://` 协议；大厅 `.screen-bg` 覆盖静态内容导致“待编队”/模式标签不可见 → `.lobby-main` stacking context；结算表头被裁切 → 内边距修复。
- 真实摄像头、双人识别、10 米命中、6 人实机、备份对话框仍需按 `TEST_REPORT.md` 第 4 节人工验收。

**打包与发布（2026-10-19）**

- `npm run dist:win`：生成 `release/SnapFire-0.1.0-win-x64.zip`（**157.9 MB**）和 `release/win-unpacked/`。
- `resources/app.asar` 为 17 MB，仅包含 `out/`、`build/icon.ico` 和 `node_modules/ws`；React/Three/Human 已打入渲染 bundle，不再重复打包源码。
- zip 根目录包含 `SnapFire.exe`、`README.md`、`LICENSE`、`THIRD_PARTY_NOTICES.md`、`third-party-licenses/`、`LICENSES.chromium.html` 等。
- **打包后冒烟通过**：对 `release/win-unpacked/SnapFire.exe` 和解压后的 `SnapFire.exe` 分别运行 `scripts/smoke.mjs`，均返回 `SMOKE_OK` / `resultsFlow: 'ok'`；Human 模型从 asar 离线加载成功。
- 本地 SHA256：`5a478f7e8f755b0ba3001d1394369ec82cae443976c221386a1eeb3c61624ba7`（CI 会重新生成 `SHA256SUMS.txt`）。
- exe 为 `NotSigned`（v0.1.0 测试版；SmartScreen 提示符合预期）。
- `.github/workflows/release.yml`、`release-notes/v0.1.0.md`、`RELEASE_CHECKLIST.md` 已随仓库提交。
- **GitHub Release 已发布**：
  - 仓库：https://github.com/TJU1895-EFZ/SnapFire
  - Release：https://github.com/TJU1895-EFZ/SnapFire/releases/tag/v0.1.0
  - 标题：SnapFire v0.1.0 测试版（pre-release）
  - Actions：[run 39267114421](https://github.com/TJU1895-EFZ/SnapFire/actions/runs/39267114421) — success
  - 资产：`SnapFire-0.1.0-win-x64.zip`（165,552,022 bytes）+ `SHA256SUMS.txt`
  - CI SHA256：`260d6d78012712ad5d1d9e06d09f1111f676bd6bac7e88dcece29d9271ce30ae`
  - 下载 Release zip 校验一致；解压后对 CI 构建的 `SnapFire.exe` 完整冒烟通过。
- 本次发布执行了 Git 初始化、提交、`main` 推送、`v0.1.0` tag 推送（使用已授权的 GitHub CLI 账号）。

> **当前剩余事项**：
> 真实硬件/真人现场验收（G4/G5：真实双机局域网、真人建档/识别、10 米红线、6 人实机、备份对话框、目标笔记本性能），按 `TEST_REPORT.md` 第 4 节执行。

---

## 4. 可直接执行的开发阶段

> 执行原则：每个 Phase 结束后必须能通过该阶段的“验证”再进入下一阶段。任何阶段发现协议/数据模型需要调整，先改 `src/shared/types.ts`，再同步主进程与渲染端。

### Phase A：让应用先跑起来（P0）

目标：启动后能看到首页，页面间可跳转，数据能从主进程读出。

- [ ] **A1. 创建 `src/renderer/src/main.tsx`**
  - 引入 ReactDOM、`App`、四个 CSS 文件。
  - 不使用 `React.StrictMode`（避免摄像头/网络 effect 双执行）。
- [ ] **A2. 创建 `src/renderer/src/App.tsx`（骨架）**
  - 启动时并行加载 `profile`、`settings`、`appearance`、`history`、`appInfo`。
  - 加载完成前显示品牌加载页（SnapFire 标识 + 进度提示）。
  - 实现 `screen` 状态：`home | entry | lobby | battle | results`。
  - 实现 toast：`{ message, tone }`，3 秒自动消失。
  - 接入 `HomeScreen`、`RoomEntryScreen`、`LobbyScreen`（后两者先传占位回调）。
  - 实现昵称保存：更新 `profile` + `window.snapfire.storage.saveProfile`。
  - 启动后调用 `preloadHuman()` 预加载识别模型。
  - 若 `window.snapfire` 缺失，显示“请通过 SnapFire 桌面应用启动”的错误页。
- [ ] **A3. 创建最小 `styles/global.css`**
  - CSS 变量、reset、字体、背景、按钮基础样式，先保证可读可点。
- [ ] **A4. 主进程测试开关**
  - 在 `app.whenReady()` 前读取 `SNAPFIRE_USER_DATA_DIR`，调用 `app.setPath('userData', ...)`，用于同一台电脑启动第二个实例做联机测试。
  - `SNAPFIRE_FAKE_CAMERA=1` 时追加 Chromium 开关 `use-fake-device-for-media-stream` / `use-fake-ui-for-media-stream`，用于无摄像头环境下验证 UI/AR。
- [ ] **A5. 类型检查**
  - 运行 `npm run typecheck`。
  - 若 Human 的 `.d.ts` 报 `@tensorflow/*` 类型缺失：安装 `@tensorflow/tfjs` 作为 `devDependency`（仅类型用途），或添加最小类型声明。
  - 修复所有 TS 错误。
- [ ] **A6. 启动验证**
  - 运行 `npm run dev`。
  - 预期：应用窗口打开，显示首页；点击“团战”进入房间入口；返回首页正常；控制台无致命错误。

**Phase A 验收**：`npm run dev` 可启动 → 首页可见 → 首页/房间入口可互相跳转。

---

### Phase B：房间联机闭环（P0）

目标：两台电脑（或两个实例）能创建/加入同一房间，队伍、准备、建档状态、房主设置实时同步；房主可开始比赛（先切到占位战斗页）。

- [ ] **B1. 在 `App.tsx` 实现 `createRoom()`**
  - `const info = await window.snapfire.host.start()`。
  - 创建 `NetClient`，连接 `ws://127.0.0.1:${info.port}`。
  - `join` 参数：`roomCode`、`profile.id`、`profile.name`、`hostToken`。
  - 保存 `hostInfo` 和展示地址：`lanIps[0] ?? '127.0.0.1'` + `:` + `port`。
  - 失败时调用 `host.stop()`，回到入口页并显示错误。
- [ ] **B2. 实现 `joinRoom(address, roomCode)`**
  - 使用 `normalizeHostAddress()` 规范化地址。
  - 创建 `NetClient` 连接；失败时关闭连接、显示服务端错误。
- [ ] **B3. 实现网络事件处理器**
  - `welcome`：建立 `RoomSession`，进入大厅。
  - `room`：更新 `session.room`；根据 phase 切换 `battle` / `results` / `lobby`。
  - `gallery`：更新 `session.gallery`。
  - `match-start`：更新房间，进入战斗页。
  - `match-end`：保存历史、进入结算页（历史保存可先在 Phase D 完成）。
  - `error`：toast。
  - `socket-closed`：非主动退出时提示并回到入口/首页；房主同时调用 `host.stop()`。
- [ ] **B4. 本地建档自动同步**
  - 收到 `welcome` 后，若本机已有 `appearance`，发送 `set-appearance`（去掉 `thumbnail`）。
  - 保证重新加入房间后无需重新建档。
- [ ] **B5. 大厅操作接线**
  - `set-team`、`set-ready`、`update-settings`、`start-match`、`leave`。
  - 离开房间：发送 `leave` → 关闭 WebSocket → 房主调用 `host.stop()` → 清空 session → 回首页。
- [ ] **B6. 双实例联机验证**
  - 终端 1：`npm run dev`。
  - 终端 2：`SNAPFIRE_USER_DATA_DIR=<临时目录> npm run dev`（或使用构建后的第二个实例）。
  - 预期：第二实例加入后，双方玩家列表一致；选队/准备/设置实时更新；满足条件后房主可开始。

**Phase B 验收**：两个客户端成功加入同一房间；队伍人数上限 3 生效；非房主不能开始/改设置；开始后双方都进入战斗页（占位页即可）。

---

### Phase C：战斗页与命中闭环（P0，最高风险）

目标：真实摄像头画面 + AR 手臂/枪 + 准心；开火 → 识别 → 服务端扣血；阵亡/复活/计时/比分完整。

- [ ] **C1. `BattleScreen.tsx` 基础结构**
  - 全屏 `<video>`（摄像头）+ 透明 `<canvas>`（Three.js）+ HUD 层。
  - 使用 `useCamera({ autoStart: true, deviceId: settings.cameraDeviceId })`。
  - 摄像头启动中显示加载提示；失败显示错误、重试、离开。
  - 显示 3 秒倒计时（从 `room.countdownEndsAt` + `serverNow` 计算）。
- [ ] **C2. 接入 `BattleScene`**
  - 视频就绪后创建 `new BattleScene(canvas)`，调用 `start()`。
  - 监听 `resize`（窗口/全屏变化）调用 `scene.resize()`。
  - 卸载时 `scene.dispose()`。
- [ ] **C3. 接入 `VisionEngine`**
  - 创建实例，调用 `setSession(session.gallery, session.selfId)`、`setQuality(settings.detectionQuality)`。
  - 视频就绪后 `start(video)`；gallery 更新时重新 `setSession`。
  - 订阅识别结果：
    - `match` 存在 → 准心显示对方昵称/队伍颜色；`scene.setLock('enemy' | 'teammate')`。
    - 有人但未匹配 → `scene.setLock('unknown')`，显示“目标未识别”。
    - 无人 → `scene.setLock('none')`。
  - 卸载时 `stop()`。
- [ ] **C4. 开火流程**
  - 输入：`mousedown`（主键）或 `keydown` 空格；忽略输入框焦点。
  - 前置检查：`room.phase === 'playing'`、自己 `alive`、距上次开火 ≥ 250ms、没有正在解析的射击。
  - 立即执行：`scene.fire()`、`audio.gunshot()`、后坐力/火花。
  - `const result = await vision.analyzeNow()`。
  - `const targetId = result?.match?.playerId ?? null`。
  - 发送 `{ type: 'shot', targetId }`。
  - 识别期间禁止再次开火；识别完成后再解除。
  - 若本局已结束/自己阵亡，取消发送。
- [ ] **C5. 处理射击结果与受击**
  - `shot-result`：
    - `hit=true` → 准心命中标记 + `audio.hit()`；若 `killed` 播放 `audio.kill()`。
    - `reason='friendly'` → 蓝色“队友 · 未造成伤害” + `audio.friendly()`。
    - `reason='no-target'` → “目标未识别” + `audio.miss()`。
    - `reason='invulnerable'/'target-dead'` → 对应提示。
  - `damage`：若 `targetId === selfId`，红色受击闪烁 + `audio.damage()`。
  - `respawn`：若 `playerId === selfId`，播放 `audio.respawn()`。
- [ ] **C6. HUD**
  - 顶部：比分（红/蓝）、剩余时间（用 `serverNow` 换算）。
  - 左下：自己的血量条。
  - 右上：击杀信息（最近 6 条）。
  - 中心：准心（none 白色 / enemy 红色 / teammate 蓝色 / unknown 琥珀色）。
  - 阵亡遮罩：显示“阵亡”和复活倒计时；期间禁止开火。
  - 调试面板（`settings.showDebug`）：识别耗时、bodyCount、匹配分数、来源（face/clothing）、画布尺寸。
- [ ] **C7. 清理**
  - 卸载时：停止摄像头、停止识别、销毁 Three.js、取消网络监听、取消键盘监听。
  - 比赛结束由 App 切到结算页，确保不残留后台识别循环。
- [ ] **C8. 单机/双机验证**
  - 用真实摄像头 + 一名对手（或假摄像头 + 模拟目标）验证：开火有火光/后坐力；命中扣 25 血；4 枪阵亡；5 秒复活；队友不扣血。

**Phase C 验收**：完整一局 1V1 可打完；血量/比分/时间在双方一致；识别不确定时不扣任何人的血。

---

### Phase D：结算、战绩与返回大厅（P1）

- [ ] **D1. `ResultsScreen.tsx`**
  - 胜方横幅（红/蓝/平局）、最终比分。
  - 本局设置：时长、击杀上限。
  - 玩家表：昵称、队伍、击杀、死亡、命中率。
  - 房主“返回大厅”；非房主显示“等待房主”。
  - “离开房间”。
- [ ] **D2. 保存历史**
  - 收到 `match-end` 后调用 `window.snapfire.storage.addHistory(result)`。
  - 用 `savedMatchIdsRef` 去重；`addHistory` 内部也按 `matchId` 去重。
  - 更新 App 的 `history` 状态，首页统计立即刷新。
- [ ] **D3. `HistoryModal.tsx`**
  - 展示最近 50 场；显示日期、比分、胜负、个人 K/D/命中率。
  - “清空战绩”二次确认，调用 `clearHistory`。
- [ ] **D4. 返回大厅**
  - 房主发送 `return-lobby`；服务端重置比分/血量/击杀/准备状态。
  - 所有客户端收到 phase=`lobby` 后回到大厅。
- [ ] **D5. 验证**
  - 打完一局 → 结算数据与服务端一致 → 重启应用 → 战绩仍在 → 房主返回大厅 → 可再开一局。

---

### Phase E：设置、备份与恢复（P1）

- [ ] **E1. 扩展共享类型**
  - 新增：
    ```ts
    interface BackupPayload {
      formatVersion: 1
      createdAt: number
      profile: ProfileData
      settings: AppSettings
      appearance: AppearanceData | null
      history: HistoryData
    }
    interface BackupResult {
      ok: boolean
      canceled?: boolean
      path?: string
      error?: string
    }
    ```
  - `SnapFireApi` 增加 `backup.export/import`、`storage.consumeWarnings`。
- [ ] **E2. 改造 `Storage`**
  - 构造函数支持传入目录（便于测试）。
  - `readJson`：区分“文件不存在”和“JSON 损坏”；损坏时重命名为 `*.corrupt-<时间戳>`，记录 warning。
  - `consumeWarnings(): string[]`。
  - `createBackup(): BackupPayload`。
  - `exportBackupTo(path)`：写入格式化 JSON。
  - `importBackup(payload)`：校验 → 生成恢复前备份 → 覆盖四个文件 → 清空内存缓存。
  - `writeAutoBackup()`：写入 `data/backups/snapfire-backup-YYYYMMDD-HHmmss.json`，只保留最近 10 份。
  - 应用启动时、每局 `addHistory` 后自动调用 `writeAutoBackup()`。
- [ ] **E3. 主进程 IPC**
  - `backup:export`：`dialog.showSaveDialog` → `storage.exportBackupTo`。
  - `backup:import`：`dialog.showOpenDialog` → 读取 → `storage.importBackup`。
  - `storage:consume-warnings`。
- [ ] **E4. 预加载桥接**
  - 暴露上述 API，保持 `contextIsolation: true`。
- [ ] **E5. `SettingsModal.tsx`**
  - 音量滑块、识别质量三档、摄像头设备下拉（`listCameras()`）。
  - 显示版本、数据目录、实际摄像头分辨率。
  - 导出备份、导入备份、清除本地数据（二次确认）。
  - 导入/清除后调用 App 的 `reloadLocalData()`；若在房间中，先离开房间。
- [ ] **E6. 损坏提示**
  - App 启动时调用 `consumeWarnings()`；有内容则 toast 提示“部分本地数据已损坏，已使用默认值”。

**Phase E 验收**：对应 `PRD.md` 6.3 全部通过。

---

### Phase F：视觉样式与响应式（P1）

- [ ] **F1. `styles/global.css`**
  - CSS 变量：背景/面板/文字/琥珀/红队/蓝队/成功/错误。
  - reset、字体、滚动条、按钮、输入框、通用面板、toast。
- [ ] **F2. `styles/home.css`**
  - 三栏布局（左 280px / 中自适应 / 右 320px）。
  - 顶部栏、玩家卡片、侧边导航、中央角色舞台、模式卡片、右侧总览。
  - 在 1280×720 下不横向溢出；侧栏可滚动。
- [ ] **F3. `styles/screens.css`**
  - 房间入口、大厅两队布局、VS 标记、设置滑块、检查清单。
  - 建档弹窗：摄像头预览、引导线、采集按钮、缩略图列表。
  - 设置/战绩弹窗。
- [ ] **F4. `styles/battle.css`**
  - 视频全屏 `object-fit: cover`；画布透明覆盖。
  - 准心、血量、比分、计时、击杀信息、阵亡遮罩、倒计时。
  - `cursor: none`；窗口缩放不错位。
- [ ] **F5. 视觉验收**
  - 1920×1080、1366×768、全屏三种尺寸截图检查。
  - 首页中央角色完整；枪/手臂位于底部；准心在屏幕中心。

---

### Phase G：测试与验收（P0）

- [ ] **G1. 类型与构建**
  - `npm run typecheck` 通过。
  - `npm run build` 通过。
  - 检查 `out/renderer/models/` 存在 6 个模型文件。
- [ ] **G2. 单元测试（建议 Vitest）**
  - 衣着特征：同色相近 > 异色；同一描述符相似度接近 1。
  - `matchIdentity`：正确身份得分最高；低于阈值返回 null；自己不在候选。
  - 服务端设置裁剪：时长 3~10、击杀 10~30。
  - 备份校验：合法/非法 payload。
- [ ] **G3. 服务端集成测试**
  - 用 `ws` 客户端直连 `LanServer`：
    - 2 人加入 → 选队 → 设置假 appearance → ready → start。
    - 发送 shot → 验证 HP 100→75→50→25→0。
    - 验证阵亡、5 秒复活、无敌 2 秒。
    - 验证队友射击不扣血。
    - 验证达到击杀上限或时间结束时 `match-end`。
  - 为便于测试，`LanServer.start()` 支持可选起始端口；测试用随机高位端口。
- [ ] **G4. 手工联机验收**
  - 按 `PRD.md` 6.4~6.10 逐项执行，记录到 `TEST_REPORT.md`。
  - 至少 2 台 Windows 笔记本真机；有条件时补 6 人。
- [ ] **G5. 性能观察**
  - 战斗 5 分钟观察 CPU/GPU 占用、识别耗时、界面是否卡死。
  - 若“均衡”档卡顿，降低 `VisionEngine` 频率或画布宽度；保留“性能”档。

---

### Phase H：交付（P2）

- [ ] **H1. `README.md`**
  - 环境要求、安装、启动、构建。
  - 如何开房/加入、防火墙设置、摄像头权限。
  - 数据目录、备份/恢复、常见问题。
  - 已知限制（10 米识别、衣着相似、V1 无安装包）。
- [ ] **H2. 版本与图标**
  - `package.json` 版本、应用名、窗口标题统一为 SnapFire。
  - V1 可用默认图标；正式图标后续替换。
- [ ] **H3. 构建产物**
  - `npm run build` 后确认 `out/main`、`out/preload`、`out/renderer` 完整。
  - 如需分发给非开发人员，再补 electron-builder 安装包（PRD 不强制）。
- [ ] **H4. 验收签字**
  - `TEST_REPORT.md` 记录：日期、设备、参与者、通过项、失败项、已知问题。

---

## 5. 关键实现约定

### 5.1 WebSocket 消息

客户端 → 服务端：

| 消息 | 关键字段 | 说明 |
| --- | --- | --- |
| `join` | roomCode, playerId, name, hostToken? | 加入房间；房主带 token |
| `set-name` | name | 大厅改昵称 |
| `set-team` | team | red/blue；每队最多 3 人 |
| `set-ready` | ready | 非房主准备 |
| `set-appearance` | appearance | 人脸/衣着特征；服务端剥离缩略图 |
| `update-settings` | settings | 仅房主；服务端裁剪范围 |
| `start-match` | — | 仅房主；服务端校验条件 |
| `shot` | targetId \| null | 本地识别结果；null=未识别 |
| `return-lobby` | — | 仅房主，结算后 |
| `leave` | — | 主动离开 |
| `ping` | t | 心跳 |

服务端 → 客户端：

| 消息 | 说明 |
| --- | --- |
| `welcome` | selfId、isHost、room、gallery |
| `room` | 房间/比赛状态；含 `serverNow` |
| `gallery` | 所有已建档玩家的特征 |
| `shot-result` | 命中/未命中及原因 |
| `damage` | 谁打中谁、伤害、剩余血量、是否击杀 |
| `respawn` | 某玩家复活 |
| `match-start` | 倒计时开始 |
| `match-end` | 最终结果 |
| `error` | 面向用户的错误 |
| `pong` | 心跳响应 |

### 5.2 命中 / 伤害 / 复活

- 伤害固定：`DAMAGE_PER_HIT = 25`，满血 100，4 枪击倒。
- 服务端校验顺序：阶段 → 存活 → 射速（120ms）→ 目标存在 → 非自己 → 敌方 → 目标存活 → 非无敌。
- 阵亡：`alive=false`、`respawnAt=now+5000`、击杀者 +1、比分 +1、写击杀信息。
- 复活：5 秒后 `hp=100`、`alive=true`、`invulnerableUntil=now+2000`。
- 队友：不扣血，返回 `reason='friendly'`。
- 识别不确定：客户端发送 `targetId=null`，服务端只计射击数，不扣血。
- 比赛结束：时间到或某队比分 ≥ 击杀上限；胜方为比分高者，相同为平局。

### 5.3 识别与匹配

- 识别区域：屏幕中心裁切（默认 62% 宽、80% 高），保证目标在准心附近。
- 人体：MoveNet Lightning，单帧最多 1 人；选取包含准心或离准心最近的人体框。
- 人脸：BlazeFace 检测 + `faceres` 特征；人脸框宽度 < 24px 时不参与匹配。
- 衣着：躯干区域 HSV 直方图 + 3×3 网格颜色 + 宽高比；支持正面/背面多视角。
- 匹配：
  - 人脸相似度阈值 `0.55`；衣着相似度阈值 `0.70`；领先第二名的最小差距 0.05~0.07。
  - 人脸可用时加权融合；不可用时只用衣着。
  - 低于阈值或分差不足 → 返回 `null`（显示“目标未识别”）。
  - 永远排除自己。
- 调参入口：`src/renderer/src/vision/descriptors.ts` 顶部的常量。
- 质量档位：`performance`（340ms / 0.54）、`balanced`（200ms / 0.62）、`accurate`（130ms / 0.70）。

### 5.4 备份文件格式

```json
{
  "formatVersion": 1,
  "createdAt": 1760000000000,
  "profile": { "id": "...", "name": "...", "createdAt": 0, "updatedAt": 0 },
  "settings": {
    "volume": 0.8,
    "detectionQuality": "balanced",
    "cameraDeviceId": null,
    "showDebug": false
  },
  "appearance": {
    "version": 1,
    "faceEmbeddings": [],
    "clothing": [],
    "updatedAt": 0,
    "thumbnail": "..."
  },
  "history": { "matches": [] }
}
```

- 备份位置：`data/backups/snapfire-backup-YYYYMMDD-HHmmss.json`，最多 10 份。
- 手动导出扩展名：`.snapfire-backup.json`。
- 导入前必须校验 `formatVersion === 1` 及核心字段类型。
- 导入前自动生成“恢复前备份”。

### 5.5 错误处理清单

- 摄像头：权限拒绝、无设备、被占用、分辨率不支持 → 中文提示 + 重试。
- 网络：地址格式、超时（10 秒）、房间号错误、房间已满、比赛已开始、房主离开 → 对应提示。
- 识别：模型加载失败 → 建档/战斗页提示；绑定失败 → 允许继续但提示识别能力下降。
- 数据：JSON 损坏 → 重命名 + 默认值 + 启动提示。
- 备份：文件无效/版本不符 → 拒绝导入，不修改现有数据。
- 未捕获异常：主进程记录日志；渲染端显示可返回的错误页。

---

## 6. 测试计划

### 6.1 自动化

| 类型 | 范围 | 工具 |
| --- | --- | --- |
| 单元测试 | 衣着相似度、身份匹配、设置裁剪、备份校验 | Vitest |
| 集成测试 | LanServer 加入/选队/开始/射击/扣血/复活/结束 | Vitest + ws |
| 构建检查 | typecheck + build + 模型文件存在 | npm scripts |
| UI 冒烟 | 首页/入口/大厅渲染、无致命 console error | 手工或 Playwright Electron |

### 6.2 手工联机

设备：至少 2 台 Windows 笔记本，同一 Wi-Fi/热点。
步骤：

1. A 创建房间，记录地址与房间号。
2. B 加入；确认双方昵称、队伍、建档状态同步。
3. 双方完成建档；房主开始。
4. 验证倒计时、摄像头、AR 枪、准心。
5. 双方对射；记录命中/扣血/阵亡/复活/比分。
6. 验证误伤、无敌、未识别。
7. 打满一局；验证结算、历史、返回大厅。
8. 重启应用；验证档案/设置/建档/战绩仍在。
9. 导出备份 → 修改数据 → 导入恢复 → 验证恢复成功。
10. 记录到 `TEST_REPORT.md`。

### 6.3 PRD 验收映射

| PRD 章节 | 验收内容 | 计划阶段 |
| --- | --- | --- |
| 6.1 启动与首页 | 启动、首页布局、模式入口 | A + F |
| 6.2 本地数据 | 档案/设置/建档/历史持久化 | M2 + E |
| 6.3 备份与恢复 | 自动/手动备份、导入、清除 | E |
| 6.4 创建/加入房间 | 6 人上限、3V3、队伍/准备/开始条件 | B |
| 6.5 建档与识别 | 采集、同步、识别正确性、10 米规则 | M3 + C + G4 |
| 6.6 战斗画面 | 摄像头、AR、准心、火花、HUD | C + F |
| 6.7 命中与伤害 | 25 血、误伤、无敌、同步 | C + G |
| 6.8 比赛规则 | 3~10 分钟、10~30 杀、复活、结算 | M1 + C + D |
| 6.9 联机与异常 | 断线、房主离开、重启 | B + G4 |
| 6.10 稳定性与性能 | 6 人、3 局、无卡死 | G5 |
| 6.11 非目标检查 | 野战/登录/手机/部位伤害等不存在 | G4 |

---

## 7. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 10 米处人脸过小 | 人脸不可用，识别率下降 | 以衣着为主；允许“未识别”；禁止错误归属；建议玩家增强衣着区分度 |
| 衣着相似 | 误匹配 | 建档时提示；阈值+领先分差；不确定返回 null |
| Human 模型/类型兼容 | 构建失败或运行报错 | 先跑 typecheck；必要时补 `@tensorflow/tfjs` 类型；离线模型缺失时检查路径 |
| WebGL 性能 | 识别卡顿 | 三档质量；中心裁切；限制画布宽度；必要时降低频率 |
| 多人同屏 | MoveNet 单人体 | 只分析准心中心裁切；目标选离准心最近者；不做全屏多人追踪 |
| 电脑时钟不一致 | 倒计时/复活错乱 | 服务端下发 `serverNow`，客户端换算 |
| 摄像头权限/占用 | 无法进入战斗 | 中文错误提示 + 重试 + 设置中切换设备 |
| Windows 防火墙 | 其他电脑连不上 | README 说明允许专用网络；连接失败提示检查防火墙 |
| 备份/恢复误操作 | 数据丢失 | 导入前自动备份；校验失败不改数据 |
| 识别错误扣血 | 影响公平性 | 服务端只接受客户端上报的目标 ID，但客户端匹配必须保守；验收明确“不得扣错人” |

---

## 8. 交付物

1. 源代码（本仓库）。
2. `PRD.md`、`DEV_PLAN.md`、`TEST_REPORT.md`。
3. `README.md`：问题定位、功能、安装、使用、输入/输出示例、排查。
4. `LICENSE`（Apache-2.0）、`THIRD_PARTY_NOTICES.md`、`third-party-licenses/`。
5. `release/SnapFire-0.1.0-win-x64.zip` + `release/SHA256SUMS.txt`（本地便携包）。
6. `electron-builder.yml`、`.github/workflows/release.yml`、`release-notes/v0.1.0.md`、`RELEASE_CHECKLIST.md`。
7. v0.1.0 不提供传统安装包/自动更新；以 GitHub Release 便携 zip 分发。

---

## 9. 建议执行顺序（压缩版）

```
A1 → A2 → A3 → A4 → A5 → A6
   → B1 → B2 → B3 → B4 → B5 → B6
   → C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8
   → D1 → D2 → D3 → D4 → D5
   → E1 → E2 → E3 → E4 → E5 → E6
   → F1 → F2 → F3 → F4 → F5
   → G1 → G2 → G3 → G4 → G5
   → H1 → H2 → H3 → H4
```

**关键路径**：A → B → C → G4。C（战斗页 + 识别 + 命中）是风险最高、工作量最大的阶段，应优先保证闭环可用，再做视觉 polish。
