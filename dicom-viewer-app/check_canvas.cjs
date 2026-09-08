const WebSocket = require('ws');

async function inspect() {
  const wsUrl = 'ws://localhost:9222/devtools/page/9D1B3712195921E9D98F0BC39DC31537';
  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    const expr = `
      (() => {
        const c = document.querySelector('canvas');
        if (!c) return { error: 'No canvas' };
        
        let nonZero = 0;
        let sample = [];
        try {
          const gl = c.getContext('webgl2') || c.getContext('webgl');
          if (gl) {
            const pixels = new Uint8Array(c.width * c.height * 4);
            gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            for (let i = 0; i < pixels.length; i += 4) {
              if (pixels[i] > 0 || pixels[i+1] > 0 || pixels[i+2] > 0) {
                nonZero++;
                if (sample.length < 10) {
                  sample.push([pixels[i], pixels[i+1], pixels[i+2], pixels[i+3]]);
                }
              }
            }
            return {
              type: 'webgl',
              width: c.width,
              height: c.height,
              totalPixels: c.width * c.height,
              nonZeroPixels: nonZero,
              sample: sample
            };
          }
        } catch (e) {
          return { error: e.message };
        }
        return { type: 'unknown' };
      })()
    `;

    ws.send(JSON.stringify({
      id: 10,
      method: 'Runtime.evaluate',
      params: { expression: expr, returnByValue: true }
    }));
  });

  ws.on('message', data => {
    const res = JSON.parse(data);
    if (res.id === 10) {
      console.log('CANVAS PIXEL CHECK:', JSON.stringify(res.result.result.value, null, 2));
      ws.close();
    }
  });
}

inspect();
