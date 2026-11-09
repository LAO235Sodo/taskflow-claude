// taskflow-guard-claude.mjs — TASKFLOW_GUARD 机制 Claude Code 宿主渲染产物（源模板住技能仓 assets/guard/）
// 由 `node tf.mjs mech install TASKFLOW_GUARD` 渲染到项目 .claude/hooks/，并在项目 .claude/settings.json
// 幂等注册 hooks（PreToolUse matcher Edit|Write|MultiEdit 与 Bash 各一条 + PreCompact 一条）。
// 定位：与 omp 版 taskflow-guard.js 同一机制家族的 Claude Code 薄适配（pi/taskflow.ts 先例同路线）——
//   把关键规则降到宿主层（模型绕不过），只移植 4 个高价值门，其余门留纯纪律档（conventions 红线 + doctor 承载）：
//
//   J 状态翻转墙  PreToolUse(Edit|Write|MultiEdit)：task.json/index.json 的 status/deploy.status 手改 = deny
//                 （TF_STATUS 三档，缺省 enforce，与 omp 同档；翻转唯一合法写路径 = tf.mjs 扳机命令，
//                 档案修复走 reconcile --fix）＋ Bash 通道：重定向/tee/sed -i 触及任务档案且非 tf.mjs = 同墙。
//                 判定核心 judgeStatusFlip 与 omp 逐字节同源（翻转前后语义比对，新建档案仅 status=active 放行）。
//   G 编辑边界门  PreToolUse(Edit|Write|MultiEdit)：编辑路径归属任务后对照声明清单（spec「边界与影响面」+
//                 subtasks「涉及文件」）——越界档位映射：omp 默认 warn（不拦）→ Claude Code 缺省 `ask`
//                 （弹给用户拍板——「验收拍板归人」，人批即过，比静默注入强）；TF_BOUND=enforce 硬拦 / off 单次跳过。
//   B 簿记硬拦    PreToolUse(Bash)：①`tf.mjs commit --files` 空格分隔多文件=deny（与 omp B1 同源判定）；②红线
//                 git 命令（reset --hard / checkout -- / clean -f / force push（--force-with-lease 豁免）/
//                 branch -D）=deny（SKILL.md 纪律①的机械化——omp 侧无此通道，Claude Code Bash 面更宽故补齐）；
//                 TF_BASH=off 单次豁免（留痕）。③J bash 通道见上（归 J 墙）。
//   C 压缩接力    PreCompact：压缩前对每个 active/verifying 任务落 checkpoint 级接力注记
//                 `.taskflow/<id>/compact-relay.md`（任务 id/状态/分支/worktree + 最近 checkpoint + progress 尾部
//                 + handoff 下一步）——「先存档再跑」铁律的机械化（omp 的 session.compacting 是向摘要注入线索，
//                 Claude Code PreCompact 无注入通道，改为落盘快照，恢复靠 resume 读档案）。
//
// 通用纪律（与 omp 版同款）：项目无 `.taskflow/` 或未采纳 TASKFLOW_GUARD（project.json.mechanisms）= 全门静默；
// handler 整体吞错——Claude Code hook 抛错=exit≠0 会阻断工具，绝不允许；触发写 .taskflow/.guard-log.jsonl
// （TF_GUARD_LOG=off 关；gate token 与 omp 版对齐：status-wall/boundary，新增 bookkeeping/compact-relay）。
// 卸载 = 删 .claude/hooks/taskflow-guard-claude.mjs + 清 settings.json 中 command 含本文件名的 hook 条目
// + 清 project.json.mechanisms.TASKFLOW_GUARD。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STATES, STATE_LEGAL } from '../../../../assets/shared/kernel.mjs';

// 门清单（Claude 宿主 4 门；机制透明化口径同 omp GATE_MANIFEST——mechanisms 报表暂只挂 omp 全集，本数组供文档与测试对账）
export const GATE_MANIFEST_CLAUDE = [
  { name: 'J 状态翻转墙', events: 'PreToolUse（Edit/Write/MultiEdit）＋ PreToolUse（Bash 重定向通道）', envs: ['TF_STATUS'], gate: 'status-wall', what: 'task.json/index.json 的 status/deploy.status 手改=deny（缺省 enforce；翻转唯一写路径=tf.mjs 扳机命令，档案修复走 reconcile --fix）' },
  { name: 'G 编辑边界门', events: 'PreToolUse（Edit/Write/MultiEdit）', envs: ['TF_BOUND'], gate: 'boundary', what: '编辑路径对照任务声明清单，越界=缺省 ask 弹用户拍板 / enforce deny / off 跳过——单一职责与爆炸半径的机械不变量' },
  { name: 'B 簿记硬拦', events: 'PreToolUse（Bash）', envs: ['TF_BASH'], gate: 'bookkeeping', what: 'commit --files 空格分隔多文件=deny（逗号分隔才对）；红线 git（reset --hard/checkout --/clean -f/force push/branch -D）=deny（纪律①机械化）' },
  { name: 'C 压缩接力', events: 'PreCompact', envs: [], gate: 'compact-relay', what: '压缩前对 active/verifying 任务落 compact-relay.md 接力注记（铁律「先存档再跑」机械化；恢复靠 resume 读档案）' },
];

