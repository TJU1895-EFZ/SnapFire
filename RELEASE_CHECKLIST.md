# SnapFire 发布检查清单

适用版本：`v0.1.0` 测试版（便携 zip）

> **v0.1.0 测试版已于 2026-10-19 发布。** 以下步骤保留用于后续版本。
>
> - 仓库：https://github.com/TJU1895-EFZ/SnapFire
> - Release：https://github.com/TJU1895-EFZ/SnapFire/releases/tag/v0.1.0
> - Workflow：[run 39267114421](https://github.com/TJU1895-EFZ/SnapFire/actions/runs/39267114421) — success
> - CI SHA256：`260d6d78012712ad5d1d9e06d09f1111f676bd6bac7e88dcece29d9271ce30ae`
> - 下载 Release zip 校验一致；解压后对 CI 构建的 `SnapFire.exe` 完整冒烟通过。

## 1. 发布前

- [ ] 确认这是 **测试版**，Release 标注 `v0.1.0 测试版`
- [ ] 完成或明确接受“真实双机/真人识别验收未完成”的风险
- [ ] 确认 `%APPDATA%\SnapFire\data` 中没有需要清理的本机数据
- [ ] 确认没有把 `artifacts/` 截图、`node_modules/`、`out/` 加入提交

## 2. 本地构建与测试

```powershell
cd "D:\github\SnapFire-MR实景枪战"
npm ci
npm run typecheck
npm test
npm run build
npm run dist:win
```

预期产物：

- `release/SnapFire-0.1.0-win-x64.zip`
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

预期：`SMOKE_OK`，并包含 `resultsFlow: 'ok'`。

3. 生成并记录 SHA256：

```powershell
Get-FileHash .\release\SnapFire-0.1.0-win-x64.zip -Algorithm SHA256
```

## 4. GitHub 上传与 Release

> 需要你提供仓库地址或先创建仓库；以下命令由你执行。

```powershell
cd "D:\github\SnapFire-MR实景枪战"
git init
git add .
git commit -m "SnapFire v0.1.0 test release"
git branch -M main
git remote add origin https://github.com/<你的账号>/<仓库名>.git
git push -u origin main

git tag v0.1.0
git push origin v0.1.0
```

推送 tag 后，`.github/workflows/release.yml` 会：

- 在 `windows-latest` 上安装依赖、类型检查、35 项测试、构建；
- 用 electron-builder 生成 `SnapFire-0.1.0-win-x64.zip`；
- 生成 `SHA256SUMS.txt`；
- 创建或更新 **v0.1.0 测试版** 的 GitHub Release（`--prerelease`）。

## 5. 发布后检查

- [ ] Release 标题为 `SnapFire v0.1.0 测试版`
- [ ] 资产包含 zip + `SHA256SUMS.txt`
- [ ] Release 正文与 `release-notes/v0.1.0.md` 一致
- [ ] 在一台**没有 Node.js** 的 Windows 10/11 电脑上下载 zip，解压并启动
- [ ] 检查摄像头、识别模型加载、局域网加入、防火墙提示
- [ ] 记录已知问题，必要时发布测试反馈收集说明

## 6. 已知风险

- 10 米识别、逆光/相似服装下的识别率需要在真实场地验收。
- 未签名 exe 可能触发 SmartScreen。
- 当前无自动更新、无安装包、无代码签名。
