# SnapFire 发布检查清单

适用版本：`v1.2.0`（便携 zip）

> v1.2.0 正在发布；以下历史版本记录保留。
>
> **历史版本**
>
> v0.1.0 测试版已于 2026-10-19 发布（预发布），保留作历史：
>
> - 仓库：https://github.com/TJU1895-EFZ/SnapFire
> - Release：https://github.com/TJU1895-EFZ/SnapFire/releases/tag/v0.1.0
> - Workflow：[run 39267114421](https://github.com/TJU1895-EFZ/SnapFire/actions/runs/39267114421) — success
> - CI SHA256：`260d6d78012712ad5d1d9e06d09f1111f676bd6bac7e88dcece29d9271ce30ae`
>
> v0.1.1 已于 2026-10-21 发布（Pre-release，0.x 测试版）：
>
> - Release：https://github.com/TJU1895-EFZ/SnapFire/releases/tag/v0.1.1
> - Workflow：[run 39456848369](https://github.com/TJU1895-EFZ/SnapFire/actions/runs/39456848369) — success
> - CI SHA256：`05f2cd9b3bfd36359d208981a2aeea38347dbc67b1a461befc2d1951f36d99bc`
> - 详细验证见 `TEST_REPORT.md` §3.7 / §3.8。
>
> **v1.0.0 已于 2026-10-24 发布（正式版本，latest）**
>
> - Release：https://github.com/TJU1895-EFZ/SnapFire/releases/tag/v1.0.0
> - Workflow：[run 40074274452](https://github.com/TJU1895-EFZ/SnapFire/actions/runs/40074274452) — success
> - 真人实战 2 场通过（红线 0 错误归属）。
> - 详细验证见 `TEST_REPORT.md` §4。

## 1. 发布前

- [x] 确认 `package.json` 与 `package-lock.json` 版本为 `1.2.0`（桌面端与手机端）
- [x] 确认 `release-notes/v1.2.0.md` 已提交
- [x] 确认 README 的当前版本、下载文件名和校验命令已更新
- [x] 确认 v1.2.0 新增玩法尚未做真人现场验收，Release 说明已注明
- [ ] 确认 `%APPDATA%\SnapFire\data` 中没有需要清理的本机数据
- [ ] 确认没有把 `artifacts/`、`node_modules/`、`out/`、`release/` 加入提交

## 2. 本地构建与测试

```powershell
cd "D:\github\SnapFire-MR实景枪战"
npm ci
npm run typecheck
npm test
npm run build
npm run test:smoke
npm run dist:win
```

可选：本次发布包含手机客户端时，先构建并验证内嵌手机服务：

```powershell
cd ..\SnapFire-Mobile
npm ci
npm run build
cd ..\SnapFire-MR实景枪战
npm run prepare:mobile
npm run smoke:mobile
```

`dist:win` 会自动尝试复制同级的 `SnapFire-Mobile/dist`；如果不存在，则打出一个
仅桌面版的包（大厅会提示手机服务未启动）。需要强制包含手机端时，先运行
`npm run prepare:mobile`（缺少构建会直接失败）。

国内网络可用镜像：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run dist:win
```

预期产物：

- `release/SnapFire-1.2.0-win-x64.zip`
- `release/win-unpacked/SnapFire.exe`（用于测试）

## 3. 验证便携包

1. 检查 zip 内是否包含：
   - `SnapFire.exe`
   - `resources/app.asar`
   - `LICENSE`
   - `THIRD_PARTY_NOTICES.md`
   - `third-party-licenses/`
   - `README.md`
2. 对解压后的 `SnapFire.exe` 运行打包冒烟：

```powershell
$env:SNAPFIRE_APP_EXE="D:\github\SnapFire-MR实景枪战\release\win-unpacked\SnapFire.exe"
node scripts/smoke.mjs
```

预期：`SMOKE_OK`，包含 `resultsFlow: 'ok'`，且 `fieldLog.matchEnd` 为 `true`。

3. 生成并记录 SHA256：

```powershell
Get-FileHash .\release\SnapFire-1.2.0-win-x64.zip -Algorithm SHA256
```

## 4. GitHub 上传与 Release

```powershell
cd "D:\github\SnapFire-MR实景枪战"
git add -A
git commit -m "release: v1.2.0"
git push origin main
git tag v1.2.0
git push origin v1.2.0
```

推送 tag 后，`.github/workflows/release.yml` 会：

- 在 `windows-latest` 上安装依赖、类型检查、71 项测试、构建；
- 用 electron-builder 生成 `SnapFire-1.2.0-win-x64.zip`；
- 生成 `SHA256SUMS.txt`；
- 创建 **v1.2.0** 的 GitHub Release，并标记为 **latest**（非 pre-release）。
- 0.x 版本和带后缀的 tag（如 `v1.1.0-rc.1`、`v1.2.0-beta.1`）都创建预发布；`v1.0.0` 及以后才标记为 latest。

## 5. 发布后检查

- [ ] Release 标题为 `SnapFire v1.2.0`
- [ ] Release 标记为 latest（非 pre-release）
- [ ] 资产包含 `SnapFire-1.2.0-win-x64.zip` + `SHA256SUMS.txt`
- [ ] Release 正文与 `release-notes/v1.2.0.md` 一致
- [ ] 下载 zip 并校验 SHA256
- [ ] 解压 Release zip，对 `SnapFire.exe` 运行完整双实例冒烟
- [ ] 在一台**没有 Node.js** 的 Windows 10/11 电脑上启动，检查摄像头、模型加载、局域网加入、防火墙提示
- [x] 把 CI run、Release 链接、CI SHA256 记录到 `TEST_REPORT.md`

## 6. 已知风险

- 真实双机/真人现场验收已完成（2026-10-24 LAN 房间实战 2 场，红线 0 错误归属）；10 米识别、逆光/相似服装下的识别率仍需后续补充测试。
- 未签名 exe 可能触发 SmartScreen。
- 当前无自动更新、无安装包、无代码签名。
- 场地测试日志默认关闭；开启后只写本机，不随备份导出。