const STATE_SNAPSHOT = { states: STATES, legal: STATE_LEGAL };
const HOOK_NAME = 'taskflow-guard-claude.mjs';

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function readJsonSafe(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function locateTasksDir(cwd) {
  try {
    const common = execFileSync('git', ['-C', cwd ?? process.cwd(), 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
    const dir = path.join(path.dirname(common), '.taskflow');
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
  } catch { return false; }
}
// 路径基归一（与 omp 版同款：git 真实路径 ↔ resolve 符号链接统一，symlink 环境比对恒错实证）
const realPath = (p) => { let cur = p; const suffix = []; for (;;) { try { return path.join(fs.realpathSync(cur), ...suffix); } catch { /* 该层不存在，上爬 */ } suffix.unshift(path.basename(cur)); const parent = path.dirname(cur); if (parent === cur) return p; cur = parent; } };

function guardLog(cwd, gate, action, detail) {
  try {
    if (process.env.TF_GUARD_LOG === 'off') return;
    const dir = locateTasksDir(cwd ?? process.cwd());
    if (!dir) return;
    fs.appendFileSync(path.join(dir, '.guard-log.jsonl'), JSON.stringify({ ts: new Date().toISOString(), gate, action, detail: String(detail ?? '') }) + '\n');
  } catch { /* 日志失败静默 */ }
}

// ---- Claude Code hook 输出合同：deny/ask 走 JSON stdout（exit 0；非零 exit=阻断工具，禁止）----
function denyPre(reason) {
  console.log(JSON.stringify({
    decision: 'block', reason,
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
}
function askPre(reason) {
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason },
  }));
}

// ---- J 状态翻转墙核心判定（与 omp taskflow-guard.js judgeStatusFlip 逐字节同源，工具入参名换 Claude 形）----
function judgeStatusFlip(abs, toolName, input) {
  const oldJ = readJsonSafe(abs);
  const toText = () => {
    if (toolName === 'write') return typeof input?.content === 'string' ? input.content : null;
    const disk = (() => { try { return fs.readFileSync(abs, 'utf8'); } catch { return null; } })();
    if (disk === null) return null;
    if (toolName === 'multiedit' && Array.isArray(input?.edits)) {
      let cur = disk;
      for (const e of input.edits) {
        if (typeof e?.old_string !== 'string' || typeof e?.new_string !== 'string') return null;
        cur = cur.split(e.old_string).join(e.new_string);
      }
      return cur;
    }
    const os2 = input?.old_string; const ns2 = input?.new_string;
    if (typeof os2 !== 'string' || typeof ns2 !== 'string') return null;
    return disk.split(os2).join(ns2); // edit 语义模拟：字面替换（替换不命中=新内容=旧内容=放行）
  };
  let newJ = null;
  try { newJ = JSON.parse(toText()); } catch { /* 坏 JSON */ }
  const show = (v) => (v === undefined || v === null ? '（无）' : String(v));
  const tail = `违规（data.md 状态机表：翻转唯一写路径 commit --deployed / accept --pass / park / unpark / archive；档案修复走 node tf.mjs reconcile --fix）。会话级豁免：启动 Claude Code 前 export TF_STATUS=off`;
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

// ---- B1 commit --files 空格分隔（与 omp spaceSeparatedFiles 同源）----
function spaceSeparatedFiles(cmd) {
  const at = cmd.indexOf('--files');
  if (at === -1) return false;
  const toks = cmd.slice(at + '--files'.length).trim().split(/\s+/);
  const files = [];
  for (const t of toks) {
    if (t.startsWith('-')) break;
    if (/[|>&;()]/.test(t)) break; // shell 控制符 = --files 值已结束（omp v2.77.2 同款防误拦）
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

// ---- G 编辑边界门声明清单收集（与 omp collectDeclaredFiles 同源：花括号展开/负面清单行排除/冒号反引号收集）----
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

// ---- PreToolUse 分派 ----
function handlePreToolUse(evt, cwd) {
  if (!guardOn(cwd)) return;
  const tool = String(evt.tool_name ?? '').toLowerCase();
  const input = evt.tool_input ?? {};
  if (tool === 'bash') {
    const cmd = String(input.command ?? '');
    if (!cmd) return;
    // J bash 通道（与 omp 同款）：重定向/tee/sed -i 触及任务档案且非 tf.mjs = 疑似手改 status
    if (!cmd.includes('tf.mjs') && /(>|>>|\btee\s|\bsed\s+-i)[^|;&]*(task\.json|index\.json)/.test(cmd)) {
      const modeJ = process.env.TF_STATUS;
      if (modeJ !== 'off' && locateTasksDir(cwd)) {
        const why = 'TASKFLOW_GUARD 状态翻转墙：bash 重定向/tee/sed 触及任务档案（task.json/index.json）——手改 status = 违规（data.md 状态机表：翻转唯一写路径 commit --deployed / accept --pass / park / unpark / archive；档案修复走 node tf.mjs reconcile --fix）。会话级豁免：启动前 export TF_STATUS=off';
        guardLog(cwd, 'status-wall', modeJ === 'warn' ? 'warn' : 'enforce', 'bash 重定向/tee/sed 触及任务档案');
        if (modeJ === 'warn') { askPre(`⚠ ${why}`); return; }
        denyPre(why); return;
      }
    }
    // B1：commit --files 空格分隔（与 omp 同源，无档位——格式错就是错）
    if (cmd.includes('tf.mjs') && spaceSeparatedFiles(cmd)) {
      guardLog(cwd, 'bookkeeping', 'enforce', 'commit --files 空格分隔多文件');
      denyPre('命令已拦下，格式错了：tf.mjs commit --files 的多个文件要用逗号分隔（正确写法：--files a.md,b.md），用空格分隔时只有第一个文件会被登记进档案（历史上多次踩过这个坑）。把空格改成逗号后重试。');
      return;
    }
    // B2：红线 git（纪律①机械化；tf.mjs 自身命令放行——其内部分支操作经安全路径）
    if (!cmd.includes('tf.mjs') && /\bgit\s+/.test(cmd)) {
      const hit = REDLINE_RES.find((r) => r.re.test(cmd));
      if (hit) {
        const modeB = process.env.TF_BASH;
        if (modeB !== 'off') {
          const why = `TASKFLOW_GUARD 簿记硬拦：检测到红线命令——${hit.why}（SKILL.md 纪律①：禁 reset --hard / checkout -- / clean -f / force push / 共享分支 -D）。确属有意（与用户确认后）：本条命令改用前置环境变量 TF_BASH=off 执行（单次豁免，会留痕），并在 progress.md 记一行原因。`;
          guardLog(cwd, 'bookkeeping', modeB === 'warn' ? 'warn' : 'enforce', `红线命令拦截：${hit.why}`);
          if (modeB === 'warn') { askPre(`⚠ ${why}`); return; }
          denyPre(why); return;
        }
      }
    }
    return;
  }
  if (tool !== 'edit' && tool !== 'write' && tool !== 'multiedit') return;
  const raw = input.file_path ?? input.path;
  if (!raw || typeof raw !== 'string') return;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]+:/.test(raw)) return; // 协议地址过滤（与 omp 同款）
  const rawN = (raw === '~' || raw.startsWith('~/') || raw.startsWith('~\\')) ? path.join(os.homedir(), raw.slice(1)) : raw; // 波浪号展开
  const dir = locateTasksDir(cwd);
  if (!dir) return; // 零干扰边界
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
        if (modeJ === 'warn') { askPre(`⚠ ${whyJ}`); return; }
        denyPre(whyJ); return;
      }
    }
  }
  // G 编辑边界门（与 omp 同款归属判定：worktree 前缀/兄弟子任务 worktree/主仓库并集比对；缺省档 ask）
  const idx = readJsonSafe(path.join(dir, 'index.json'))?.tasks ?? [];
  const live = idx.filter((t) => t?.status === 'active' || t?.status === 'verifying');
  if (!live.length) return;
  let owner = null; let base = null;
  for (const t of live) {
    const rawW = typeof t.worktree === 'string' && t.worktree ? t.worktree : readJsonSafe(path.join(dir, t.id, 'task.json'))?.worktree;
    if (typeof rawW !== 'string' || !rawW) continue; // 幽灵 worktree 防护（omp v2.61.1 F-01 同款）
    const w = realPath(rawW);
    if (abs === w || abs.startsWith(w + path.sep)) { owner = t; base = w; break; }
    const sib = abs.startsWith(w + '-') ? abs.slice(w.length + 1) : '';
    if (sib && /^\d+-/.test(sib)) {
      const cut = abs.indexOf(path.sep, w.length + 1);
      owner = t; base = cut === -1 ? abs : abs.slice(0, cut);
      break;
    }
  }
  const boundVerdict = (why) => {
    const modeU = process.env.TF_BOUND;
    if (modeU === 'off') return false;
    guardLog(cwd, 'boundary', modeU === 'enforce' ? 'enforce' : 'ask', why.slice(0, 120));
    if (modeU === 'enforce') { denyPre(why); return true; }
    askPre(why); return true; // 缺省 ask：弹给用户拍板（人批即过——「验收拍板归人」）
  };
  if (!owner) {
    if (abs !== mainRoot && !abs.startsWith(mainRoot + path.sep)) return; // 主仓库与任何 worktree 之外 → 零干扰
    const union = new Set();
    for (const t of live) for (const p of collectDeclaredFiles(path.join(dir, t.id))) union.add(p);
    if (!union.size) return;
    const relU = path.relative(mainRoot, abs);
    if (!relU || relU.startsWith('..')) return;
    if (relU === '.taskflow' || relU.startsWith('.taskflow/') || relU.startsWith('.claude/hooks/') || path.basename(relU) === '.owner.json') return; // 簿记白名单（含本 guard 渲染位）
    if ([...union].some((d) => relU === d || relU.startsWith(d.endsWith('/') ? d : d + '/'))) return;
    boundVerdict(`TASKFLOW_GUARD G 编辑边界门：${relU} 不在任何进行中任务（${live.map((t) => t.id).join('、')}）声明的改动清单里（各任务清单 = 任务说明书 spec 的「边界与影响面」+ 各子任务「涉及文件」的合计）。主仓库检出区应保持干净、只作合并落点——请先确定这个文件归属哪个任务：到对应 worktree 里开工，或把路径加进该任务 spec 清单并跑 node tf.mjs req-confirm（范围变更登记）留痕。批=继续编辑；拒=先登记范围。`);
    return;
  }
  const rel = path.relative(base, abs);
  if (!rel || rel.startsWith('..')) return;
  if (rel === '.taskflow' || rel.startsWith('.taskflow/') || rel.startsWith('.claude/hooks/') || path.basename(rel) === '.owner.json') return; // 簿记白名单
  const declared = collectDeclaredFiles(path.join(dir, owner.id));
  if (!declared.length) return; // 无清单可对照（未落 spec 的旧任务）→ 零干扰
  const hit = declared.some((d) => rel === d || rel.startsWith(d.endsWith('/') ? d : d + '/'));
  if (hit) return;
  boundVerdict(`TASKFLOW_GUARD G 编辑边界门：${rel} 不在任务 ${owner.id} 开工时声明的改动清单里（清单 = spec「边界与影响面」+ 各子任务「涉及文件」合计）——这条纪律是为了让一个任务只做一件事、出问题好回滚。确实需要改：先把路径加进 spec 对应清单，再跑 node tf.mjs req-confirm 登记范围变更。批=继续编辑；拒=先登记范围。`);
}

