#!/usr/bin/env node
/* ============================================================
 * 来钱花 · 一键建表脚本（零依赖，Node >= 18）
 *
 * 前置：在 https://supabase.com/dashboard/account/tokens 创建
 * Personal Access Token（sbp_ 开头），填入项目根目录 .env 的
 * SUPABASE_ACCESS_TOKEN，然后执行：
 *
 *   cd money-comeon
 *   node scripts/init-db.mjs
 *
 * 脚本会通过 Supabase Management API 执行 supabase/schema.sql：
 * 建 4 张表 + RLS 策略 + 注册自动建档触发器（幂等，可重复执行）。
 * 不依赖 service_role secret key，也不会把任何密钥打印到终端。
 * ============================================================ */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function loadEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return {};
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

async function main() {
  const env = { ...loadEnv(), ...process.env };
  const token = env.SUPABASE_ACCESS_TOKEN;
  const url = env.SUPABASE_URL;

  if (!token) {
    console.error('✗ .env 中缺少 SUPABASE_ACCESS_TOKEN（sbp_ 开头的 Personal Access Token）');
    console.error('  创建地址：https://supabase.com/dashboard/account/tokens');
    process.exit(1);
  }
  if (!url) {
    console.error('✗ .env 中缺少 SUPABASE_URL');
    process.exit(1);
  }

  const ref = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');

  console.log(`→ 项目 ${ref}：开始执行 supabase/schema.sql …`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`✗ 执行失败（HTTP ${res.status}）：`);
    try { console.error(JSON.stringify(JSON.parse(text), null, 2)); }
    catch { console.error(text); }
    process.exit(1);
  }
  console.log('✓ 建表完成：profiles / transactions / customers / inventory（含 RLS 策略与建档触发器）');
}

main().catch(e => { console.error('✗', e.message); process.exit(1); });
