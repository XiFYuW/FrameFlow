# FrameFlow

> **语言：** 简体中文（当前） - [English](./README.md)

一个**面向 AI 模型调用**的通用短视频生产线。它以 Agent Skill 的形式分发，而不是一个视频项目：仓库里只有代码和 JSON 配置，没有任何图片、字体、音频或成片。

输入一个内容包（台词 + 可选素材），输出 MP4 成片、SRT 字幕、分章口播稿和发布文案。渲染器不内置任何题材、语言、时长或画幅。

## 快速开始

```bash
npm install
npm run skill:install -- --list
```

安装是可选的。能读文件、能跑命令的模型无需任何配置：直接把 `skills/frameflow/SKILL.md` 指给它，并告知仓库路径即可。

如果所用 Agent 会扫描 skills 目录，用 `npm run skill:install -- --dir <path>` 指向该目录（任意目录都可以），或从 `npm run skill:install -- --list` 里挑一个快捷名称。已有副本加 `--force` 刷新。

然后可以对模型这样说：

- 「做一条 60 秒竖屏新品宣传片，带字幕和发布文案。」
- 「按这份大纲做一个 6 集的系列，并渲染第 1 集。」
- 「校验我这个内容包 /abs/path/pack，然后挂载它。」
- 「为当前集导出字幕和口播稿。」

## Skill 工作流程

```
主题 / 需求
   -> npm run pack:new        在仓库外生成内容包骨架
   -> 模型编写 episode.json   章节、台词、高亮词、发布文案
   -> npm run pack:check      确定性校验，支持 JSON 输出
   -> npm run content:load    挂载内容包，缺图时生成中性占位图
   -> typecheck + compositions
   -> npm run render          渲染主成片 MP4
   -> npm run deliver         汇总 mp4 + srt + 口播稿 + 发布 txt/json
```

换题材永远不改引擎。完整工作流见 `skills/frameflow/SKILL.md`，台词写法、内容包 schema 和命令速查见 `skills/frameflow/references/`。

## 内容包契约

```
my-pack/
  episode.json                 单集；多集用 episodes/<id>.json
  presets/render.json          画幅、帧率、BPM、场景网格、功能开关
  presets/labels.json          导出文案模板与文件后缀
  illustrations/<id>/          可选；缺失时自动生成占位图
  assets/                      可选字体 / 音频
```

`examples/demo/` 是一份完整、纯英文、零媒体文件的示例包。可以直接复制，或用 `npm run pack:new` 生成新包。

## 命令速查

| 命令                                                  | 作用                     |
| --------------------------------------------------- | ---------------------- |
| `npm run pack:new -- --dir <dir> --title "<title>"` | 生成内容包骨架                |
| `npm run pack:check -- <dir> [--json]`              | 挂载前校验内容包               |
| `npm run content:load -- <dir> [--episode <id>]`    | 挂载到运行时目录 `content/`    |
| `npm run switch -- <id>`                            | 多集内容包内切换当前集            |
| `npm run setup`                                     | 恢复英文示例包                |
| `npm run typecheck`                                 | TypeScript 类型检查        |
| `npx remotion compositions src/index.ts`            | 校验已注册的合成               |
| `npm run render`                                    | 渲染 `out/frameflow.mp4` |
| `npm run deliver -- --name <id> --title "<title>"`  | 打包全部交付物                |
| `npm run export-sub` / `npm run publish-copy`       | 只导出文字物料                |
| `npm run skill:install -- --dir <path>`             | 安装 Skill 到任意 skills 目录 |
| `npm run skill:install -- --list`                   | 查看可选的快捷安装目标        |

## 仓库结构

```
README.md, README.zh-CN.md   英文 / 中文文档
AGENTS.md                    供识别 AGENTS 约定的模型使用的兜底入口
skills/frameflow/            SKILL.md + references/ + resolve-root.mjs（通用 Agent Skills 格式）
scripts/                     内容包脚手架、校验、挂载、导出、Skill 安装
src/                         Remotion 渲染器（与题材无关）
examples/demo/               入库的英文示例内容包
content/, public/, out/      运行时目录，已 gitignore
```

## 支持的 Agent

Skill 的 frontmatter 只使用通用 Agent Skills 字段（`name`、`description`、`compatibility`、`metadata`），因此可在 Claude Code、WorkBuddy、claude.ai / Skills API 上传包，以及任何读取 `SKILL.md` 的模型中加载。根目录的 `AGENTS.md` 为遵循 AGENTS 约定的模型提供兜底入口。整个过程不依赖任何厂商的集成、密钥或专有配置：安装目标名称只是几个常见 skills 目录的快捷别名，其余情况用 `--dir <path>` 即可。

每个安装副本都带有 `resolve-root.mjs`，会在运行时定位仓库；`local.json.root` 只是经过校验的缓存提示。因此仓库改名或移动**不需要重装项目级 Skill**。存在多个仓库副本时，可设置 `FRAMEFLOW_ROOT` 手动指定。

运行要求：Node.js 20+ 与 npm。完整 MP4 渲染需要 Chromium 内核浏览器；若本机没有，Remotion 会自动下载自己的 Chrome Headless Shell。

`remotion.config.ts` 会在 Windows、macOS、Linux 上自动查找浏览器（先查各平台标准安装位置，再查 `PATH`）。可用 `REMOTION_BROWSER`、`CHROME_PATH`、`PUPPETEER_EXECUTABLE_PATH` 或 `CHROME_BIN` 手动指定；`FRAMEFLOW_BROWSER=bundled` 强制使用 Remotion 自带浏览器，`FRAMEFLOW_BROWSER_DEBUG=1` 打印最终选择，`FRAMEFLOW_CONCURRENCY=<n>` 调整渲染并发数（适合低配 CI）。这些都是可选环境变量，无需修改配置，也无需针对平台单独设置。

## 验证引擎

```bash
npm install
npm run pack:check -- examples/demo
npm run content:load -- examples/demo
npm run typecheck
npx remotion compositions src/index.ts
```

预期结果：输出 `PACK_OK`、类型检查退出码为 0，且只有一个 `FrameFlow` 合成，其帧率、画幅、总帧数均来自 `examples/demo/presets/render.json`。

## 文档语言

- [`README.md`](./README.md) 是英文原文，也是规范版本。
- `README.zh-CN.md`（本文件）是简体中文翻译，章节顺序与英文版一一对应。
- 两份内容若有出入，以英文版为准。
- 代码、`SKILL.md`、Skill 参考文档、脚本和示例内容包全部保持英文。中文 README 是仓库里唯一含中文的文件，它只供人类阅读，不会作为渲染器或 Skill 的输入。

---

[English](./README.md)
