# vendor 文件夹说明

本文件夹用于存放 3D 引擎文件 **Three.js（r128 版本）**。项目代码不包含该文件，需要联网下载一次，之后即可完全离线使用。

## 下载地址

- 官方 npm 镜像（推荐）：
  https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js
- 备用：
  https://unpkg.com/three@0.128.0/build/three.min.js

## 放置方式

1. 点击上方任一链接，将文件保存下来（文件名即 `three.min.js`，约 600 KB）。
2. 把 `three.min.js` 放入本文件夹（与本说明文件同级），最终路径为：

```
vendor/three.min.js
```

3. 重新打开（或刷新）项目根目录的 `index.html` 即可。

## 注意事项

- 必须是 **r128（0.128.0）版本** 的 `three.min.js`（UMD 构建产物），不要下载成 ES Module 版本（如 `three.module.js`）。
- 文件名保持 `three.min.js` 不变，否则页面会显示"未找到 3D 引擎文件"的降级提示。
- 未放置该文件时，页面仍可运行：2D 结构示意图、数值面板、排布探究、数据表与讨论模块不受影响，仅 3D 画面不可用（页面会给出明确的降级提示与放置指引）。
