# host-adapters 包 — 宿主防护层

> 能力包：宿主扩展的规则与资产。**宿主差异单点 = `assets/shared/host-adapter.mjs`**（detectHost/usagePath/planScanDirs/guardTargets/redlineFile/canaryCmdBin）。
> 安装：`node <skill目录>/scripts/tf.mjs mech install TASKFLOW_GUARD`——claude 宿主装五门薄适配到 `.claude/hooks/`（四硬门 + 领域提示门，配 settings.json hooks 注册）；opencode2 宿主装五门薄适配到 `.opencode/plugins/taskflow-guard/`（V2 plugin 目录即装，v3.8.0）；其余宿主打印「本宿主无守门通道，已降级纯纪律档（conventions 红线 + doctor）」不落盘。omp 线（18 门全集）住原仓 `LAO235Sodo/taskflow`，本仓不携带。
> **延迟初始化呈报（v3.6.0，v3.8.0 宿主集扩展）**：用户不需要记得这条命令——`tf.mjs new` 在 host∈{claude, opencode2} 且未采纳且未拒时自动打印启用指引，编排层按 new-task.md 第 8 步呈报条款一次一问代跑（同意即装 + 金丝雀；拒绝跑 `mech decline TASKFLOW_GUARD` 落 profile.mech_declined 永不再问）；装/拒后提示行自动消失。

## claude 宿主五门薄适配（v3.2.0 四门 + v3.4.0 提示门；住 `.claude/hooks/taskflow-guard-claude.mjs` 与 `.claude/hooks/taskflow-hint-claude.mjs`）

> Claude Code 是声明式 hooks（settings.json 注册）而非 ambient 事件总线，事件模型不同——按精简移植路线：只 port 高价值门，其余门留纯纪律档（conventions 红线 + doctor 承载）。安装即自动幂等合并项目 `.claude/settings.json`（只增删 command 含 taskflow 渲染文件名的条目——v3.4.0 起按 guard/hint 两个文件名逐一匹配，既有 hooks 零触碰）。

| 门 | Claude Code 事件 | 档位 | 行为 |
| --- | --- | --- | --- |
| J 状态翻转墙 | PreToolUse（Edit/Write/MultiEdit）+ Bash 重定向通道 | `TF_STATUS` 缺省 enforce（deny）/ warn（ask）/ off | task.json/index.json 的 status/deploy.status 手改=deny；翻转唯一合法写路径=tf.mjs 扳机命令，档案修复走 `node tf.mjs reconcile --fix` |
| G 编辑边界门 | PreToolUse（Edit/Write/MultiEdit） | `TF_BOUND` 缺省 **ask**（弹用户拍板）/ enforce（deny）/ off | 编辑路径对照任务声明清单（spec「边界与影响面」+ subtasks「涉及文件」），越界弹人批——单一职责与爆炸半径的机械不变量 |
| B 簿记硬拦 | PreToolUse（Bash） | `TF_BASH` 缺省 deny / off | `commit --files` 空格分隔多文件=deny（逗号分隔才对）；红线 git（reset --hard / checkout -- / clean -f / force push（--force-with-lease 豁免）/ branch -D）=deny（纪律①机械化） |
| C 压缩接力 | PreCompact | 无档位 | 压缩前对 active/verifying 任务落 `.taskflow/<id>/compact-relay.md`（最近 checkpoint + progress 尾部 + handoff 下一步）——「先存档再跑」铁律机械化，恢复靠 resume 读档案 |
| H 领域提示门（v3.4.0，**永不拦截**） | PostToolUse（Write/Edit/MultiEdit）+ UserPromptSubmit（缺省关） | `TF_HINT` 缺省开 / **off**；`TF_HINT_PROMPT` 缺省关 / on | 写/编辑命中领域硬信号（扩展名 .tsx/.vue/.java/.kt/.py/.ts 等 + 测试文件名形态）→ 工具结果旁注入「领域提示 + 映射技能清单 + 机械在场检测（tf.mjs skills）」——domain.md「领域→技能映射」的 L1 事件注入落地；去重=每会话每领域一次（`.taskflow/.hint-state.json`，无 taskflow 项目落系统临时目录按 cwd 哈希隔离）；**只注入不拦截，fail-open 吞错静默，语义确认归模型按 domain.md 领域检测**；UserPromptSubmit 需求词粗筛无 matcher 每条 prompt 触发、噪声面大故缺省闭（启用=TF_HINT_PROMPT=on，无需重装） |

