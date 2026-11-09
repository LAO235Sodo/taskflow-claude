<div align="center">

# taskflow-claude

**长任务跨会程账本（Claude Code 线）：建档 · checkpoint · 恢复 · 合并 · 验收**

核心零栈私货（任意项目/技术栈可用）；栈特有能力按项目 profile 懒加载（能力包住 `packs/`）。
自 [LAO235Sodo/taskflow](https://github.com/LAO235Sodo/taskflow) v3.1.0 分叉——**omp 线（守门 18 门全集）住原仓**，本仓聚焦 Claude Code。

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![dependencies](https://img.shields.io/badge/dependencies-0-green.svg)](scripts/tf.mjs)

</div>

---

长任务跨会话账本：建档、checkpoint、恢复、合并、验收。任意项目/技术栈可用——核心零栈私货，栈特有能力按项目 profile 懒加载（能力包）。

## 安装（三命令）

```bash
# 1. 克隆到统一安装位
git clone git@github.com:LAO235Sodo/taskflow-claude.git ~/.agents/skills/taskflow-claude

# 2. Claude Code 指过来
ln -sfn ~/.agents/skills/taskflow-claude ~/.claude/skills/taskflow

# 3. 项目里初始化（新装写 project.json+profile.json+conventions 骨架）
node ~/.claude/skills/taskflow/scripts/tf.mjs init
```

- 全局数据根：`TF_TASKFLOW_HOME`（缺省 `~/.local/state/taskflow`）——跨安装路径可移植。
- 更新：`node ~/.agents/skills/taskflow-claude/scripts/tf.mjs self-update`（git pull --ff-only + 版本对账）。
- Claude Code 会话内自动识别（`CLAUDECODE` env 判据，双装机无需 TF_HOST）；特殊环境可 `TF_HOST=claude|opencode|none` 强制。

## 宿主 adapter

| 宿主 | 检测 | 计划扫描 | 守门落点 | 红线载体 |
| --- | --- | --- | --- | --- |
| claude | 会话 env `CLAUDECODE` / `~/.claude` 存在 | `~/.claude/plans`（plan mode 产物 → ls 游离清单） | `.claude/hooks/` 四门 + settings.json hooks 注册 | CLAUDE.md |
| opencode | `~/.config/opencode` 存在 | — | 无（降级纯纪律档） | AGENTS.md |
| none | 其余 / 强制 `TF_HOST=none` | — | 无（降级纯纪律档） | conventions.md |
| omp | （omp 线住原仓 taskflow） | — | 本仓按纪律档处理 | conventions.md |

adapter 单点=`assets/shared/host-adapter.mjs`。

## 守门（TASKFLOW_GUARD 四门薄适配）

`node <skill目录>/scripts/tf.mjs mech install TASKFLOW_GUARD` —— 渲染 `.claude/hooks/taskflow-guard-claude.mjs`（自包含单文件）并幂等合并项目 `.claude/settings.json` hooks（既有条目零触碰）：

| 门 | 事件 | 档位 |
| --- | --- | --- |
| J 状态翻转墙 | PreToolUse（Edit/Write/MultiEdit）+ Bash 重定向通道 | `TF_STATUS` 缺省 enforce——手改 task.json/index.json 状态=deny（唯一写路径=tf.mjs 扳机命令） |
| G 编辑边界门 | PreToolUse（Edit/Write/MultiEdit） | `TF_BOUND` 缺省 ask 弹用户拍板 / enforce / off——越界编辑对照 spec 声明清单 |
| B 簿记硬拦 | PreToolUse（Bash） | `TF_BASH` 缺省 deny / off——`commit --files` 空格分隔 + 红线 git（reset --hard / force push 等） |
| C 压缩接力 | PreCompact | 压缩前自动落 `.taskflow/<id>/compact-relay.md` 接力快照 |

金丝雀（装完必跑一次）：`TF_HOST=claude node <skill目录>/scripts/tf.mjs canary`——机械层（合成 stdin 必 deny）+ 真实 `claude -p` 模型层（必被墙拦）双层实证。触发日志 `.taskflow/.guard-log.jsonl`（`TF_GUARD_LOG=off` 关）。

## 能力包（懒加载）

`packs/` 八包：frontend / jvm-data / deploy / docs-prd / changelog-gates / briefing / carrier / host-adapters。每包 `manifest.json`（token/triggers/assets/install_targets）+ `PACK.md`（规则全文）。项目启用态住 `.taskflow/profile.json`；未启用的包连一行都不加载。

```bash
node <skill目录>/scripts/tf.mjs packs list                    # 包清单 + 启用态
node <skill目录>/scripts/tf.mjs packs install carrier --all   # 五载体技能 → ~/.agents/skills/
node <skill目录>/scripts/tf.mjs mech install <token>          # 包内机制产物渲染进项目
```

机制机器注册表 `references/schemas/mechanisms.json` 由 `node scripts/gen-mechanisms.mjs` 从 manifests+core 种子生成（doctor I20 对账）。

## 项目 profile（`.taskflow/profile.json`）

`confirm_tier`（detailed|batch，模型禁自改）· `host` · `deploy_form`（none|jar|generic）· `packs`（启用态）· `carriers`（五载体拍板）· `task_types`（任务类型裁剪，如 mirror-precedent）· `unified_sources`。建档/resume/merge/checkpoint 四触点必读。初始化：`tf.mjs init`（升级模式只补缺不覆盖；`--ask` 单问卷）。

## 迁移

1. 旧项目（含原仓 taskflow 装的项目）在仓库内跑 `node <skill目录>/scripts/tf.mjs init`——升级模式补 profile.json/conventions 骨架（不覆盖既有内容，不改任务档案）；
2. 全局注册表 `TF_TASKFLOW_HOME` 跨安装位共用；
3. 任务数据 schema 兼容读；机制 token 全保留（`mech ls` 对账）。

## 发版

改完代码 + 手写 `CHANGELOG.md` 顶条目（本地文件，gitignored）后：`node scripts/tf.mjs release <version>`（版本写入→lint→回归→commit→tag→push origin main --tags；远程不可达=警告不失败）。各安装位 `self-update` 拉取。

## 贡献须知（公开仓卫生）

本仓库公开，git 历史不可变——commit 即发布。提交/发版守 PUBLIC_HYGIENE_GATE（公开仓卫生门）：公司/项目/系统真名、个人标识（工号/用户路径）、内网拓扑（IP/内部域名）、凭据密钥一律不入仓；词表唯一源 `assets/harness/hygiene-terms.json`（新接入的项目/系统先登记词表再写代码）；自查 `node scripts/tf.mjs hygiene`（全树 / `--diff` 增量），行级豁免 `hygiene-ok: 理由`。细则与泄漏事故处置见 references/public-hygiene.md。

**外部贡献走 PR**：流程、红线与仓库纪律见 [CONTRIBUTING.md](CONTRIBUTING.md)——PR 与 push to main 均自动跑卫生扫描 + lint + 全量回归（`.github/workflows/ci.yml`），红灯先自修。

## 演示

![demo](docs/media/demo-zh.gif)

> 机制注记：TF_HOME 抽象承载全局数据根；RELEASE_CHAIN 发版链一条命令收口（见「发版」节）；TASKFLOW_GUARD 守门与金丝雀见「守门」节。
