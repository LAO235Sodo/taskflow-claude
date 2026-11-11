// index.js — TASKFLOW_GUARD 机制 OpenCode V2 宿主渲染产物（源模板住技能仓 packs/host-adapters/assets/guard/index.js）
// 由 `node tf.mjs mech install TASKFLOW_GUARD` 渲染到项目 .opencode/plugins/taskflow-guard/index.js
// （V2 plugin 目录即装形态：.opencode/plugins/ 自动加载裸目录，无 settings 注册面——探针实证 2026-11-11）。
// 定位：与 claude 线（taskflow-guard-claude.mjs + taskflow-hint-claude.mjs）同一机制家族的 opencode2 薄适配——
//   按宿主用户拍板原则「每个 agent 的注入机制不一样」，事件面全部换 V2 原生通道，判定核心与 claude 线同源：
//   J/G/B  ← ctx.tool.hook("execute.before")，deny = throw（探针实锤：错误文本回给模型、工具不执行、run 正常退出）
//   C      ← ctx.session.hook("compaction")（压缩前落盘，不设 event.result——正常摘要照跑，只旁路落快照）
//   H 主   ← ctx.tool.hook("execute.after")：命中领域 → ①result.content 追加提示文本（探针实锤达模型）
//             ②ctx.skill.transform 事件期晚注册：缺失的映射技能以指针条目注册进技能面（探针实锤 list 可见）
//   H 辅   ← session.hook("prompt") **不移植**：V2 prompt hook 改的是 admission draft（变更会成为持久化用户输入），
//             无 additionalContext 通道——辅助点位在 V2 无干净承载，缺省关升级为不提供（PRD 非目标已申报）。
// G 门 ask 档的 V2 形态（如实申报）：execute.before 合同只有 inspect/replace input，无 UI 级 ask 通道——
//   缺省 ask = deny + 引导呈报（拦下并令模型把边界问题呈用户拍板，批=登记范围后重试），效果等价「人拍板才过」。
// 五门清单真源 = GATE_MANIFEST_OPENCODE2（mechanisms 报表双宿主并列输出）；触发日志同 .taskflow/.guard-log.jsonl
// （gate token 与 claude 线对齐：status-wall/boundary/bookkeeping/compact-relay/domain-hint；ses= 审计键同款）。
// 通用纪律同款：项目无 .taskflow/ 或未采纳 TASKFLOW_GUARD（project.json.mechanisms）= 全门静默；handler 整体吞错
// （fail-open，守门自身故障不阻断用户工具流）；卸载 = 删 .opencode/plugins/taskflow-guard/ 目录 + 清 project.json.mechanisms.TASKFLOW_GUARD。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { STATES, STATE_LEGAL } from '../../../../assets/shared/kernel.mjs';

const STATE_SNAPSHOT = { states: STATES, legal: STATE_LEGAL };
// 渲染期占位（mech install 替换为真值，路径占位带引号形态——渲染后为字符串字面量）；模板形态（被 tf.mjs/测试 import）走 catch 降级。
let SKILL_CLI = 'tf.mjs';
try { SKILL_CLI = '__SKILL_CLI__'; } catch { /* 未渲染（模板形态）——哨兵串无害，checkSkills 仅 hook 期调用 */ }
let DOMAIN_SKILLS = {};
try { DOMAIN_SKILLS = __DOMAIN_SKILLS__; } catch { /* 未渲染（模板形态）——降级空映射 */ }

