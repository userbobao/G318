# G318 路书地图 GitHub Pages 发布步骤

这个目录已经按 GitHub Pages 的 `/docs` 发布方式打包。

## 1. 发布前填写高德 JSAPI 配置

编辑：

```text
docs/amap-jsapi/config.local.js
```

填写你的 Web 端 JSAPI Key：

```javascript
window.G318_AMAP_CONFIG = {
  AMAP_JSAPI_KEY: "你的 Web 端 JSAPI Key",
  AMAP_SECURITY_JS_CODE: "你的 JSAPI 安全密钥",
  DATA_URL: "../data/roadbook-map.final.json"
};
```

注意：GitHub Pages 是静态公开站点，这个文件会被别人看到。不要填写高德 Web 服务 Key，也不要上传其它私密配置。长期公开使用时，建议改成后端代理或 serviceHost 方案。

## 2. 在高德控制台配置域名白名单

如果你的 GitHub Pages 地址是：

```text
https://your-name.github.io/g318-roadbook/
```

就在高德 Web 端 JSAPI Key 的安全设置里加入：

```text
your-name.github.io
```

如果绑定了自定义域名，也要把自定义域名加入白名单。

## 3. 提交到 GitHub

如果这是一个新仓库：

```powershell
git init
git add docs
git commit -m "Deploy G318 roadbook map"
git branch -M main
git remote add origin https://github.com/你的用户名/仓库名.git
git push -u origin main
```

如果仓库已经存在：

```powershell
git add docs
git commit -m "Deploy G318 roadbook map"
git push
```

## 4. 开启 GitHub Pages

进入 GitHub 仓库：

1. 打开 Settings
2. 左侧进入 Pages
3. Source 选择 Deploy from a branch
4. Branch 选择 main
5. Folder 选择 /docs
6. 点击 Save

几分钟后访问：

```text
https://你的用户名.github.io/仓库名/
```

## 5. 验证

打开下面两个地址，确认都能访问：

```text
https://你的用户名.github.io/仓库名/
https://你的用户名.github.io/仓库名/data/roadbook-map.final.json
```

如果网页能打开但地图不显示，优先检查高德 Key、JSAPI 安全密钥和域名白名单。
