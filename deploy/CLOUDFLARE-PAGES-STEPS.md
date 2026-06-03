# Cloudflare Pages 部署步骤

## 已准备好的文件

- 发布目录：`E:\moni\biprism-sim\deploy\cloudflare-pages`
- 压缩包：`E:\moni\biprism-sim\deploy\cloudflare-pages.zip`

压缩包内已经包含：

- `index.html`

该文件可直接用于 Cloudflare Pages 静态部署。

## 部署方法

### 方法一：直接上传

1. 打开 Cloudflare 控制台
2. 进入 `Workers & Pages`
3. 选择 `Create`
4. 选择 `Pages`
5. 选择 `Upload assets`
6. 上传文件：
   - `E:\moni\biprism-sim\deploy\cloudflare-pages.zip`
   或
   - `E:\moni\biprism-sim\deploy\cloudflare-pages` 文件夹中的 `index.html`
7. 设置项目名称，例如：
   - `biprism-chaoxing-plugin`
8. 确认发布

发布完成后会得到一个地址，形式通常为：

- `https://biprism-chaoxing-plugin.pages.dev`

### 方法二：连接 Git 仓库

如果后续需要频繁更新，建议改用 Git 方式部署。

1. 将 `deploy/cloudflare-pages/index.html` 上传到 GitHub 仓库根目录
2. 在 Cloudflare Pages 中选择 `Connect to Git`
3. 选择该仓库
4. 设置：
   - Framework preset: `None`
   - Build command: 留空
   - Build output directory: `/`
5. 发布

## 发布后的使用方式

拿到公网链接后，可在学习通中添加：

- 网页链接
- H5 链接
- 课程资料链接

建议名称：

- `双棱镜干涉数据分析插件`

## 当前最简操作

如果只追求尽快上线，直接使用：

- `E:\moni\biprism-sim\deploy\cloudflare-pages.zip`

上传后即可生成公网地址。