// 门清单（opencode2 宿主 5 门；双宿主报表与 claude GATE_MANIFEST_CLAUDE 并列，机制透明化口径同源）
export const GATE_MANIFEST_OPENCODE2 = [
  { name: 'J 状态翻转墙', events: 'tool.hook execute.before（edit/write ＋ shell 重定向通道）', envs: ['TF_STATUS'], gate: 'status-wall', what: 'task.json/index.json 的 status/deploy.status 手改=deny（缺省 enforce；翻转唯一写路径=tf.mjs 扳机命令，档案修复走 reconcile --fix）' },
  { name: 'G 编辑边界门', events: 'tool.hook execute.before（edit/write）', envs: ['TF_BOUND'], gate: 'boundary', what: '编辑路径对照任务声明清单，越界=缺省 deny+引导呈报（V2 无 UI 级 ask，模型代问用户拍板）/ enforce deny / off 跳过——单一职责与爆炸半径的机械不变量' },
  { name: 'B 簿记硬拦', events: 'tool.hook execute.before（shell）', envs: ['TF_BASH'], gate: 'bookkeeping', what: 'commit --files 空格分隔多文件=deny（逗号分隔才对）；红线 git（reset --hard/checkout --/clean -f/force push/branch -D）=deny（纪律①机械化）' },
  { name: 'C 压缩接力', events: 'session.hook compaction', envs: [], gate: 'compact-relay', what: '压缩前对 active/verifying 任务落 compact-relay.md 接力注记（铁律「先存档再跑」机械化；恢复靠 resume 读档案）' },
  { name: 'H 领域提示门', events: 'tool.hook execute.after（write/edit）', envs: ['TF_HINT'], gate: 'domain-hint', what: '领域硬信号命中→result.content 追加领域提示+映射技能清单+机械在场检测，缺失技能以指针条目注册进技能面；永不 deny，fail-open；去重=每会话每领域一次' },
];

// ---- 判定核心（与 claude 线逐字节同源；工具入参名做 V2 容差：path|file_path、oldString|old_string）----

