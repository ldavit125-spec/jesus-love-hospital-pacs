const WebSocket = require('ws');

async function inspect() {
  const wsUrl = 'ws://localhost:9222/devtools/page/9D1B3712195921E9D98F0BC39DC31537';
  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    const expr = `
      (() => {
        const c = document.querySelector('canvas');
        if (!c) return { error: 'No canvas found' };
        
        const ctx2d = c.getContext('2d');
        if (ctx2d) {
          const imgData = ctx2d.getImageData(0, 0, c.width, c.height);
          let nonZero = 0;
          for (let i = 0; i < imgData.data.length; i += 4) {
            if (imgData.data[i] > 0 || imgData.data[i+1] > 0 || imgData.data[i+2] > 0) {
              nonZero++;
            }
          }
          return {
            type: '2d',
            width: c.width,
            height: c.height,
            totalPixels: c.width * c.height,
            nonZeroPixels: nonZero
          };
        }

        return {
          error: 'Not 2d context',
          canvasAttrs: Array.from(c.attributes).map(a => a.name + '=' + a.value)
        };
      })()
    `;

    ws.send(JSON.stringify({
      id: 11,
      method: 'Runtime.evaluate',
      params: { expression: expr, returnByValue: true }
    }));
  });

  ws.on('message', data => {
    const res = JSON.parse(data);
    if (res.id === 11) {
      console.log('CANVAS 2D CHECK:', JSON.stringify(res.result.result.value, null, 2));
      ws.close();
    }
  });
}

inspect();
