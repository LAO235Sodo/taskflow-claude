# host-adapters 包 — 宿主防护层

> 能力包：宿主扩展的规则与资产。**宿主差异单点 = `assets/shared/host-adapter.mjs`**（detectHost/usagePath/planScanDirs/guardTargets/redlineFile/canaryCmdBin）。
> 安装：`node <skill目录>/scripts/tf.mjs mech install TASKFLOW_GUARD`——claude 宿主装五门薄适配（四硬门 + 领域提示门）；其余宿主打印「本宿主无守门通道，已降级纯纪律档（conventions 红线 + doctor）」不落盘。omp 线（18 门全集）住原仓 `LAO235Sodo/taskflow`，本仓不携带。

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

## 包内资产

- `assets/guard/taskflow-guard-claude.mjs`——Claude Code hooks 薄适配模板（四硬门 + 门清单真源 GATE_MANIFEST_CLAUDE；渲染经 inlineSharedDeps 内联自包含，.mjs 强制 ESM 不依赖项目 package.json；main 自检门使静态导入零副作用——mechanisms 报表同源消费）；
- `assets/guard/taskflow-hint-claude.mjs`——提示门模板（渲染期固化 `__DOMAIN_SKILLS__`（领域→技能 id 清单，真源=`scripts/skills-registry.json`）与 `__SKILL_CLI__`（tf.mjs 绝对路径）；注册表更新由 mech check 漂移检测兜底重渲染）；
- 新宿主适配器按 `assets/shared/host-adapter.mjs` 的函数面实现（pi/omp 适配器在原仓与 pi 仓）。

## 事故档案

- 2.84.1 实锤（原仓）：before_provider_request 的 payload 形状随 provider transport 而定，向 payload.system 写入被静默丢弃=E/U/V 三墙 no-op 19 天 → 金丝雀制度由此而来——本仓 canary claude 分支沿用同款双层实证（机制层+真实模型层）。
- v3.4.0 实锤（提示门开发期）：`execFileSync('git',...)` 缺省 stdio 配置下 git 的 stderr 直通继承——非 git 项目每次事件漏 `fatal:` 污染诊断视图（冒烟实证）→ locateTasksDir 显式 `stdio:['ignore','pipe','pipe']`（hint/guard 同款排查同步修，硬规则 25）。
