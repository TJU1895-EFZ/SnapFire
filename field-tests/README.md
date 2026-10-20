# SnapFire 实地测试数据

本目录保存真人 / 真机验收的原始数据与汇总，服务于 `TEST_REPORT.md` 第 4 节和 1.0 发布门槛。

> 原则：**一行一枪**。没有逐枪数据的“测试通过”不能作为发布证据。

## 目录结构

```text
field-tests/
  README.md                 # 本文件：流程与规范
  _templates/               # 空白模板，不要直接往里填
    README.md               # 单场测试的元信息模板
    record-sheet.md         # 现场纸质记录表（可打印）
    devices.csv
    players.csv
    sessions.csv
    shots.csv
    matches.csv
    summary.md
  2026-11-08-venue-a/       # 一场测试 = 一个目录
    README.md
    record-sheet.md         # 打印出来的那份可以不放这里
    devices.csv
    players.csv
    sessions.csv
    shots.csv
    matches.csv
    summary.md
    raw/                    # 录屏、照片、扫描件；已被 .gitignore 忽略
```

## 开始一场测试

1. 复制模板目录（PowerShell）：

   ```powershell
   Copy-Item -Recurse field-tests\_templates field-tests\2026-11-08-venue-a
   ```

   Git Bash：

   ```bash
   cp -r field-tests/_templates field-tests/2026-11-08-venue-a
   ```

2. 填写场次 `README.md`：日期、场地、设备、参与者代号、同意书、应用版本 / commit / 构建 SHA256。
3. 填写 `devices.csv` 和 `players.csv`。
4. 打印 `record-sheet.md`，每个“距离 × 朝向”组合一张。
5. 测量场逐枪录入 `shots.csv`；对战场只录 `matches.csv`。
6. 当天计算指标，写入 `summary.md`，并更新 `TEST_REPORT.md` 第 4 节的 M 项状态。
7. 提交 CSV、`README.md`、`summary.md` 和脱敏截图；`raw/` 不提交。

## 自动日志（推荐）

设置 → **场地测试日志** → 启用逐枪日志。进入战斗后会出现 `FIELD TEST` 面板：

- **距离 / 朝向 / 光照**：每轮开始前点一次，之后每枪自动带上；
- **意图目标**：点击玩家，或按数字键 `1`~`6`；按 `0` 清除；
- 未标注意图的枪会记为 `UNLABELED`，不计入正确率；
- 每枪结束后面板显示 `#序号 结果`，用于当场核对。

日志写入 `%APPDATA%\SnapFire\field-logs\field-YYYYMMDD.jsonl`（以设置页显示的目录为准）。每行一个 JSON 对象：

| 类型 | 内容 |
| --- | --- |
| `session` | 应用版本、平台、房间号、是否房主、本机玩家、全部玩家、识别质量、摄像头分辨率 |
| `shot` | 距离/朝向/光照、意图目标、识别结果（id/name/team/confidence/source/faceScore/clothingScore）、DETECT/BODIES/CANVAS/CAMERA、服务端结果（hit/killed/targetId/hp/reason）、outcome、recognitionCorrect、damageToWrongPlayer、latencyMs |
| `analyze-error` | 识别失败或引擎未就绪 |
| `match-end` | 比分和完整 `MatchResult` |

字段含义：

- `recognized = null` 表示没有锁定到任何人；此时 `debug.source` 是 `descriptor-only` 或 `none`；
- `outcome` 采用上文的结果枚举；服务端拒绝的枪（目标无敌/已阵亡）仍可能记为 `CORRECT`，以 `recognitionCorrect` 和 `server.reason` 为准；
- `damageToWrongPlayer = true` 才是红线违规；单独的 `WRONG` 表示锁错人但未必造成伤害；
- 日志按天切分，跨天测试会生成两个文件。

**隐私**：JSONL 含玩家昵称和识别分数，只保存在本机，不会随备份导出。不要直接把 JSONL 提交到仓库；用它核对并生成 `shots.csv` 后，只提交脱敏后的 CSV。

## 人员分工（5~6 人）

| 场次 | 人员 | 目的 | 记录位置 |
| --- | --- | --- | --- |
| 测量场 | 1 射手 + 2~3 目标 + 1 记录员 | 3 / 6 / 10 米正反面识别率、错误归属 | `shots.csv` |
| 对战场 | 6 人 3v3 | 联机、扣血、复活、结算、稳定性 | `matches.csv` |
| 异常场 | 2~3 人 | 断线、房主退出、备份导入 | `sessions.csv` + 备注 |

测量场和对战场必须分开，不能一边打 3v3 一边统计逐枪识别率。

如果所有人都是玩家，测量场轮换一人做记录员；对战场由房主开录屏、赛后按局记录，不要求逐枪。

## 测量场协议

开火前：

- 画面中只能有预期目标一个人，其他人站到摄像头视野外。
- 记录员确认调试面板 `BODIES = 1`；不是 1 就暂停、清场、重来。

每一枪：

