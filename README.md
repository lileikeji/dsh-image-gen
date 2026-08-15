# dsh-image-gen

多供应商生图插件 for DeepSeek Harness：给纯文本模型一双"画图的手"。

- **多供应商生成链**：每行一个「供应商/模型」，独立 API Key（明文或环境变量），失败自动按链回退
- **无痛调用**：`image_generate` 工具，生成的图片经附件服务直接显示在对话里（前端图片块 + markdown attachment 双路径）
- **自动校验**：生成后 sniff 媒体类型 + sharp 解码 + 黑图/尺寸检测；可选配视觉模型链（`verifyProviders`）判断图片是否渲染正常，异常自动换下一个供应商重试
- **设置卡片（v3 表单式）**：设置 > 插件 > 插件配置 > 生图模型 —— 每个供应商一张表单：名称 / 接口地址 / API Key（可直接粘贴明文）/ Key 环境变量 / **模型下拉 + 「获取模型」自动拉取** / 尺寸；预设一键填充

## 安装

```sh
dsh plugin --profile web add dsh-image-gen
```

## 配置

设置卡片里为每个供应商填一张表单。密钥二选一：
- **直接填 API Key**（明文，存进 settings）
- **填环境变量名**（推荐，密钥放 `~/.dsh/.env`，如 `SILICONFLOW_API_KEY`）

点「获取模型」会调用宿主端 `GET {baseURL}/models` 自动拉取可用模型列表（OpenAI 兼容协议）。

| 供应商 | 接口地址 | 默认模型 |
|---|---|---|
| SiliconFlow | `https://api.siliconflow.cn/v1` | `Kwai-Kolors/Kolors` |
| 智谱 | `https://open.bigmodel.cn/api/paas/v4` | `cogview-3-flash` |
| 万相 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `wanx2.1-t2i-flash` |
| OpenAI | `https://api.openai.com/v1` | `gpt-image-1` |
| OpenRouter | `https://openrouter.ai/api/v1` | `stabilityai/stable-diffusion-xl` |

## 使用

对话里直接说：`画一只赛博朋克风格的猫` → 模型自动调用 `image_generate`。

可选参数：`size`（如 1024x1792）、`model`（如 `siliconflow/black-forest-labs/FLUX.1-schnell` 指定供应商/模型）。

## 前端显示

生成的图片通过 `ctx.attachments.saveImage` 持久化为附件（`sha256:` 引用），工具结果携带 `{ type: 'image', attachment }` 块：
- **工具卡片**：DSH 内核的 ToolRow 用会话授权 `loadImage` 加载并渲染图片
- **Markdown**：attachment 引用同时可作为 `![图](attachment:sha256:...)` 渲染（需内核 `dsh-client-ui-primitives` 的 attachment-loader 支持，见 `lileikeji/dsh-ui-image-render` 补丁或含该能力的内核版本）

## 开发

```sh
pnpm install
pnpm test        # 离线冒烟测试（纯逻辑，无网络调用）
```

测试覆盖：媒体类型嗅探（PNG/JPEG/垃圾字节）、失败分类（quota/rate-limit/network/invalid）。

## 架构

- `index.js` — 宿主端：`image_generate` 工具、多供应商生成链、失败回退、生成后校验（sharp 解码 + 黑图/尺寸检测 + 可选视觉链）、`/dsh-image-gen/models` 路由（自动获取模型列表）
- `lib/client.js` — 浏览器端：设置卡片（结构化供应商表单 + 密钥明文/环境变量 + 模型下拉自动获取 + 预设一键填充）
- `presets/` — 内置供应商预设文档
- `cordis.patch.yml` — bundle 组合层

设计参考：`dsh-vision-router`（provider 链/卡片/失败回退架构）+ `dsh-eye`（OpenAI 兼容生图传输）。
