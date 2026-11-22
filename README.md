# 寻见 iOS 自签工程

把 `app/` 的网页壳打包成 iOS App，通过 GitHub Actions 在 macOS 上编译成**未签名 IPA**，
再用 Sideloadly / AltStore 以免费 Apple ID 签名装到 iPhone（7 天有效期，需重签）。

## 目录

- `www/`　网页资源（已精简：8 首小体积音频，data/home 与备份已剔除）
- `capacitor.config.json`　appId `com.xunjian.app`，appName「寻见」
- `.github/workflows/ios.yml`　macOS 构建 → 产出 `xunjian-unsigned.ipa`
- 已执行：`npm install`、`npx cap add ios`、`npx cap sync ios`（本机 Windows 只能生成工程，不能编译）

## 一次性准备（Windows）

1. 装 Sideloadly：https://sideloadly.io （Windows 版）
2. 装 iTunes（Sideloadly 需要它的驱动识别设备）
3. 准备一个能登录的 Apple ID（免费即可）

## 构建 IPA（GitHub Actions）

1. 新建一个**公开**仓库，把本目录全部上传（网页端可直接拖拽，>100 文件建议用 GitHub Desktop）
2. 进入 Actions → `build-ios-ipa` → Run workflow
3. 约 6–10 分钟，下载 Artifact `xunjian-ipa`，解压得到 `xunjian-unsigned.ipa`

## 签名安装（Sideloadly）

1. iPhone 用数据线连电脑，信任此电脑
2. Sideloadly 选择 `xunjian-unsigned.ipa`，Apple ID 填你的账号
3. 点 Start → 输入 Apple ID 密码 → 等待完成
4. iPhone：设置 → 通用 → VPN与设备管理 → 信任该开发者描述文件
5. 首次打开若提示不受信任，重复第 4 步

## 7 天期限

免费 Apple ID 签名有效期 **7 天**，到期 App 打不开。
Sideloadly 里勾选「Enable auto-refresh」，或到时重签一次（同一个 IPA、同一个 Apple ID 即可，数据不丢）。

## 已知限制

- 后台音频：Capacitor 壳仍是 WebView，锁屏停播（要真正后台播放需原生 AVPlayer 改造）
- 音频：IPA 内只带 8 首（5.6 MB），敬拜页只有这 8 首；要更多需改用在线播放或加大包体
- 中国区 App Store 不可上架（需《互联网宗教信息服务许可证》，个人不能申领），故走自签