- 门清单真源 = 渲染源 `GATE_MANIFEST_CLAUDE`（`node tf.mjs mechanisms` 看；机制透明化口径同原仓）；触发日志 `.taskflow/.guard-log.jsonl`（`TF_GUARD_LOG=off` 关；gate token：status-wall/boundary/bookkeeping/compact-relay/domain-hint）；
- 注入审计：`node tf.mjs hint-stats`（v3.5.0，只读恒 exit 0）——domain-hint 流水按领域/按日/会话分布，回答「提示门实际触发了多少次」；「提示→技能加载」转化率粗测走人力对照（对「感觉帮上了」的时刻记一笔实际加载），数据攒够再决定 TF_HINT_PROMPT 开关或埋点立项；
- 提示门零干扰边界（与四硬门不同）：**不要求项目采纳 TASKFLOW_GUARD**——hook 装进项目（settings 注册）即工作，无 `.taskflow/` 项目状态落系统临时目录；已知边界（一期不展开）：非 taskflow 项目享受提示门需单项目安装路径（`--global` 用户级注册列二期）；
- 四硬门零干扰边界：项目无 `.taskflow/` 或未采纳 TASKFLOW_GUARD = 全门静默；handler 整体吞错（fail-open，守门自身故障不阻断用户工具流）；
- 卸载 = 删 `.claude/hooks/` 两个 taskflow 文件 + 清 settings.json 含 guard/hint 任一文件名的 hook 条目 + 清 `project.json.mechanisms.TASKFLOW_GUARD`；
- 金丝雀：`TF_HOST=claude node <skill目录>/scripts/tf.mjs canary`——①机械层（合成 stdin：守门必 deny + 提示门必注入含领域词、同会话二次必静默）②模型层（真实 `claude -p` 覆写状态必被拦 + 写 .java 必触发提示门注入，guard-log 双留痕 status-wall/domain-hint）。

## opencode2 宿主五门薄适配（v3.8.0；住 `.opencode/plugins/taskflow-guard/index.js`——单文件 plugin 携全部五门）

> OpenCode V2 的注入机制与 Claude Code 不同（宿主用户拍板原则：按各 agent 原生机制承载，不硬搬 hooks 形态）——事件面全部换 V2 原生通道，判定核心与 claude 线逐字节同源。通道实证（2026-11-11 探针，v2.2.7）：裸目录 `.opencode/plugins/<名>/` 自动加载（无 package.json 亦可，`index.js` 默认导出 `{id, setup}`）；`tool.hook("execute.before")` throw=deny（错误文本回给模型、工具不执行）；`tool.hook("execute.after")` 改 `result.content` 注入达模型；`skill.transform` 事件期晚注册进模型技能面。

| 门 | OpenCode V2 事件 | 档位 | 与 claude 线的差异 |
| --- | --- | --- | --- |
| J 状态翻转墙 | `execute.before`（edit/write ＋ shell 重定向通道） | `TF_STATUS` 同款三档 | deny=throw（无 JSON stdout 合同）；工具名 `shell`（非 Bash matcher） |
| G 编辑边界门 | `execute.before`（edit/write） | `TF_BOUND` 缺省 deny+引导呈报 | **V2 无 UI 级 ask 通道**（合同只有 inspect/replace input）——缺省档语义如实申报：deny 并令模型把边界问题呈用户拍板，批=登记范围（req-confirm）后重试，效果等价「人拍板才过」 |
| B 簿记硬拦 | `execute.before`（shell） | `TF_BASH` 同款 | 判定同源（commit --files 空格分隔 + 红线 git 五式） |
| C 压缩接力 | `session.hook("compaction")` | 无档位 | 语义比 claude PreCompact 更贴：hook 在摘要前触发、不设 `event.result` 即旁路落盘照常摘要 |
| H 领域提示门（永不拦截） | `execute.after`（write/edit） | `TF_HINT` 同款 | **双通道超集**：①result.content 追加提示（claude 的 additionalContext 等价物）②缺失的映射技能经 `skill.transform` 以指针条目注册进技能面（模型可见可调用，claude 线无此通道）；辅助点位 session.hook("prompt") **不移植**——V2 prompt hook 改 admission draft（会成为持久化用户输入），无干净 additionalContext 通道 |