// ---- PreCompact 压缩接力：active/verifying 任务逐个落 compact-relay.md（铁律「先存档再跑」机械化）----
function handlePreCompact(cwd) {
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
      `# 压缩接力注记（PreCompact 自动落盘 ${new Date().toISOString()}——压缩摘要不可靠时以本文件与各档案为准）`,
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
      '恢复入口：新会话点名 taskflow（Claude Code 用 /taskflow）或直接 node tf.mjs ls；本文件为机器快照，叙事事实源仍是 spec/progress/handoff。',
    ].join('\n') + '\n';
    try { fs.writeFileSync(path.join(dir, row.id, 'compact-relay.md'), relay); } catch { /* 单任务失败不拦压缩 */ }
  }
  guardLog(cwd, 'compact-relay', 'write', `压缩前落接力注记：${live.map((t) => t.id).join('、')}`);
}

// ---- 入口：整体吞错（Claude Code hook 抛错=exit≠0 阻断工具，绝不允许）----
// main 自检门：仅直接执行（hook 调用）时跑入口——静态 import（mechanisms 报表读门清单）零副作用：不读 stdin 不退出。
// realpath 双向比对（v3.2.0 分仓修正）：node 会把 ESM 入口 realpath（macOS /tmp→/private/tmp、/var→/private/var、
// CLAUDE_PROJECT_DIR 带符号链同因），path.resolve(argv[1]) 不归一——直接串比对在符号链环境恒错=整门静默（测试活体实证）。
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
      if (evt.hook_event_name === 'PreCompact') handlePreCompact(cwd);
      else if (evt.hook_event_name === 'PreToolUse') handlePreToolUse(evt, cwd);
    } catch { /* fail-open：守门自身故障不阻断用户工具流 */ }
  }
  process.exit(0);
}
