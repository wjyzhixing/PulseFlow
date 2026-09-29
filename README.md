# PulseFlow

PulseFlow 把业务需求转成可编辑的 Vue 3 页面草稿。设计人员可以在 Studio 中生成或手工搭建页面、通过对话修改设计、预览并发布；开发者再用 CLI 将不可变发布版本拉进消费方 Vue 项目。

页面由受控 UI-DSL 组件生成。图片可作为 `<img>` 或 Hero/内容区背景，并随发布和 CLI 导出。预览使用模拟业务数据，实际 API 和应用路由由消费方项目接入。

## 文档

- [开发指南](develop.md)：架构、Mermaid 工作流、环境变量、开发命令、发布门禁和 CLI。
- [中文使用指南](docs/中文使用指南.md)：Studio 操作、需求导入、页面发布与 CLI 使用。
- [机器人官网制作手册](docs/PulseFlow机器人官网制作手册.md)：从登录到 AI 生图与发布的实测步骤和截图。

## 快速开始

需要 Node.js 22+ 和 pnpm 10.33.0。复制 `.env.example` 为 `.env`，填写工作区令牌和模型服务配置，然后在启动终端执行 `set -a && source .env && set +a`。

```sh
pnpm install
pnpm --filter @pulseflow/api dev
```

另开一个终端加载同一份 `.env` 并运行 Studio：

```sh
pnpm --filter @pulseflow/studio dev
```

本地类型检查、测试、覆盖率与构建：

```sh
pnpm verify
```

## 项目状态

通用 Qwen Chat Completions 生图模式和火山方舟 Seedream 图片模式都已接入。TokenRhythm 当前 Key 最近一次模型目录查询未列出 `qwen-image-2.0`，其真实图片响应仍待确认；详情见[开发指南](develop.md#图片提供方)。
