// host-adapter.mjs — taskflow 宿主适配层（v2.87.0）：omp 扩展事件面「运行时合同」单点——注入落点/会话 id/本会话标注。
// 背景（2.84.1 实锤）：before_provider_request 的 payload 形状随 provider transport 而定，omp 文档只合同「返回替换后的
// 请求体」——向 payload.system 写入在真实形状（无 system 键）下被传输层静默丢弃=E/U/V 三墙 no-op 19 天。合同细节收拢
// 本模块：改注入形态只改这里，guard/测试/金丝雀同源消费（渲染副本经 inlineSharedDeps 内联自包含）。
// 零 import 纯函数。

// 注入落点（2.84.1 通道修复）：主形态=messages 头插（新数组，禁原地 mutate 共享数组）；Anthropic 形字符串/blocks
// system 保留兼容；无一命中（未知传输形态）返回 undefined 不注入不炸。
export function injectPrepend(p, inject) {
  if (Array.isArray(p?.messages)) { p.messages = [{ role: 'system', content: inject }, ...p.messages]; return p; }
  if (typeof p?.system === 'string') { p.system = `${inject}\n\n${p.system}`; return p; }
  if (Array.isArray(p?.system)) { p.system = [{ type: 'text', text: inject }, ...p.system]; return p; }
  return undefined;
}

// 会话 id 源（v2.84.0「，本会话」标注）：会话文件 basename 去 .jsonl（形如 时间戳_uuid）；非串/空/异常返回 null（降级无标注）。
// 零 import：basename 用字符串切分等价实现（/ 与 \ 双分隔符，Windows 会话路径同样正确）。
export function sessIdOf(sessionFile) {
  try {
    if (typeof sessionFile !== 'string' || !sessionFile) return null;
    return sessionFile.split(/[\\/]/).pop().replace(/\.jsonl$/, '') || null;
  } catch { return null; }
}

// 「，本会话」标注（2.84.1 后缀匹配）：整名相等或 sessionId 下划线后缀（uuid 段）相等皆亮（旧精确相等在
// 时间戳_uuid 文件名形态下恒不命中=标注永不亮，对抗审查实锤）；不匹配/缺参返回空串（降级无标注）。
export function inSessionMark(sessionId, tjSessionId) {
  return sessionId && tjSessionId && (tjSessionId === sessionId || sessionId.endsWith('_' + tjSessionId)) ? '，本会话' : '';
}

// ── 宿主适配（v3.0.0）：宿主差异单点——检测/埋点路径/计划扫描目录/守门落点/红线载体。tf.mjs 与 guard 同源消费；
//    新宿主只改这里（OCP：加分支不改调用方）。零 import 纯函数（渲染副本经 inlineSharedDeps 内联自包含）。
const HOME = (typeof process !== 'undefined' && (process.env.HOME || process.env.USERPROFILE)) || (typeof os !== 'undefined' && os.homedir ? os.homedir() : '');
const homeJoin = (...seg) => (HOME ? [HOME, ...seg].join('/') : '');

// 宿主探测：env 优先（TF_HOST 强制/测试注入），再按痕迹探测；无命中='none'（纯纪律档降级）。
// CLAUDECODE 判据（v3.2.0）：Claude Code 会话内 Bash 恒带该 env——宿主=调起 taskflow 的会话，
// 须排在目录探测之前，否则双装机（~/.config/opencode 在场）claude 永不自动命中。
// OPENCODE 判据（v3.8.0 opencode2 线）：OpenCode V2 会话 Bash 恒带 OPENCODE=1 + OPENCODE_SESSION_ID=ses_…
// （2026-11-11 v2.2.7 会话实证）——同样会话级判据，排在 CLAUDECODE 之后（双 env 并存=嵌套调起场景归 claude，
// 与 v3.2.0 定序语义一致）、目录探测之前。
// 注：omp 线已迁回原仓 LAO235Sodo/taskflow（v3.2.0 分仓）——本仓 omp 强制值仍被接受但按纪律档处理（适配全 null）。
export function detectHost(env = (typeof process !== 'undefined' ? process.env : {}), exists = () => false) {
  const forced = env.TF_HOST;
  if (forced && ['omp', 'opencode', 'opencode2', 'claude', 'none'].includes(forced)) return forced;
  if (env.OMP || env.OMP_SESSION_ID) return 'omp';
  if (env.CLAUDECODE) return 'claude';
  if (env.OPENCODE_SESSION_ID || env.OPENCODE) return 'opencode2';
  // 目录兜底归 opencode2（v3.8.0 拍板：~/.config/opencode 同时服务 V1/V2，V2 已是主线；V1 用户 TF_HOST=opencode 逃生）
  if (exists(homeJoin('.config', 'opencode'))) return 'opencode2';
  if (exists(homeJoin('.claude'))) return 'claude';
  return 'none';
}
// 技能加载埋点文件：claude 线无 skill:// 埋点形态（omp 线在原仓）——恒 null=不写埋点（skills --usage 报表口径如实声明）。
export function usagePath(_host) {
  return null;
}
// 计划交接文档扫描目录（ls 游离工作源）：claude=~/.claude/plans（Claude Code plan mode 产物落位）；其余 []。
// opencode2：V2 无全局 plan 目录（plan mode 是 agent，工作记录在会话存储——2026-11-11 探明），如实 []。
export function planScanDirs(host) {
  return host === 'claude' ? [homeJoin('.claude', 'plans')] : [];
}
// 守门扩展落盘目标（mech install TASKFLOW_GUARD 渲染位）：claude=.claude/hooks（两模板 .mjs，配 settings.json
// hooks 注册）；opencode2=.opencode/plugins/taskflow-guard（V2 plugin 目录即装，模板 index.js——探针实证裸目录
// 自动加载、无注册面）；其余 []=宿主无守门通道（降级纯纪律档；omp 守门在原仓）。
export function guardTargets(host) {
  if (host === 'claude') return [pathJoin('.claude', 'hooks')];
  if (host === 'opencode2') return [pathJoin('.opencode', 'plugins', 'taskflow-guard')];
  return [];
}
// 红线摘要载体（new-task/记录约定写红线处）：opencode/opencode2=AGENTS.md（V2 同样每会话自动注入）/
// claude=CLAUDE.md / 其余仅 conventions.md。
export function redlineFile(host) {
  if (host === 'opencode' || host === 'opencode2') return 'AGENTS.md';
  if (host === 'claude') return 'CLAUDE.md';
  return null;
}
// 金丝雀通道（canary 命令）：claude 有 -p 单轮通道；opencode2 有 opencode run 单轮通道（--auto 放行权限，
// v3.8.0）；其余 null=静默跳过（omp 金丝雀在原仓）。
export function canaryCmdBin(host) {
  if (host === 'claude') return 'claude';
  if (host === 'opencode2') return 'opencode';
  return null;
}
const pathJoin = (...seg) => seg.join('/');
