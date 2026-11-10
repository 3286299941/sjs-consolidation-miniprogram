// 云函数 sjsApi —— 小程序后端的「安全代理」
//
// 职责：
//   1. 从微信云开发上下文拿到真实 openid（wx-server-sdk 自动下发，前端拿不到、改不了）
//   2. 用共享密钥对 openid 做 HMAC-SHA256 签名，通过 X-Sjs-Cloud-* 头传给服务器
//   3. 服务器在 WX_CLOUD_TRUST=1 时只认这个签名，杜绝客户端伪造身份
//   4. 把请求转发到生产服务器 nginx :80 的 /wechat/ 路径（服务端到服务端 HTTP，不受小程序域名白名单限制）
//
// 部署：在微信开发者工具里右键本目录 → 上传并部署：云端安装依赖
// 环境变量（云函数配置）：SJS_CLOUD_SECRET = 与服务器 WX_TOKEN_SECRET 一致
const cloud = require('wx-server-sdk');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 生产服务器（nginx :80 /wechat/ → 127.0.0.1:5005 的 wechat_api）
const SERVER_BASE = 'http://YOUR_SERVER_IP/wechat';
const SECRET = process.env.SJS_CLOUD_SECRET || '';

function forward(method, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const lib = urlPath.startsWith('https') ? https : http;
    const u = new URL(urlPath);
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      method: method.toUpperCase(),
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
    };
    if (payload) opts.headers['Content-Length'] = Buffer.byteLength(payload);

    const req = lib.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(buf);
        } catch (e) {
          json = { code: 500, message: '后端返回非 JSON：' + buf.slice(0, 200) };
        }
        resolve(json);
      });
    });
    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) {
    return { code: 401, message: '未获取到微信身份（请确认已在开发者工具开通云开发）' };
  }

  const { path = '/', method = 'GET', body = null, headers = {} } = event || {};

  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto
    .createHmac('sha256', SECRET)
    .update(openid + '.' + ts)
    .digest('hex');

  const fwdHeaders = Object.assign({}, headers, {
    'X-Sjs-Cloud-Openid': openid,
    'X-Sjs-Cloud-Ts': ts,
    'X-Sjs-Cloud-Sig': sig,
  });

  try {
    const result = await forward(method, SERVER_BASE + path, fwdHeaders, body);
    return result;
  } catch (e) {
    return { code: 500, message: '后端连接失败：' + (e && e.message ? e.message : String(e)) };
  }
};