1. 记录员报：“`S1-014`，6 米，正面，目标 `P3`，开火。”
2. 射手瞄准 `P3`，按一次开火。
3. **谁掉血谁喊**：“`P3` 掉 25” / “没人掉血” / “队友提示”。
4. 记录员据此填写 `shots.csv` 的一行。
5. 等 ≥1.5 秒；若目标被击倒，等 5 秒复活 + 2 秒无敌结束再打下一枪。

测试单要提前排好顺序（每个目标 10 枪，随机交错），射手只按口令开火，不能自己挑目标。

## 结果枚举

`outcome` 只能取以下值：

| 值 | 含义 | 计入正确率 |
| --- | --- | --- |
| `CORRECT` | 锁定预期目标并命中 | 是 |
| `WRONG` | 伤害落到非预期玩家身上 | 是，且为红线违规 |
| `NO_MATCH` | 显示“未识别到目标” | 是 |
| `FRIENDLY` | 锁定队友 | 是 |
| `SELF` | 锁定自己 | 是（应为 0） |
| `INVALID` | 目标阵亡、无敌、非战斗阶段，服务端拒绝 | 否，单独统计 |
| `ERROR` | 应用或网络错误 | 否，单独统计 |

`WRONG` 一旦出现，当场暂停排查原因，不要继续测。

## 各表说明

### `devices.csv`

| 列 | 说明 |
| --- | --- |
| `device_id` | `D1`、`D2`…… |
| `role` | `host` / `client` |
| `model` / `cpu` / `gpu` / `ram_gb` / `os` | 设备信息 |
| `camera_res` / `camera_name` | 摄像头分辨率与名称 |
| `power_mode` | 电源模式（平衡 / 高性能） |
| `notes` | 外接显示器、USB 摄像头等 |

### `players.csv`

只写代号，不写真实姓名。`similar_to` 用于标记相似衣着（如 `P2,P3`）。

### `sessions.csv`

一场测试（或一场比赛）一行。必须记录 `app_version`、`commit`、`artifact_sha256`，保证数据可复现。

### `shots.csv`（核心表）

必填列：

```text
shot_id, session_id, shot_seq, timestamp, distance_m, orientation, lighting,
shooter, intended_target, intended_team, system_target, system_team,
outcome, server_reason, hit, killed, target_hp_before, target_hp_after,
evidence_ref, notes
```

可选列（有日志或录屏时填）：

```text
confidence, source, face_score, clothing_score, detect_ms, bodies
```

示例：

```csv
S1-014,S1,14,2026-11-08T14:12:07+08:00,6,front,normal,P1,P3,B,P3,B,CORRECT,hit,true,false,100,75,video:S1-00:12:07,
```

- `orientation`：`front` / `back`
- `lighting`：`normal` / `dim` / `backlit`
- `system_target`：谁实际掉血；没人掉血则留空
- `server_reason`：保留原文，如 `no-target` / `friendly` / `invulnerable` / `target-dead`
- `evidence_ref`：录屏时间点或截图文件名

### `matches.csv`

对战场按局记录：结束原因、双方比分、房主/队员各自看到的比分、是否同步、是否崩溃、内存起止值。

### `summary.md`

按“距离 × 朝向 × 光照”汇总：

```text
正确锁定率 = CORRECT / (CORRECT + WRONG + NO_MATCH + FRIENDLY + SELF)
错误归属率 = WRONG / 总有效枪数        # 红线：必须为 0
漏识别率   = NO_MATCH / 总有效枪数
检测耗时   = detect_ms 的 p50 / p95
```

`INVALID` 和 `ERROR` 不计入分母，但要在 summary 中列出数量与原因。

## 当天复核

提交前做五项核对：

1. 启用过自动日志时，JSONL 中 `shot` 行数 = 纸质表行数 = 录屏中的开火次数；
2. `shots.csv` 行数与 JSONL / 纸质表一致，`shotSeq` 能一一对应；
3. 每局伤害总数 = `matches.csv` 中的比分变化 = JSONL `match-end` 的比分；
4. 所有 `WRONG` 行都有 `evidence_ref`；
5. `sessions.csv` 的 commit / SHA256 与实际运行的 exe 一致。

不满足就不要提交结论，先补齐证据。

## 隐私与提交规则

- 参与人签简短同意书：数据用途、仅本地保存、仓库只放匿名数据、可要求删除。
- 仓库中只出现 `P1`、`P2` 等代号，不写真实姓名。
- 不提交人脸照片、带人脸的录屏、原始音频。
- `raw/` 已被 `.gitignore` 忽略；报告确认后删除本地原始视频。
- CSV 使用 UTF-8 编码；用 Excel 保存时选择“CSV UTF-8”，避免中文乱码。

## 与发布报告的关系

- `TEST_REPORT.md` 第 4 节只写结论和证据链接；
- 原始逐枪数据以本目录的 `shots.csv` 为准；
- 汇总数字必须能从 `shots.csv` 复算，不能只存在于报告文字里。
