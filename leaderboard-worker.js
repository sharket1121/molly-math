/**
 * 数学小乐园排行榜 Cloudflare Worker
 * 部署：wrangler deploy
 * 需要创建 KV namespace: wrangler kv:namespace create "LEADERBOARD"
 */

export default {
  async fetch(request, env) {
    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    const url = new URL(request.url);
    const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

    // GET /scores — 获取排行榜
    if (request.method === 'GET' && url.pathname === '/scores') {
      try {
        const raw = await env.LEADERBOARD.get('scores');
        let scores = raw ? JSON.parse(raw) : [];

        // 周榜：只返回最近7天的
        if (url.searchParams.get('week') === '1') {
          const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          scores = scores.filter(s => new Date(s.date).getTime() > weekAgo);
        }

        const limit = parseInt(url.searchParams.get('limit') || '50');
        const top = scores.slice(0, limit);

        return new Response(JSON.stringify(top), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // POST /scores — 提交积分
    if (request.method === 'POST' && url.pathname === '/scores') {
      try {
        const body = await request.json();
        const { name, score, level, accuracy, time, skin } = body;

        // 基本校验
        if (!name || typeof score !== 'number' || score <= 0) {
          return new Response(JSON.stringify({ error: '无效数据' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // 读取现有数据
        const raw = await env.LEADERBOARD.get('scores');
        let scores = raw ? JSON.parse(raw) : [];

        // 添加新记录
        const entry = {
          name: String(name).slice(0, 8),
          score: score,
          level: level || 0,
          accuracy: accuracy || 0,
          time: time || 0,
          skin: skin || '小猫咪',
          date: new Date().toISOString()
        };
        scores.push(entry);

        // 按积分降序排列
        scores.sort((a, b) => b.score - a.score);

        // 保留前200条
        scores = scores.slice(0, 200);

        // 写回 KV
        await env.LEADERBOARD.put('scores', JSON.stringify(scores));

        // 计算排名
        const rank = scores.findIndex(s =>
          s.name === entry.name &&
          s.score === entry.score &&
          s.date === entry.date
        ) + 1;

        return new Response(JSON.stringify({ ok: true, rank: rank }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // 404
    return new Response('Not Found', {
      status: 404,
      headers: corsHeaders
    });
  }
};
