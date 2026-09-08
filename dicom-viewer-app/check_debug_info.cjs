const WebSocket = require('ws');

async function inspect() {
  const wsUrl = 'ws://localhost:9222/devtools/page/9D1B3712195921E9D98F0BC39DC31537';
  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    const expr = `
      (() => {
        const imageId = 'wadouri:' + window.location.origin + '/sample-dicom/sample-xray.dcm';
        // Cornerstone cache check
        return window.__debugDicomInfo || { message: 'no debug info' };
      })()
    `;

    ws.send(JSON.stringify({
      id: 12,
      method: 'Runtime.evaluate',
      params: { expression: expr, returnByValue: true }
    }));
  });

  ws.on('message', data => {
    const res = JSON.parse(data);
    if (res.id === 12) {
      console.log('DEBUG DICOM INFO:', JSON.stringify(res.result.result.value, null, 2));
      ws.close();
    }
  });
}

inspect();