function readJsonSafe(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function locateTasksDir(cwd) {
  try {
    const common = spawnSync('git', ['-C', cwd ?? process.cwd(), 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const common2 = String(common.stdout ?? '').trim();
    if (!common2 || common.status !== 0) return null;
    const dir = path.join(path.dirname(common2), '.taskflow');
    if (fs.existsSync(dir)) return dir;
  } catch { /* 非 git 目录 */ }
  return null;
}
function guardOn(cwd) {
  try {
    const d = locateTasksDir(cwd);
    if (!d) return false;
    const j = JSON.parse(fs.readFileSync(path.join(d, 'project.json'), 'utf8'));
    return !!j?.mechanisms?.TASKFLOW_GUARD;
  } catch { return false }
}
// 路径基归一（与 claude/omp 同款：git 真实路径 ↔ resolve 符号链接统一，symlink 环境比对恒错实证）
const realPath = (p) => { let cur = p; const suffix = []; for (;;) { try { return path.join(fs.realpathSync(cur), ...suffix); } catch { /* 该层不存在，上爬 */ } suffix.unshift(path.basename(cur)); const parent = path.dirname(cur); if (parent === cur) return p; cur = parent; } };

function guardLog(cwd, gate, action, detail) {
  try {
    if (process.env.TF_GUARD_LOG === 'off') return;
    const dir = locateTasksDir(cwd ?? process.cwd());
    if (!dir) return;
    fs.appendFileSync(path.join(dir, '.guard-log.jsonl'), JSON.stringify({ ts: new Date().toISOString(), gate, action, detail: String(detail ?? '') }) + '\n');
  } catch { /* 日志失败静默 */ }
}

// ---- J 状态翻转墙核心判定（与 omp/claude judgeStatusFlip 同源；toolName ∈ write|edit|multiedit）----
function judgeStatusFlip(abs, toolName, input) {
  const oldJ = readJsonSafe(abs);
  const toText = () => {
    if (toolName === 'write') return typeof input?.content === 'string' ? input.content : null;
    const disk = (() => { try { return fs.readFileSync(abs, 'utf8'); } catch { return null; } })();
    if (disk === null) return null;
    if (toolName === 'multiedit' && Array.isArray(input?.edits)) {
      let cur = disk;
      for (const e of input.edits) {
        const o = e?.old_string ?? e?.oldString; const n = e?.new_string ?? e?.newString;
        if (typeof o !== 'string' || typeof n !== 'string') return null;
        cur = cur.split(o).join(n);
      }
      return cur;
    }
    const os2 = input?.old_string ?? input?.oldString; const ns2 = input?.new_string ?? input?.newString;
    if (typeof os2 !== 'string' || typeof ns2 !== 'string') return null;
    return disk.split(os2).join(ns2); // edit 语义模拟：字面替换（替换不命中=新内容=旧内容=放行）
  };
  let newJ = null;
  try { newJ = JSON.parse(toText()); } catch { /* 坏 JSON */ }
  const show = (v) => (v === undefined || v === null ? '（无）' : String(v));
  const tail = `违规（data.md 状态机表：翻转唯一写路径 commit --deployed / accept --pass / park / unpark / archive；档案修复走 node tf.mjs reconcile --fix）。会话级豁免：启动 OpenCode 前 export TF_STATUS=off`;
  if (!newJ || typeof newJ !== 'object') {
    return `TASKFLOW_GUARD 状态翻转墙：${abs} 新内容解析失败（坏档案）——${tail}`;
  }
  const fromS = oldJ?.status; const toS = newJ.status;
  const fromD = oldJ?.deploy?.status; const toD = newJ.deploy?.status;
  if (!oldJ) { // 新建档案：仅 status=active（且不带 verifying 部署态）放行
    if (toS === 'active' && toD !== 'verifying') return null;
    return `TASKFLOW_GUARD 状态翻转墙：${abs} 新建档案 status ${show(toS)} 非法（仅 active 可建档）——${tail}`;
  }
  if (fromS === toS && fromD === toD) return null; // 无翻转
  const flips = [];
  if (fromS !== toS) flips.push(`status ${show(fromS)}→${show(toS)}`);
  if (fromD !== toD) flips.push(`deploy.status ${show(fromD)}→${show(toD)}`);
  const legal = STATE_SNAPSHOT.legal.some(([f, t]) => f === fromS && t === toS);
  return `TASKFLOW_GUARD 状态翻转墙：${abs} ${flips.join(' + ')} ${legal ? '' : '（该翻转亦不在状态机白名单）'}——${tail}`;
}

// ---- B1 commit --files 空格分隔（与 omp/claude spaceSeparatedFiles 同源）----
function spaceSeparatedFiles(cmd) {
  const at = cmd.indexOf('--files');
  if (at === -1) return false;
  const toks = cmd.slice(at + '--files'.length).trim().split(/\s+/);
  const files = [];
  for (const t of toks) {
    if (t.startsWith('-')) break;
    if (/[|>&;()]/.test(t)) break; // shell 控制符 = --files 值已结束（同款防误拦）
    files.push(t);
  }
  return files.length > 1;
}

// ---- B2 红线 git 命令（SKILL.md 纪律①机械化；--force-with-lease 豁免）----
const REDLINE_RES = [
  { re: /\bgit\s+reset\s+--hard\b/, why: 'git reset --hard（丢弃式重置，未提交改动不可恢复）' },
  { re: /\bgit\s+checkout\s+(?:[^\s;&|]+\s+)?--(?:\s|$)/, why: 'git checkout -- <路径>（丢弃工作区改动，不可恢复）' },
  { re: /\bgit\s+clean\s+(?=[^\s;&|]*-f)/, why: 'git clean -f（强制删除未跟踪文件，不可恢复）' },
  { re: /\bgit\s+push\s+(?![^;&|]*--force-with-lease)[^;&|]*(?:\s--force(?:\s|$)|\s-f(?:\s|$)|\s\+\S+)/, why: 'force push（改写远端历史；确需用 --force-with-lease）' },
  { re: /\bgit\s+branch\s+[^\s;&|]*D/, why: 'git branch -D（硬删分支绕过 -d 已合并校验；任务分支收尾用 -d）' },
];

// ---- G 编辑边界门声明清单收集（与 omp/claude collectDeclaredFiles 同源）----
const expandBraces = (p) => {
  const m = p.match(/^(.*?)\{([^{}]*)\}(.*)$/s);
  if (!m) return [p];
  return m[2].split(',').flatMap((alt) => expandBraces(m[1] + alt.trim() + m[3]));
};
function extractSectionBody(md, nameRe) {
  const lines = md.split('\n');
  let inSec = false;
  const body = [];
  for (const ln of lines) {
    if (/^##\s/.test(ln)) {
      if (inSec) break;
      inSec = nameRe.test(ln.replace(/^##\s+/, ''));
      continue;
    }
    if (inSec) body.push(ln);
  }
  return body.join('\n');
}
function collectDeclaredFiles(taskDir) {
  const out = new Set();
  const readSafe = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
  const addFromSection = (md, secRe) => {
    for (const lnRaw of extractSectionBody(md, secRe).split('\n')) {
      if (/明确不做|禁止|不含|不涉及|负面/.test(lnRaw)) continue; // 负面清单行排除（入清单=放行禁改文件）
      for (const ln of expandBraces(lnRaw)) {
        const m = ln.match(/^\s*[-*]\s+`?([^\s`（(，,：:]+)/);
        if (m) {
          const p = m[1].replace(/^\.\//, '').replace(/\/+$/, '');
          if (p && !p.startsWith('<') && !/^\*\*.*\*\*$/.test(p)) out.add(p);
        }
        if (/改动文件|涉及文件|正向清单|文件集合|声明/.test(ln)) {
          for (const q of ln.matchAll(/`([^`\s]+)`/g)) {
            const p = q[1].replace(/^\.\//, '').replace(/\/+$/, '');
            if (p.includes('/') || /\.[A-Za-z0-9]+$/.test(p)) out.add(p);
          }
        }
      }
    }
  };
  const specMd = readSafe(path.join(taskDir, 'spec.md'));
  if (specMd) {
    addFromSection(specMd, /^边界与影响面(\s|$|（)/);
    addFromSection(specMd, /^涉及文件(\s|$|（)/);
  }
  const subRoot = path.join(taskDir, 'subtasks');
  let subs = [];
  try { subs = fs.readdirSync(subRoot, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { /* 无子任务 */ }
  for (const d of subs) addFromSection(readSafe(path.join(subRoot, d.name, 'spec.md')), /^涉及文件(\s|$|（)/);
  return [...out];
}

// ---- V2 deny 通道（探针实锤：execute.before throw → 错误文本回给模型，工具不执行）----
class GateDeny extends Error {}
const deny = (why) => { throw new GateDeny(why); };

// ---- J/G/B 的 execute.before 分派（纯函数化：返回 deny 文案由 hook 层 throw——机械测试与生产同一分派路径）----
// 入参 evt 按 V2 事件形（probe 实证 keys: tool/sessionID/agent/messageID/id/input）；
// 返回 null=放行；返回字符串=deny 文案（hook 层 guardLog 后 throw）。
function beforeTool(evt, cwd) {
  if (!guardOn(cwd)) return null;
  const tool = String(evt?.tool ?? '').toLowerCase();
  const input = evt?.input ?? {};
  if (tool === 'shell' || tool === 'bash') {
    const cmd = String(input.command ?? '');
    if (!cmd) return null;
    // J bash 通道（与 claude 同款）：重定向/tee/sed -i 触及任务档案且非 tf.mjs = 疑似手改 status
    if (!cmd.includes('tf.mjs') && /(>|>>|\btee\s|\bsed\s+-i)[^|;&]*(task\.json|index\.json)/.test(cmd)) {
      const modeJ = process.env.TF_STATUS;
      if (modeJ !== 'off' && locateTasksDir(cwd)) {
        guardLog(cwd, 'status-wall', modeJ === 'warn' ? 'warn' : 'enforce', 'bash 重定向/tee/sed 触及任务档案');
        return `TASKFLOW_GUARD 状态翻转墙：bash 重定向/tee/sed 触及任务档案（task.json/index.json）——手改 status = 违规（data.md 状态机表：翻转唯一写路径 commit --deployed / accept --pass / park / unpark / archive；档案修复走 node tf.mjs reconcile --fix）。会话级豁免：启动前 export TF_STATUS=off`;
      }
    }
    // B1：commit --files 空格分隔（无档位——格式错就是错）
    if (cmd.includes('tf.mjs') && spaceSeparatedFiles(cmd)) {
      guardLog(cwd, 'bookkeeping', 'enforce', 'commit --files 空格分隔多文件');
      return '命令已拦下，格式错了：tf.mjs commit --files 的多个文件要用逗号分隔（正确写法：--files a.md,b.md），用空格分隔时只有第一个文件会被登记进档案（历史上多次踩过这个坑）。把空格改成逗号后重试。';
    }
    // B2：红线 git（tf.mjs 自身命令放行——其内部分支操作经安全路径）
    if (!cmd.includes('tf.mjs') && /\bgit\s+/.test(cmd)) {
      const hit = REDLINE_RES.find((r) => r.re.test(cmd));
      if (hit) {
        const modeB = process.env.TF_BASH;
        if (modeB !== 'off') {
          guardLog(cwd, 'bookkeeping', modeB === 'warn' ? 'warn' : 'enforce', `红线命令拦截：${hit.why}`);
          return `TASKFLOW_GUARD 簿记硬拦：检测到红线命令——${hit.why}（SKILL.md 纪律①：禁 reset --hard / checkout -- / clean -f / force push / 共享分支 -D）。确属有意（与用户确认后）：本条命令改用前置环境变量 TF_BASH=off 执行（单次豁免，会留痕），并在 progress.md 记一行原因。`;
        }
      }
    }
    return null;
  }
  if (tool !== 'edit' && tool !== 'write' && tool !== 'multiedit') return null;
  const raw = input.path ?? input.file_path;
  if (!raw || typeof raw !== 'string') return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]+:/.test(raw)) return null; // 协议地址过滤（与 omp/claude 同款）
  const rawN = (raw === '~' || raw.startsWith('~/') || raw.startsWith('~\\')) ? path.join(os.homedir(), raw.slice(1)) : raw; // 波浪号展开
  const dir = locateTasksDir(cwd);
  if (!dir) return null; // 零干扰边界
  const mainRoot = realPath(path.dirname(dir));
  const abs = realPath(path.resolve(cwd ?? process.cwd(), rawN));
  // J 状态翻转墙：先于边界门（边界门簿记白名单会放行 .taskflow 内编辑，status 手改必须先拦）
  const bname = path.basename(abs);
  if ((bname === 'task.json' || bname === 'index.json') && abs.startsWith(dir + path.sep)) {
    const whyJ = judgeStatusFlip(abs, tool, input);
    if (whyJ) {
      const modeJ = process.env.TF_STATUS;
      if (modeJ !== 'off') {
        guardLog(cwd, 'status-wall', modeJ === 'warn' ? 'warn' : 'enforce', `状态手改拦截：${path.basename(path.dirname(abs))}/${bname}`);
        return whyJ;
      }
    }
  }
  // G 编辑边界门（归属判定与 claude 同源：worktree 前缀/兄弟子任务 worktree/主仓库并集比对）
  const idx = readJsonSafe(path.join(dir, 'index.json'))?.tasks ?? [];
  const live = idx.filter((t) => t?.status === 'active' || t?.status === 'verifying');
  if (!live.length) return null;
  let owner = null; let base = null;
  for (const t of live) {
    const rawW = typeof t.worktree === 'string' && t.worktree ? t.worktree : readJsonSafe(path.join(dir, t.id, 'task.json'))?.worktree;
    if (typeof rawW !== 'string' || !rawW) continue; // 幽灵 worktree 防护（同款）
    const w = realPath(rawW);
    if (abs === w || abs.startsWith(w + path.sep)) { owner = t; base = w; break; }
    const sib = abs.startsWith(w + '-') ? abs.slice(w.length + 1) : '';
    if (sib && /^\d+-/.test(sib)) {
      const cut = abs.indexOf(path.sep, w.length + 1);
      owner = t; base = cut === -1 ? abs : abs.slice(0, cut);
      break;
    }
  }
  const boundWhy = (why) => {
    const modeU = process.env.TF_BOUND;
    if (modeU === 'off') return null;
    guardLog(cwd, 'boundary', modeU === 'enforce' ? 'enforce' : 'ask', why.slice(0, 120));
    // V2 无 UI 级 ask（如实申报）：缺省档=deny+引导呈报，模型把边界问题呈用户拍板——批=登记范围后重试
    return why;
  };
  if (!owner) {
    if (abs !== mainRoot && !abs.startsWith(mainRoot + path.sep)) return null; // 主仓库与任何 worktree 之外 → 零干扰
    const union = new Set();
    for (const t of live) for (const p of collectDeclaredFiles(path.join(dir, t.id))) union.add(p);
    if (!union.size) return null;
    const relU = path.relative(mainRoot, abs);
    if (!relU || relU.startsWith('..')) return null;
    if (relU === '.taskflow' || relU.startsWith('.taskflow/') || relU.startsWith('.opencode/plugins/') || path.basename(relU) === '.owner.json') return null; // 簿记白名单（含本 guard 渲染位）
    if ([...union].some((d) => relU === d || relU.startsWith(d.endsWith('/') ? d : d + '/'))) return null;
    return boundWhy(`TASKFLOW_GUARD G 编辑边界门：${relU} 不在任何进行中任务（${live.map((t) => t.id).join('、')}）声明的改动清单里（各任务清单 = 任务说明书 spec 的「边界与影响面」+ 各子任务「涉及文件」的合计）。主仓库检出区应保持干净、只作合并落点——请先确定这个文件归属哪个任务：到对应 worktree 里开工，或把路径加进该任务 spec 清单并跑 node tf.mjs req-confirm（范围变更登记）留痕。不要自行继续编辑：先把这条边界问题原样呈报用户拍板，批=登记范围后重试，拒=放弃本次编辑。`);
  }
  const rel = path.relative(base, abs);
  if (!rel || rel.startsWith('..')) return null;
  if (rel === '.taskflow' || rel.startsWith('.taskflow/') || rel.startsWith('.opencode/plugins/') || path.basename(rel) === '.owner.json') return null; // 簿记白名单
  const declared = collectDeclaredFiles(path.join(dir, owner.id));
  if (!declared.length) return null; // 无清单可对照（未落 spec 的旧任务）→ 零干扰
  const hit = declared.some((d) => rel === d || rel.startsWith(d.endsWith('/') ? d : d + '/'));
  if (hit) return null;
  return boundWhy(`TASKFLOW_GUARD G 编辑边界门：${rel} 不在任务 ${owner.id} 开工时声明的改动清单里（清单 = spec「边界与影响面」+ 各子任务「涉及文件」合计）——这条纪律是为了让一个任务只做一件事、出问题好回滚。确实需要改：先把路径加进 spec 对应清单，再跑 node tf.mjs req-confirm 登记范围变更。不要自行继续编辑：先把这条边界问题原样呈报用户拍板，批=登记范围后重试，拒=放弃本次编辑。`);
}

// ---- C 压缩接力（与 claude handlePreCompact 同源：active/verifying 任务逐个落 compact-relay.md）----
function handleCompaction(cwd) {
  if (!guardOn(cwd)) return;
  const dir = locateTasksDir(cwd);
  if (!dir) return;
  const idx = readJsonSafe(path.join(dir, 'index.json'))?.tasks ?? [];
  const live = idx.filter((t) => t?.status === 'active' || t?.status === 'verifying');
  if (!live.length) return;
  const readSafe = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
  for (const row of live) {
    const tj = readJsonSafe(path.join(dir, row.id, 'task.json'));
    if (!tj) continue;
    const cps = Array.isArray(tj.checkpoints) ? tj.checkpoints : [];
    const lastCp = cps[cps.length - 1];
    const prog = readSafe(path.join(dir, row.id, 'progress.md'));
    const progTail = prog ? prog.split('\n').filter((l) => l.trim()).slice(-6).join('\n') : '';
    const hand = readSafe(path.join(dir, row.id, 'handoff.md'));
    const nextSec = (() => {
      const lines = hand.split('\n');
      let inNext = false; const out = [];
      for (const ln of lines) {
        if (/^##\s/.test(ln)) { inNext = /^##\s*下一步/.test(ln); continue; }
        if (inNext && ln.trim()) out.push(ln);
      }
      return out.slice(0, 20).join('\n');
    })();
    const relay = [
      `# 压缩接力注记（compaction hook 自动落盘 ${new Date().toISOString()}——压缩摘要不可靠时以本文件与各档案为准）`,
      '',
      `- 任务：${tj.id}（${tj.status ?? row.status ?? '?'}）｜标题：${tj.title ?? ''}`,
      `- 分支：${tj.branch ?? '?'}｜worktree：${tj.worktree ?? '（无）'}｜anchor：${tj.anchor ?? '?'}`,
      `- 最近 checkpoint：${lastCp ? `${lastCp.at ?? ''} ${lastCp.summary ?? ''}` : '（无）'}`,
      '',
      '## progress 尾部',
      progTail || '（空）',
      '',
      '## handoff 下一步（恢复后第一动作以此为准）',
      nextSec || '（handoff 无「下一步」节——读 handoff.md 全文）',
      '',
      '恢复入口：新会话点名 taskflow 或直接 node tf.mjs ls；本文件为机器快照，叙事事实源仍是 spec/progress/handoff。',
    ].join('\n') + '\n';
    try { fs.writeFileSync(path.join(dir, row.id, 'compact-relay.md'), relay); } catch { /* 单任务失败不拦压缩 */ }
  }
  guardLog(cwd, 'compact-relay', 'write', `压缩前落接力注记：${live.map((t) => t.id).join('、')}`);
}

// ---- H 领域提示门：信号面/去重/在场检测（与 claude hint 同源；注入与注册通道换 V2 形）----
const EXT_DOMAIN = {
  '.tsx': '前端UI', '.jsx': '前端UI', '.vue': '前端UI', '.svelte': '前端UI', '.css': '前端UI', '.scss': '前端UI', '.html': '前端UI',
  '.java': 'Java', '.kt': 'Kotlin', '.py': 'Python', '.js': 'Node', '.ts': 'Node', '.mjs': 'Node',
};
const isTestFile = (b) => /Test\.java$/.test(b) || /Tests?\.kt$/.test(b) || /(^|[._-])(test|spec)([._-]|$)/i.test(b);
function domainOf(p) {
  const b = path.basename(String(p));
  if (isTestFile(b)) return '测试';
  return EXT_DOMAIN[path.extname(b).toLowerCase()] ?? null;
}
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
// ---- 机械在场检测（失败=null → 注入降级为基础提示）----
function checkSkills(domain) {
  try {
    const r = spawnSync('node', [SKILL_CLI, 'skills', domain], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] });
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
// ---- H 主点位分派（纯函数化）：返回 { append, register } 由 hook 层执行（机械测试同路径）----
// append=追加进 result.content 的提示文本（null=不注入）；register=需指针注册的缺失技能 id 清单。
function afterTool(evt, cwd) {
  if (process.env.TF_HINT === 'off') return { append: null, register: [] };
  const tool = String(evt?.tool ?? '').toLowerCase();
  if (tool !== 'edit' && tool !== 'write' && tool !== 'multiedit') return { append: null, register: [] };
  const input = evt?.input ?? {};
  const raw = input.path ?? input.file_path;
  if (!raw || typeof raw !== 'string') return { append: null, register: [] };
  if (/^[a-zA-Z][a-zA-Z0-9+.-]+:/.test(raw)) return { append: null, register: [] }; // 协议地址过滤
  if (String(evt?.status ?? 'completed') !== 'completed') return { append: null, register: [] }; // 只注入成功结果
  const domain = domainOf(raw);
  if (!domain) return { append: null, register: [] };
  const sessionId = String(evt?.sessionID ?? '');
  if (!sessionId) return { append: null, register: [] }; // 无会话标识无法去重 → 放弃注入（宁缺勿滥）
  if (seenBefore(cwd, sessionId, domain)) return { append: null, register: [] };
  const signal = isTestFile(path.basename(String(raw))) ? `测试文件名（${path.basename(raw)}）` : `${path.extname(raw)} 文件写入`;
  markSeen(cwd, sessionId, domain);
  guardLog(cwd, 'domain-hint', 'inject', `${domain}（${signal}）｜ses=${sessionId.slice(0, 8)}`); // ses= 审计键（hint-stats 兼容）
  const check = checkSkills(domain);
  const ids = DOMAIN_SKILLS && Array.isArray(DOMAIN_SKILLS[domain]) ? DOMAIN_SKILLS[domain] : [];
  const register = check && Array.isArray(check.missing) ? ids.filter((id) => check.missing.includes(id)) : [];
  return { append: hintText(domain, signal, check), register };
}

// ---- plugin 装配：V2 默认导出（目录即装；每注册独立吞错——单门注册失败不拖垮其余门）----
// ---- 验收命令（v3.8.0 US-OC2-03 验收清单机械化）：/taskflow-verify 向会话注入验收走查工作流 ----
// 承载 taskflow 验收纪律（验收标准逐条真跑 + 使用者视角检查 + 影响面→验证转化落 verification-report），
// 产物对齐既有验收载体（templates/verification-report.md → .taskflow/<id>/verification-report.md；accept/merge 前置确认回执走 tf.mjs confirm），不另造平行体系。
const VERIFY_PROMPT = `【taskflow 验收走查】按以下流程对当前任务做验收前走查，全程纪律以 taskflow 为准：
1. 读 .taskflow/ 找 active/verifying 任务（node __SKILL_CLI__ ls）；多任务时先问用户走查哪个。
2. 对该任务 spec「验收标准」逐条执行「验证」栏命令/方法，实测留证（禁目测宣称通过）；失败项进修复循环。
3. 使用者视角连带检查：列出本次改动触达的使用者触点（入口/文案/交互步骤/边界态/加载与错误态）与顺带易用性观察——观察只列不做，取舍归用户。
4. 影响面→验证转化：spec「影响面地图」每个下游消费方必须有对应验证动作行（实测证据或「未覆盖——原因」），禁以「代码零接触」替代下游实测。
5. 产物落档：按 templates/verification-report.md 结构写 .taskflow/<id>/verification-report.md（逐条判定 + 未覆盖清单呈用户）。
6. 收尾呈报验收简报（结论先行 ≤5 行）；验收通过由用户拍板后走 accept/merge 流程（确认回执 = node __SKILL_CLI__ confirm <task-id> --note "<用户确认原话>"）`;

let lateRegistered = new Set(); // 指针注册进程内去重（跨 .hint-state.json 之外的运行期幂等）
export default {
  id: 'taskflow-guard',
  async setup(ctx) {
    const hookErr = (gate, e) => { try { guardLog(process.cwd(), gate, 'hook-error', String(e?.message ?? e).slice(0, 120)); } catch {} };
    // 验收命令注册（US-OC2-03；探针实证 command.transform 注册进命令面——ctx.command.list 与内建并列）
    try {
      await ctx.command.transform((editor) => {
        editor.add({
          name: 'taskflow-verify',
          description: 'taskflow 验收走查：验收标准逐条真跑 + 使用者视角检查 + 落 verification-report（accept/merge 前跑）',
          execute: async (input) => {
            try {
              await ctx.session.prompt({ sessionID: input.sessionID, text: VERIFY_PROMPT.replaceAll('__SKILL_CLI__', SKILL_CLI), delivery: input.delivery ?? 'steer' });
            } catch (e) { hookErr('verify-cmd', e); }
          },
        });
      });
    } catch (e) { hookErr('verify-cmd', e); }
    // J/G/B：execute.before——deny = throw GateDeny（探针实锤 deny 合同）
    try {
      await ctx.tool.hook('execute.before', (event) => {
        try {
          const cwd = process.cwd();
          const why = beforeTool(event, cwd);
          if (why) deny(why);
        } catch (e) {
          if (e instanceof GateDeny) throw e; // deny 原样上抛（模型见门文案）
          hookErr('guard', e); // fail-open：守门自身故障不阻断用户工具流
        }
      });
    } catch (e) { hookErr('guard', e); }
    // H 主点位：execute.after——result.content 追加提示 + 缺失技能指针注册（双通道探针实锤）
    try {
      await ctx.tool.hook('execute.after', async (event) => {
        try {
          const cwd = process.cwd();
          const r = afterTool(event, cwd);
          if (r.append && event?.result && Array.isArray(event.result.content)) {
            event.result.content.push({ type: 'text', text: r.append });
          }
          if (r.register.length && ctx.skill?.transform) {
            for (const id of r.register) {
              if (lateRegistered.has(id)) continue;
              try {
                await ctx.skill.transform((editor) => {
                  editor.add({
                    id,
                    name: id,
                    description: `（taskflow 提示门指针）真身未安装——映射与装法见 domain.md「领域技能联动」；安装后以真身为准（DEP_ASK_GATE 硬规则 22）`,
                    path: process.cwd(),
                    content: `技能 ${id} 未安装的指针条目（taskflow 提示门注册）。按 domain.md 映射应加载该领域技能；请向用户呈报缺失清单并勾选安装（DEP_ASK_GATE 硬规则 22），不装=后续审查如实注记。`,
                  });
                });
                lateRegistered.add(id);
              } catch (e) { hookErr('domain-hint', e); } // 指针注册失败降级为纯提示文本
            }
          }
        } catch (e) { hookErr('domain-hint', e); }
      });
    } catch (e) { hookErr('domain-hint', e); }
    // C：压缩接力——只旁路落盘，不设 event.result（正常摘要照跑）
    try {
      await ctx.session.hook('compaction', async () => {
        try { handleCompaction(process.cwd()); } catch (e) { hookErr('compact-relay', e); }
      });
    } catch (e) { hookErr('compact-relay', e); }
  },
}

// ---- 机械测试面（金丝雀①/单测与生产同一分派路径；导入零副作用——本模块无 stdin 入口）----
export const __test = {
  GATE_MANIFEST: GATE_MANIFEST_OPENCODE2,
  judgeStatusFlip,
  spaceSeparatedFiles,
  REDLINE_RES,
  collectDeclaredFiles,
  domainOf,
  hintText,
  seenBefore,
  markSeen,
  beforeTool,
  afterTool,
};
