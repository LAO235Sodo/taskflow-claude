// taskflow-hint-claude.mjs — TASKFLOW_GUARD 第五门族「提示门」Claude Code 宿主渲染产物（源模板住技能仓 assets/guard/，
// 与四硬门同目录同 token：mech install TASKFLOW_GUARD 一并渲染注册，无独立 mechanisms 登记，卸载随 guard 同路径）。
// 定位：L1 事件注入层——领域硬信号命中时注入 additionalContext（官方 Hooks Reference：PostToolUse 注入于工具结果旁）：
//   一行领域提示 + 该领域映射技能清单（渲染期内联自 skills-registry.json）+ 机械在场检测（spawnSync node <tf.mjs> skills <领域词>）
//   ——把「任务命中领域→该加载哪个技能」从模型记忆搬到事件触发，DEP_ASK_GATE 在场检测同步机械化。
// 与四硬门的本质分界：提示门永不 deny/ask——只注入，fail-open 吞错静默；TF_HINT=off 会话级关（对齐 TF_STATUS/TF_BOUND/TF_BASH 档位模式）。
// 信号面（粗筛声明）：扩展名→领域硬映射（文件不撒谎）+ 测试文件名形态；语义确认归模型按 domain.md 领域检测——注入文本尾固定声明。
//   单源纪律：扩展名表与技能映射渲染时固化（本仓 skills-registry.json 为映射真源）；domain.md 信号表保持语义权威，两表互指不合一。
// 去重：每会话（session_id）每领域一次——状态文件：有 .taskflow 项目落 .taskflow/.hint-state.json，无 taskflow 项目落
//   系统临时目录按 cwd 哈希隔离（提示门不要求项目装 taskflow）；会话条目 24h 过期修剪。
// 辅助点位 UserPromptSubmit：高频需求词粗筛，缺省关（TF_HINT_PROMPT=on 显式开）——该事件无 matcher 每条 prompt 触发，噪声面大故默认闭。
// 触发日志：随 guard 同文件 .taskflow/.guard-log.jsonl（gate=domain-hint；TF_GUARD_LOG=off 关；无 .taskflow 项目不落日志）。
// 已知边界（一期不展开）：非 taskflow 项目享受提示门需单项目安装路径（--global 用户级注册列为二期——脱离 mech 对账体系）。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 门清单单源纪律：本门描述符行住 taskflow-guard-claude.mjs 的 GATE_MANIFEST_CLAUDE（mechanisms 报表唯一消费点），此处不重复导出。

const HOOK_NAME = 'taskflow-hint-claude.mjs';
const SKILL_CLI = '__SKILL_CLI__'; // 渲染期替换为技能仓 scripts/tf.mjs 绝对路径（self-update 不移路径；漂移由 mech check 兜底）
const DOMAIN_SKILLS = __DOMAIN_SKILLS__; // 渲染期内联：{领域词: [技能 id...]}（真源=技能仓 scripts/skills-registry.json；缺失=空映射→降级基础提示）

