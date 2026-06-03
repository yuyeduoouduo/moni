# GitHub Pages 部署步骤

## 已准备好的文件

- 发布目录：`E:\moni\biprism-sim\deploy\github-pages`
- 压缩包：`E:\moni\biprism-sim\deploy\github-pages.zip`

目录中包含：

- `index.html`
- `.nojekyll`

## 为什么使用 `.nojekyll`

GitHub Pages 默认可能会经过 Jekyll 处理。

本项目是纯静态页面，添加 `.nojekyll` 可以避免不必要的处理，直接按静态文件发布。

## 方式一：网页上传到 GitHub

### 1. 新建仓库

1. 打开 GitHub
2. 选择 `New repository`
3. 仓库名称建议填写：
   - `biprism-chaoxing-plugin`
4. 建议选择：
   - `Public`
5. 创建仓库

### 2. 上传文件

根据 GitHub 官方文档，可以通过仓库页面的 `Add file` > `Upload files` 上传文件。

上传以下两个文件：

- `E:\moni\biprism-sim\deploy\github-pages\index.html`
- `E:\moni\biprism-sim\deploy\github-pages\.nojekyll`

也可以先解压：

- `E:\moni\biprism-sim\deploy\github-pages.zip`

然后把里面文件拖进去。

### 3. 提交更改

填写一次提交说明，例如：

- `Deploy Chaoxing plugin page`

然后提交到 `main` 分支。

### 4. 开启 GitHub Pages

1. 进入仓库 `Settings`
2. 打开 `Pages`
3. 在 `Build and deployment` 中设置：
   - `Source`: `Deploy from a branch`
   - `Branch`: `main`
   - `Folder`: `/ (root)`
4. 保存

## 发布地址

如果仓库名为：

- `biprism-chaoxing-plugin`

并且 GitHub 用户名为：

- `yourname`

则地址通常为：

- `https://yourname.github.io/biprism-chaoxing-plugin/`

## 放进学习通

将上面的 GitHub Pages 地址添加到学习通中的：

- 网页链接
- 课程资料链接
- H5 链接

建议名称：

- `双棱镜干涉数据分析插件`

## 当前最简操作

如果采用网页上传方式，实际只需要：

1. 新建 GitHub 仓库
2. 上传 `index.html` 和 `.nojekyll`
3. 在仓库设置中开启 GitHub Pages

## 官方参考

- GitHub Pages 说明：
  https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- 上传文件说明：
  https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
