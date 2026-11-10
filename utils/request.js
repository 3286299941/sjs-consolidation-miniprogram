// utils/request.js —— 统一网络层
// 真实模式：wx.request + Bearer token；开发模式：由 services/mock.js 应答
// 统一返回后端响应体里的 data 字段，业务层不需要关心 code 包装
const config = require('./config');
const mock = require('../services/mock');

let unauthorizedHandler = null;

/** 注册 401 回调（由 auth 模块注入，避免循环依赖） */
function setOnUnauthorized(fn) {
  unauthorizedHandler = fn;
}

function request(path, options = {}) {
  const { method = 'GET', data = {}, auth = true } = options;

  if (config.USE_MOCK) {
    return mock.handle(path, method, data, {});
  }

  if (config.USE_CLOUD) {
    return cloudRequest(path, method, data, auth);
  }

  return new Promise((resolve, reject) => {
    const header = { 'content-type': 'application/json' };
    if (auth) {
      const token = wx.getStorageSync(config.TOKEN_KEY);
      if (token) header.Authorization = 'Bearer ' + token;
    }

    wx.request({
      url: config.API_BASE_URL + path,
      method,
      data,
      header,
      timeout: config.REQUEST_TIMEOUT,
      success: (res) => {
        if (res.statusCode === 401) {
          wx.removeStorageSync(config.TOKEN_KEY);
          wx.removeStorageSync(config.PROFILE_KEY);
          if (unauthorizedHandler) unauthorizedHandler();
          reject(new Error('登录已过期，请稍后重试'));
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error('服务暂时不可用（' + res.statusCode + '）'));
          return;
        }
        const body = res.data || {};
        if (body.code !== 0) {
          reject(new Error(body.message || '请求失败'));
          return;
        }
        resolve(body.data);
      },
      fail: (err) => {
        reject(new Error((err && err.errMsg) || '网络连接失败'));
      }
    });
  });
}

function cloudRequest(path, method, data, auth) {
  return new Promise((resolve, reject) => {
    // 云开发模式下身份由云函数注入（X-Sjs-Cloud-* 签名头），前端不传 Authorization
    const header = {};
    wx.cloud.callFunction({
      name: config.CLOUD_FUNC,
      env: config.CLOUD_ENV,  // 显式指定环境，避免依赖 init 默认值（2026-11-06 排查 INVALID_ENV）
      data: { path: path, method: method, body: data, headers: header },
      success: (res) => {
        const body = res.result || {};
        if (body.code === 40001 || body.code === 401) {
          wx.removeStorageSync(config.TOKEN_KEY);
          wx.removeStorageSync(config.PROFILE_KEY);
          if (unauthorizedHandler) unauthorizedHandler();
          reject(new Error('登录已过期，请稍后重试'));
          return;
        }
        if (body.code !== 0) {
          reject(new Error(body.message || '请求失败'));
          return;
        }
        resolve(body.data);
      },
      fail: (err) => {
        reject(new Error((err && err.errMsg) || '云函数调用失败'));
      }
    });
  });
}

function uploadFile(urlPath, filePath, formData = {}) {
  // 微信「头像昵称填写」等需上传文件的场景；wx.uploadFile 的 res.data 是字符串需解析
  if (config.USE_MOCK) {
    return Promise.resolve({ avatar: filePath, profile: { avatar: filePath } });
  }
  return new Promise((resolve, reject) => {
    const header = {};
    const token = wx.getStorageSync(config.TOKEN_KEY);
    if (token) header.Authorization = 'Bearer ' + token;
    wx.uploadFile({
      url: config.API_BASE_URL + urlPath,
      filePath,
      name: 'file',
      formData,
      header,
      success: (res) => {
        let body = {};
        try { body = JSON.parse(res.data); } catch (e) { body = {}; }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(body.message || '上传失败'));
          return;
        }
        if (body.code !== 0) {
          reject(new Error(body.message || '上传失败'));
          return;
        }
        resolve(body.data);
      },
      fail: (err) => reject(new Error((err && err.errMsg) || '网络错误'))
    });
  });
}

module.exports = { request, setOnUnauthorized, uploadFile };
