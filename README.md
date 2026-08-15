# dsh-image-gen

多供应商生图插件 for DeepSeek Harness：给纯文本模型一双"画图的手"。

- **多供应商生成链**：每行一个「供应商/模型」，独立 API Key（环境变量），失败自动按链回退
- **无痛调用**：`image_generate` 工具，生成的图片经附件服务直接显示在对话里
- **自动校验**：生成后 sniff 媒体类型 + sharp 解码 + 黑图/尺寸检测；可选配视觉模型链（`verifyProviders`）判断图片是否渲染正常，异常自动换下一个供应商重试
- **设置卡片**：设置 > 插件 > 插件配置 > 生图模型，多行编辑 + 预设一键填充

## 安装

```sh
dsh plugin --profile web add dsh-image-gen
```

## 配置

环境变量（每行独立 Key）：

| 供应商 | 环境变量 | 默认模型 |
|---|---|---|
| SiliconFlow | `SILICONFLOW_API_KEY` | Kwai-Kolors/Kolors |
| 智谱 | `ZHIPU_API_KEY` | cogview-3-flash |
| 万相 | `DASHSCOPE_API_KEY` | wanx2.1-t2i-flash |
| OpenAI | `OPENAI_API_KEY` | gpt-image-1 |
| OpenRouter | `OPENROUTER_API_KEY` | stabilityai/stable-diffusion-xl |

设置卡片里每行格式（空格分隔）：

```
name/model baseURL KEY_ENV_VAR size
siliconflow/Kwai-Kolors/Kolors https://api.siliconflow.cn/v1 SILICONFLOW_API_KEY 1024x1024
```

## 使用

对话里直接说：`画一只赛博朋克风格的猫` → 模型自动调用 `image_generate`。

可选参数：`size`（如 1024x1792）、`model`（如 `siliconflow/black-forest-labs/FLUX.1-schnell` 指定供应商/模型）。


## 开发

```sh
pnpm install
pnpm test        # 离线冒烟测试（纯逻辑，无网络调用）
```

测试覆盖：媒体类型嗅探（PNG/JPEG/垃圾字节）、失败分类（quota/rate-limit/network/invalid）。

## 架构

- `index.js` — 宿主端：`image_generate` 工具、多供应商生成链、失败回退、生成后校验（sharp 解码 + 黑图/尺寸检测 + 可选视觉链）
- `lib/client.js` — 浏览器端：设置卡片（多行 provider/key 编辑 + 预设一键填充）
- `presets/` — 内置供应商预设文档
- `cordis.patch.yml` — bundle 组合层

设计参考：`dsh-vision-router`（provider 链/卡片/失败回退架构）+ `dsh-eye`（OpenAI 兼容生图传输）。
