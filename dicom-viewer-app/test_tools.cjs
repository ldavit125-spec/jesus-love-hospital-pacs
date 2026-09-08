const WebSocket = require('ws');

async function testTools() {
  const wsUrl = 'ws://localhost:9222/devtools/page/9D1B3712195921E9D98F0BC39DC31537';
  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    const expr = `
      (() => {
        const results = {};
        const vp = window.__csViewport;
        const initCamera = vp.getCamera();
        results.initialParallelScale = initCamera.parallelScale;

        // Click Pan
        const panBtn = document.getElementById('tool-pan');
        panBtn.click();
        results.panActive = panBtn.classList.contains('active');

        // Click Window/Level
        const wlBtn = document.getElementById('tool-wl');
        wlBtn.click();
        results.wlActive = wlBtn.classList.contains('active');

        // Click Zoom
        const zoomBtn = document.getElementById('tool-zoom');
        zoomBtn.click();
        results.zoomActive = zoomBtn.classList.contains('active');

        // Test Reset
        const resetBtn = document.getElementById('tool-reset');
        resetBtn.click();
        results.resetSuccess = true;

        return results;
      })()
    `;

    ws.send(JSON.stringify({
      id: 50,
      method: 'Runtime.evaluate',
      params: { expression: expr, returnByValue: true }
    }));
  });

  ws.on('message', data => {
    const res = JSON.parse(data);
    if (res.id === 50) {
      console.log('TOOLS TEST RESULT:', JSON.stringify(res.result.result.value, null, 2));
      ws.close();
    }
  });
}

testTools();
