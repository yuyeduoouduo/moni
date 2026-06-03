# 学习通部署说明

这个数据分析插件最稳妥、免费的上线方式是：

1. 先把 `chaoxing-plugin.html` 免费部署到公网
2. 再在学习通课程里添加“网页链接”

这样不需要改学习通后台，也不需要买服务器。

## 现成文件

- 学习通插件版：`chaoxing-plugin.html`
- 可直接发布版本：`dist/chaoxing-plugin.html`

## 推荐方案

### 方案 A：Cloudflare Pages

优点：

- 免费
- 国内访问通常比很多海外静态托管更稳
- 适合这种纯 HTML / CSS / JS 单文件页面

操作：

1. 注册 GitHub 和 Cloudflare 账号
2. 新建一个 GitHub 仓库，比如 `biprism-plugin`
3. 把 `dist/chaoxing-plugin.html` 改名为 `index.html`
4. 上传到 GitHub 仓库根目录
5. 登录 Cloudflare，进入 `Workers & Pages`
6. 选择 `Create application`
7. 选择 `Pages`
8. 选择 `Connect to Git`
9. 连接刚才的 GitHub 仓库
10. 构建设置里：
    - Framework preset 选 `None`
    - Build command 留空
    - Build output directory 留空或 `/`
11. 部署完成后会得到一个网址，例如：
    - `https://biprism-plugin.pages.dev`

适合当前项目的原因：

- 我们这个页面是纯静态文件，不需要后端
- 后续只要改 HTML，再推送一次就能自动更新

### 方案 B：GitHub Pages

优点：

- 完全免费
- 配置也简单

操作：

1. 新建 GitHub 仓库
2. 把 `dist/chaoxing-plugin.html` 改名为 `index.html`
3. 上传到仓库根目录
4. 打开 GitHub 仓库 `Settings`
5. 进入 `Pages`
6. Source 选：
    - `Deploy from a branch`
7. Branch 选：
    - `main`
    - `/root`
8. 保存后等待几分钟
9. 会得到一个网址，例如：
    - `https://你的用户名.github.io/biprism-plugin/`

## 放进学习通

教师端通常可以在课程页面的“资料”或“章节”里添加“网页链接”。

把你部署后得到的网址填进去即可。

建议标题写：

- `双棱镜干涉数据分析插件`

建议说明写：

- `用于实验数据录入、Δx 拟合、d 自动计算和波长计算`

## 最省事的实际选择

如果你只是想尽快能用：

- 首选 `Cloudflare Pages`

如果你已经有 GitHub 账号，且想最简单：

- 选 `GitHub Pages`

## 当前建议

你现在已经有一个适合上线的文件：

- `E:\moni\biprism-sim\dist\chaoxing-plugin.html`

下一步实际只需要做一件事：

- 把它当作 `index.html` 上传到免费静态托管平台

## 我下一步可以继续帮你做的事

1. 帮你把这个项目整理成 GitHub Pages 可直接上传的结构
2. 帮你做 Cloudflare Pages 版本的最简发布目录
3. 帮你把页面再压缩成更像学习通手机内嵌卡片的小组件样式