// 扩展名→领域硬映射（零漂移硬信号；与 domain.md 信号表职责不同——语义检测归模型，两表互指不合一）
const EXT_DOMAIN = {
  '.tsx': '前端UI', '.jsx': '前端UI', '.vue': '前端UI', '.svelte': '前端UI', '.css': '前端UI', '.scss': '前端UI', '.html': '前端UI',
  '.java': 'Java', '.kt': 'Kotlin', '.py': 'Python', '.js': 'Node', '.ts': 'Node', '.mjs': 'Node',
};
// 测试文件名形态：*.test.* / *.spec.* / *_test.* / test_* / FooTest.java / FooTest.kt（优先于扩展名领域——foo.test.ts 是测试不是 Node）
const isTestFile = (b) => /Test\.java$/.test(b) || /Tests?\.kt$/.test(b) || /(^|[._-])(test|spec)([._-]|$)/i.test(b);
// 需求词粗筛（仅 TF_HINT_PROMPT=on 时启用——无 matcher 每条 prompt 触发，缺省闭）
const PROMPT_HINTS = [
  [/页面|组件|样式|界面|布局|前端/, '前端UI'],
  [/接口|端点|API/, 'API'],
  [/E2E|端到端|测试用例|单测/, '测试'],
];

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function locateTasksDir(cwd) {
  try {
    // stdio 显式三管道（v3.4.0）：缺省配置下 git 的 stderr 直通继承——非 git 项目每次事件漏 fatal 污染诊断视图（冒烟实证）
    const common = execFileSync('git', ['-C', cwd ?? process.cwd(), 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const dir = path.join(path.dirname(common), '.taskflow');
    if (fs.existsSync(dir)) return dir;
  } catch { /* 非 git 目录 */ }
  return null;
}
function guardLog(cwd, gate, action, detail) {
  try {
    if (process.env.TF_GUARD_LOG === 'off') return;
    const dir = locateTasksDir(cwd ?? process.cwd());
    if (!dir) return;
    fs.appendFileSync(path.join(dir, '.guard-log.jsonl'), JSON.stringify({ ts: new Date().toISOString(), gate, action, detail: String(detail ?? '') }) + '\n');
  } catch { /* 日志失败静默 */ }
}

// ---- 去重状态（每会话每领域一次；24h 会话过期修剪）----
function statePath(cwd) {
  const d = locateTasksDir(cwd);
  if (d) return path.join(d, '.hint-state.json');
  let h = 0;
  const s = String(cwd ?? process.cwd());
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return path.join(os.tmpdir(), `taskflow-hint-${(h >>> 0).toString(36)}.json`);
}
function seenBefore(cwd, sessionId, domain) {
  try {
    const st = JSON.parse(fs.readFileSync(statePath(cwd), 'utf8'));
    return !!st?.sessions?.[sessionId]?.domains?.[domain];
  } catch { return false; }
}
function markSeen(cwd, sessionId, domain) {
  try {
    const p = statePath(cwd);
    const now = Date.now();
    let st = { v: 1, sessions: {} };
    try { st = JSON.parse(fs.readFileSync(p, 'utf8')) ?? st; } catch { /* 坏档重建 */ }
    st.sessions = st.sessions && typeof st.sessions === 'object' ? st.sessions : {};
    for (const [sid, e] of Object.entries(st.sessions)) {
      if (!e?.ts || now - e.ts > 24 * 3600 * 1000) delete st.sessions[sid]; // 24h 修剪
    }
    st.sessions[sessionId] = { ts: now, domains: { ...(st.sessions[sessionId]?.domains ?? {}), [domain]: now } };
    const ids = Object.keys(st.sessions);
    if (ids.length > 50) for (const sid of ids.slice(0, ids.length - 50)) delete st.sessions[sid]; // 容量上限
    fs.writeFileSync(p, JSON.stringify(st));
  } catch { /* 状态失败=下次可能重复注入一次，可容忍 */ }
}

// ---- 机械在场检测（DEP_ASK_GATE 机械化；失败=null → 注入降级为基础提示）----
function checkSkills(domain) {
  try {
    const r = spawnSync('node', [SKILL_CLI, 'skills', domain], { encoding: 'utf8', timeout: 10000 });
    const out = String(r.stdout ?? '');
    if (!out) return null;
    const present = [...out.matchAll(/^✓\s+([^\s（(]+)/gm)].map((m) => m[1]);
    const missing = [...out.matchAll(/^✗\s+([^\s（(]+)/gm)].map((m) => m[1]);
    return { present, missing };
  } catch { return null; }
}

// ---- 注入文本（≤500 字符纪律；缺失清单才点名，全部在位不重复列）----
function hintText(domain, signal, check) {
  const ids = DOMAIN_SKILLS && Array.isArray(DOMAIN_SKILLS[domain]) ? DOMAIN_SKILLS[domain] : [];
  const lines = [`[taskflow 提示门] 疑似命中「${domain}」领域（信号：${signal}）。`];
  if (ids.length) lines.push(`映射技能：${ids.join('、')}——按 domain.md 映射应加载并摘要点进 spec 约束节。`);
  else lines.push('技能注册表该领域无登记——映射以 domain.md「领域技能联动」表为准。');
  if (check) {
    if (check.missing.length) lines.push(`在场检测：缺失 ${check.missing.join('、')}——缺失清单呈用户勾选安装（DEP_ASK_GATE 硬规则 22），不装=后续审查如实注记「未经 XX 审查」。`);
    else lines.push('在场检测：全部在位。');
  }
  lines.push('粗筛命中——语义确认按 domain.md 领域检测。');
  return lines.join('');
}
function hintOut(evtName, text) {
  // stdout 纯净纪律：唯一输出=本次 JSON（stdout 前混入任何输出=解析失败注入无效——官方 troubleshooting 点名）
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: evtName, additionalContext: text } }));
}

