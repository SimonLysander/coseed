# 全局设计系统样板

样板与正式前端共用 `src/web/design-system/` 的 Token、明暗主题和 Provider，只提供阅读和视觉样例，不连接业务接口。

```bash
npm run design:build
npm run design:preview
npm run test:design
```

样板地址 `http://127.0.0.1:4177/`，阅读样例 `http://127.0.0.1:4177/?view=reading`。固定系统字体和松针绿，支持浅色、深色、跟随系统。字体和绿色候选已移除；不再维护第二套主题定义。

样板显示偏好保存在 `coseed-design-preview:appearance`，正式前端使用 `coseed:appearance`，互不覆盖。两者的首帧初始化由相同构建插件生成。额外字体仅为英文字标 Patrick Hand Latin，来源及 OFL 位于 `src/web/design-system/fonts/`，构建时携带许可。

构建产物和对比度计算结果位于被 Git 忽略的 `.coseed/design-system-preview/`；颜色配对计算不代表完整无障碍认证。节点和连线只演示排版，未运行 ELK，也不代表真实业务图已实现。浏览器测试使用 4178，不占用样板的 4177。
