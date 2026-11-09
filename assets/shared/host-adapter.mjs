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
// 注：omp 线已迁回原仓 LAO235Sodo/taskflow（v3.2.0 分仓）——本仓 omp 强制值仍被接受但按纪律档处理（适配全 null）。
export function detectHost(env = (typeof process !== 'undefined' ? process.env : {}), exists = () => false) {
  const forced = env.TF_HOST;
  if (forced && ['omp', 'opencode', 'claude', 'none'].includes(forced)) return forced;
  if (env.OMP || env.OMP_SESSION_ID) return 'omp';
  if (env.CLAUDECODE) return 'claude';
  if (exists(homeJoin('.config', 'opencode'))) return 'opencode';
  if (exists(homeJoin('.claude'))) return 'claude';
  return 'none';
}
// 技能加载埋点文件：claude 线无 skill:// 埋点形态（omp 线在原仓）——恒 null=不写埋点（skills --usage 报表口径如实声明）。
export function usagePath(_host) {
  return null;
}
// 计划交接文档扫描目录（ls 游离工作源）：claude=~/.claude/plans（Claude Code plan mode 产物落位）；其余 []。
export function planScanDirs(host) {
  return host === 'claude' ? [homeJoin('.claude', 'plans')] : [];
}
// 守门扩展落盘目标（mech install TASKFLOW_GUARD 渲染位）：claude=.claude/hooks（四门薄适配，配 .claude/settings.json
// hooks 注册）；其余 []=宿主无守门通道（降级纯纪律档；omp 守门在原仓）。
export function guardTargets(host) {
  return host === 'claude' ? [pathJoin('.claude', 'hooks')] : [];
}
// 红线摘要载体（new-task/记录约定写红线处）：opencode=AGENTS.md / claude=CLAUDE.md / 其余仅 conventions.md。
export function redlineFile(host) {
  if (host === 'opencode') return 'AGENTS.md';
  if (host === 'claude') return 'CLAUDE.md';
  return null;
}
// 金丝雀通道（canary 命令）：claude 有 -p 单轮通道；其余 null=静默跳过（omp 金丝雀在原仓）。
export function canaryCmdBin(host) {
  return host === 'claude' ? 'claude' : null;
  return null;
}
const pathJoin = (...seg) => seg.join('/');
