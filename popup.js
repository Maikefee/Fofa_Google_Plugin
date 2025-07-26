// 保存API信息
document.getElementById('save').onclick = function() {
  chrome.storage.local.set({
    fofa_email: document.getElementById('email').value,
    fofa_key: document.getElementById('key').value
  }, () => alert('已保存'));
};

let lastResults = [];

// 提取根域名函数
function getRootDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length <= 2) {
    return hostname;
  }
  // 返回最后两个部分，例如 www.example.com -> example.com
  return parts.slice(-2).join('.');
}

window.onload = function() {
  chrome.storage.local.get(['fofa_email', 'fofa_key'], function(data) {
    if (data.fofa_email) document.getElementById('email').value = data.fofa_email;
    if (data.fofa_key) document.getElementById('key').value = data.fofa_key;
    autoQuery();
  });
  document.getElementById('export').onclick = exportCSV;
  document.getElementById('refresh').onclick = autoQuery;
};

async function autoQuery() {
  document.getElementById('result').innerHTML = '正在自动查询...';
  document.getElementById('stats').innerHTML = '统计信息加载中...';
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    let url;
    try {
      url = new URL(tabs[0].url);
    } catch {
      document.getElementById('result').innerHTML = '无法获取当前页面URL';
      document.getElementById('stats').innerHTML = '';
      lastResults = [];
      return;
    }
    let host = getRootDomain(url.hostname);
    chrome.storage.local.get(['fofa_email', 'fofa_key'], async function(data) {
      if (!data.fofa_email || !data.fofa_key) {
        document.getElementById('result').innerHTML = '请先填写FOFA API信息';
        document.getElementById('stats').innerHTML = '';
        lastResults = [];
        return;
      }
      let fields = ['host','ip','port','protocol','title','os'];
      let q = host;
      let qbase64 = btoa(q);
      let api = `https://fofa.info/api/v1/search/all?email=${encodeURIComponent(data.fofa_email)}&key=${encodeURIComponent(data.fofa_key)}&qbase64=${qbase64}&fields=${fields.join(',')}`;
      try {
        let resp = await fetch(api);
        let json = await resp.json();
        if (json.error) {
          document.getElementById('result').innerHTML = `<span class="error">查询失败: ${json.errmsg}</span>`;
          lastResults = [];
        } else if (json.results.length === 0) {
          document.getElementById('result').innerHTML = `<span class="error">未查询到相关信息</span>`;
          lastResults = [];
        } else {
          lastResults = json.results;
          let html = `<div class="table-wrapper"><table>
            <tr>
              <th>Host</th>
              <th>IP</th>
              <th>端口</th>
              <th>协议</th>
              <th>标题</th>
              <th>操作系统</th>
            </tr>`;
          for (let row of json.results) {
            html += `<tr>
              <td>${row[0] || ''}</td>
              <td>${row[1] || ''}</td>
              <td>${row[2] || ''}</td>
              <td>${row[3] || ''}</td>
              <td>${row[4] || ''}</td>
              <td>${row[5] || ''}</td>
            </tr>`;
          }
          html += '</table></div>';
          document.getElementById('result').innerHTML = html;
        }
      } catch (e) {
        document.getElementById('result').innerHTML = `<span class="error">网络错误或API异常</span>`;
        lastResults = [];
      }

      // 统计聚合
      try {
        let statsFields = ['protocol','port','country','os','server'];
        let stats = await fofaStats({
          email: data.fofa_email,
          key: data.fofa_key,
          query: q,
          fields: statsFields
        });
        if (stats.error) {
          document.getElementById('stats').innerHTML = `<span class="error">统计信息获取失败: ${stats.errmsg}</span>`;
        } else {
          let statsHtml = '';
          for (let field of statsFields) {
            if (stats.aggs && stats.aggs[field]) {
              statsHtml += `<div class="stat-title">${field.toUpperCase()} 前5</div>`;
              statsHtml += `<table class="stats-table"><tr><th>名称</th><th>数量</th></tr>`;
              for (let item of stats.aggs[field]) {
                statsHtml += `<tr><td>${item.name || ''}</td><td>${item.count || 0}</td></tr>`;
              }
              statsHtml += `</table>`;
            }
          }
          document.getElementById('stats').innerHTML = statsHtml || '<span class="success">无统计数据</span>';
        }
      } catch (e) {
        document.getElementById('stats').innerHTML = `<span class="error">统计信息获取异常</span>`;
      }
    });
  });
}

// FOFA 统计聚合方法
async function fofaStats({email, key, query, fields=['protocol','port','country','os','server']}) {
  const qbase64 = btoa(query);
  const api = `https://fofa.info/api/v1/search/stats?email=${encodeURIComponent(email)}&key=${encodeURIComponent(key)}&qbase64=${qbase64}&fields=${fields.join(',')}`;
  const resp = await fetch(api);
  return await resp.json();
}

// 导出CSV功能
function exportCSV() {
  if (!lastResults || lastResults.length === 0) {
    alert('暂无可导出的数据');
    return;
  }
  const headers = ['Host','IP','端口','协议','标题','操作系统'];
  let csv = headers.join(',') + '\n';
  for (let row of lastResults) {
    csv += row.map(item => `"${(item || '').replace(/"/g, '""')}` ).join(',') + '\n';
  }
  const blob = new Blob([csv], {type: 'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fofa_results.csv';
  a.click();
  URL.revokeObjectURL(url);
} 