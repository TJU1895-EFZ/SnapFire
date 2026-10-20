# SnapFire 发布检查清单

适用版本：`v0.1.1`（便携 zip）

> **历史版本**
>
> v0.1.0 测试版已于 2026-10-19 发布（预发布），保留作历史：
>
> - 仓库：https://github.com/TJU1895-EFZ/SnapFire
> - Release：https://github.com/TJU1895-EFZ/SnapFire/releases/tag/v0.1.0
> - Workflow：[run 39267114421](https://github.com/TJU1895-EFZ/SnapFire/actions/runs/39267114421) — success
> - CI SHA256：`260d6d78012712ad5d1d9e06d09f1111f676bd6bac7e88dcece29d9271ce30ae`
>
> **v0.1.1 已于 2026-10-21 发布（Latest，非预发布）**
>
> - Release：https://github.com/TJU1895-EFZ/SnapFire/releases/tag/v0.1.1
> - Workflow：[run 39456848369](https://github.com/TJU1895-EFZ/SnapFire/actions/runs/39456848369) — success
> - CI SHA256：`05f2cd9b3bfd36359d208981a2aeea38347dbc67b1a461befc2d1951f36d99bc`
> - 详细验证见 `TEST_REPORT.md` §3.7 / §3.8。

## 1. 发布前

- [ ] 确认 `package.json` 与 `package-lock.json` 版本为 `0.1.1`
- [ ] 确认 `release-notes/v0.1.1.md` 已提交
- [ ] 确认 README 的当前版本、下载文件名和校验命令已更新
- [ ] 确认这是 **0.x 测试版**，README 与 Release 说明都写明真实双机/真人验收尚未完成
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

国内网络可用镜像：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run dist:win
```

预期产物：

- `release/SnapFire-0.1.1-win-x64.zip`
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
Get-FileHash .\release\SnapFire-0.1.1-win-x64.zip -Algorithm SHA256
```

## 4. GitHub 上传与 Release

```powershell
cd "D:\github\SnapFire-MR实景枪战"
git add -A
git commit -m "release: v0.1.1"
git push origin main
git tag v0.1.1
git push origin v0.1.1
```

推送 tag 后，`.github/workflows/release.yml` 会：

- 在 `windows-latest` 上安装依赖、类型检查、35 项测试、构建；
- 用 electron-builder 生成 `SnapFire-0.1.1-win-x64.zip`；
- 生成 `SHA256SUMS.txt`；
- 创建 **v0.1.1** 的 GitHub Release，并标记为 **latest**。
- 只有 tag 带后缀（如 `v1.0.0-rc.1`、`v1.0.0-beta.1`）时才创建预发布。

## 5. 发布后检查

- [ ] Release 标题为 `SnapFire v0.1.1`
- [ ] Release 不是预发布，且标记为 Latest
- [ ] 资产包含 `SnapFire-0.1.1-win-x64.zip` + `SHA256SUMS.txt`
- [ ] Release 正文与 `release-notes/v0.1.1.md` 一致
- [ ] 下载 zip 并校验 SHA256
- [ ] 解压 Release zip，对 `SnapFire.exe` 运行完整双实例冒烟
- [ ] 在一台**没有 Node.js** 的 Windows 10/11 电脑上启动，检查摄像头、模型加载、局域网加入、防火墙提示
- [ ] 把 CI run、Release 链接、CI SHA256 记录到 `TEST_REPORT.md`

## 6. 已知风险

- 真实双机/真人现场验收尚未完成；10 米识别、逆光/相似服装下的识别率需要在目标场地验收。
- 未签名 exe 可能触发 SmartScreen。
- 当前无自动更新、无安装包、无代码签名。
- 场地测试日志默认关闭；开启后只写本机，不随备份导出。