function domainOf(p) {
  const b = path.basename(String(p));
  if (isTestFile(b)) return '测试';
  return EXT_DOMAIN[path.extname(b).toLowerCase()] ?? null;
}

// ---- 主点位：PostToolUse(Write|Edit|MultiEdit) 扩展名命中 ----
function handlePostToolUse(evt, cwd) {
  if (process.env.TF_HINT === 'off') return;
  const tool = String(evt.tool_name ?? '').toLowerCase();
  if (tool !== 'edit' && tool !== 'write' && tool !== 'multiedit') return;
  const raw = evt.tool_input?.file_path ?? evt.tool_input?.path;
  if (!raw || typeof raw !== 'string') return;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]+:/.test(raw)) return; // 协议地址过滤（与 guard 同款）
  const domain = domainOf(raw);
  if (!domain) return;
  const sessionId = String(evt.session_id ?? '');
  if (!sessionId) return; // 无会话标识无法去重 → 放弃注入（防重复刷屏，宁缺勿滥）
  if (seenBefore(cwd, sessionId, domain)) return;
  const signal = isTestFile(path.basename(String(raw))) ? `测试文件名（${path.basename(raw)}）` : `${path.extname(raw)} 文件写入`;
  markSeen(cwd, sessionId, domain);
  guardLog(cwd, 'domain-hint', 'inject', `${domain}（${signal}）`);
  hintOut('PostToolUse', hintText(domain, signal, checkSkills(domain)));
}

// ---- 辅助点位：UserPromptSubmit 需求词粗筛（TF_HINT_PROMPT=on 才启用）----
function handleUserPromptSubmit(evt, cwd) {
  if (process.env.TF_HINT === 'off') return;
  if (process.env.TF_HINT_PROMPT !== 'on') return;
  const prompt = String(evt.prompt ?? '');
  if (!prompt) return;
  const hit = PROMPT_HINTS.find(([re]) => re.test(prompt));
  if (!hit) return;
  const sessionId = String(evt.session_id ?? '');
  if (!sessionId) return;
  const domain = hit[1];
  if (seenBefore(cwd, sessionId, domain)) return;
  markSeen(cwd, sessionId, domain);
  guardLog(cwd, 'domain-hint', 'inject', `${domain}（需求词粗筛）`);
  hintOut('UserPromptSubmit', hintText(domain, '需求词粗筛', checkSkills(domain)));
}

// ---- 入口：整体吞错（提示门零阻断——任何异常静默退出，绝不影响工具流）----
// main 自检门与 guard 同款：仅直接执行时跑入口；静态 import（门清单报表）零副作用。
// realpath 双向比对（v3.2.0 同款）：符号链环境 path.resolve(argv[1]) 不归一，直接串比对恒错=整门静默。
const isMain = (() => {
  if (!process.argv[1]) return false;
  const a1 = path.resolve(process.argv[1]);
  const me = fileURLToPath(import.meta.url);
  if (a1 === me) return true;
  try { return fs.realpathSync(a1) === fs.realpathSync(me); } catch { return false; }
})();
if (isMain) {
  const evt = readStdinJson();
  if (evt) {
    try {
      const cwd = typeof evt.cwd === 'string' && evt.cwd ? evt.cwd : process.cwd();
      if (evt.hook_event_name === 'PostToolUse') handlePostToolUse(evt, cwd);
      else if (evt.hook_event_name === 'UserPromptSubmit') handleUserPromptSubmit(evt, cwd);
    } catch { /* fail-open：提示门自身故障绝不影响工具流 */ }
  }
  process.exit(0);
}