- 门清单真源 = 渲染源 `GATE_MANIFEST_OPENCODE2`（mechanisms 报表与 GATE_MANIFEST_CLAUDE 双宿主并列输出）；触发日志同 `.taskflow/.guard-log.jsonl`（gate token 与 claude 线逐一对齐：status-wall/boundary/bookkeeping/compact-relay/domain-hint；ses= 审计键同款，hint-stats 通用）；
- 通用纪律同款：无 `.taskflow/` 或未采纳 = 全门静默；handler 整体吞错 fail-open（每注册独立吞错——单门注册失败不拖垮其余门）；
- 安装 = 渲染 `index.js` 到 `.opencode/plugins/taskflow-guard/`（目录即装自动加载，**无 settings 注册面**）；随 plugin 注册验收命令 `/taskflow-verify`（US-OC2-03 验收清单机械化：验收标准逐条真跑 + 使用者视角检查 + 影响面→验证转化落 verification-report——产物对齐既有验收载体，accept/merge 前置确认回执走 tf.mjs confirm）；卸载 = 删该目录 + 清 `project.json.mechanisms.TASKFLOW_GUARD`；
- 金丝雀：`node <skill目录>/scripts/tf.mjs canary`（opencode2 宿主自动接线 `opencode run`）——①机械层：渲染副本 `__test.beforeTool/afterTool`（生产 hook 同一分派路径）断言拦截/注入/去重 ②模型层：`opencode run --auto` 真跑一轮，覆写状态必被拦 + 写 .java 必注入，guard-log 双留痕；
- 已知边界（如实申报）：C 门 live-fire（真实压缩触发）未入金丝雀——文档合同明确（hook 在压缩摘要前触发），机械层以注册成功 + 纯判定覆盖；真身技能安装后与指针条目的 id 冲突消解未合同（观察项——真身在扫描位时指针不再注册，存量指针随重装刷新）。

## 包内资产

- `assets/guard/taskflow-guard-claude.mjs`——Claude Code hooks 薄适配模板（四硬门 + 门清单真源 GATE_MANIFEST_CLAUDE；渲染经 inlineSharedDeps 内联自包含，.mjs 强制 ESM 不依赖项目 package.json；main 自检门使静态导入零副作用——mechanisms 报表同源消费）；
- `assets/guard/taskflow-hint-claude.mjs`——提示门模板（渲染期固化 `__DOMAIN_SKILLS__`（领域→技能 id 清单，真源=`scripts/skills-registry.json`）与 `__SKILL_CLI__`（tf.mjs 绝对路径）；注册表更新由 mech check 漂移检测兜底重渲染）；
- `assets/guard/index.js`——opencode2 宿主五门 plugin 模板（v3.8.0；渲染为 `.opencode/plugins/taskflow-guard/index.js`——目录即装；占位符带引号/try-catch 形态使模板可被 Node 直连 import（tf.mjs mechanisms 报表 + 测试）；`__test` 导出=生产同分派路径的机械测试面（金丝雀①与单测消费）；门清单真源 GATE_MANIFEST_OPENCODE2）；
- 新宿主适配器按 `assets/shared/host-adapter.mjs` 的函数面实现（pi/omp 适配器在原仓与 pi 仓）。

## 事故档案

- 2.84.1 实锤（原仓）：before_provider_request 的 payload 形状随 provider transport 而定，向 payload.system 写入被静默丢弃=E/U/V 三墙 no-op 19 天 → 金丝雀制度由此而来——本仓 canary claude 分支沿用同款双层实证（机制层+真实模型层）。
- v3.4.0 实锤（提示门开发期）：`execFileSync('git',...)` 缺省 stdio 配置下 git 的 stderr 直通继承——非 git 项目每次事件漏 `fatal:` 污染诊断视图（冒烟实证）→ locateTasksDir 显式 `stdio:['ignore','pipe','pipe']`（hint/guard 同款排查同步修，硬规则 25）。
