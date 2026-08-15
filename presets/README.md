# Presets

内置供应商预设（`PRESETS` 常量，见 index.js）。每行生成链配置在设置卡片中可编辑：

| name | baseURL | 默认模型 | API Key 环境变量 |
|---|---|---|---|
| siliconflow | https://api.siliconflow.cn/v1 | Kwai-Kolors/Kolors | SILICONFLOW_API_KEY |
| zhipu | https://open.bigmodel.cn/api/paas/v4 | cogview-3-flash | ZHIPU_API_KEY |
| wanx | https://dashscope.aliyuncs.com/compatible-mode/v1 | wanx2.1-t2i-flash | DASHSCOPE_API_KEY |
| openai | https://api.openai.com/v1 | gpt-image-1 | OPENAI_API_KEY |
| openrouter | https://openrouter.ai/api/v1 | stabilityai/stable-diffusion-xl | OPENROUTER_API_KEY |

> 所有端点均为 OpenAI 兼容的 `POST {baseURL}/images/generations`。自定义供应商可在设置卡片中直接添加任意 OpenAI 兼容端点。
