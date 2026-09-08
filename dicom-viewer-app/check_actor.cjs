const WebSocket = require('ws');

async function inspect() {
  const wsUrl = 'ws://localhost:9222/devtools/page/9D1B3712195921E9D98F0BC39DC31537';
  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    const expr = `
      (() => {
        const vp = window.__csViewport;
        if (!vp) return { error: 'No __csViewport found' };

        const defaultActor = vp.getDefaultActor ? vp.getDefaultActor() : null;
        let actorDetails = null;
        if (defaultActor && defaultActor.actor) {
          const act = defaultActor.actor;
          const mapper = act.getMapper();
          const imgData = mapper ? mapper.getInputData() : null;
          const prop = act.getProperty();
          const rgb = prop ? prop.getRGBTransferFunction(0) : null;
          actorDetails = {
            hasActor: true,
            hasMapper: !!mapper,
            hasInputData: !!imgData,
            dimensions: imgData ? imgData.getDimensions() : null,
            spacing: imgData ? imgData.getSpacing() : null,
            origin: imgData ? imgData.getOrigin() : null,
            bounds: act.getBounds ? act.getBounds() : null,
            visibility: act.getVisibility ? act.getVisibility() : null,
            mappingRange: rgb ? rgb.getMappingRange() : null,
            range: imgData && imgData.getPointData() && imgData.getPointData().getScalars() ? imgData.getPointData().getScalars().getRange() : null
          };
        }

        const camera = vp.getCamera();
        return {
          actorDetails,
          camera,
          useCPURendering: vp.useCPURendering,
          canvas: {
            width: vp.canvas.width,
            height: vp.canvas.height,
            clientWidth: vp.canvas.clientWidth,
            clientHeight: vp.canvas.clientHeight
          }
        };
      })()
    `;

    ws.send(JSON.stringify({
      id: 21,
      method: 'Runtime.evaluate',
      params: { expression: expr, returnByValue: true }
    }));
  });

  ws.on('message', data => {
    const res = JSON.parse(data);
    if (res.id === 21) {
      console.log('ACTOR & CAMERA DETAILS:', JSON.stringify(res.result.result.value, null, 2));
      ws.close();
    }
  });
}

inspect();
