'use client';

import { useEffect, useRef, useState } from 'react';

type ToolMode = 'zoom' | 'pan' | 'windowLevel';

type CornerstoneModules = {
  core: typeof import('@cornerstonejs/core');
  tools: typeof import('@cornerstonejs/tools');
};

declare global {
  var __jesusLovePacsCornerstoneReady: Promise<CornerstoneModules> | undefined;
}

function initializeCornerstone(): Promise<CornerstoneModules> {
  if (!globalThis.__jesusLovePacsCornerstoneReady) {
    globalThis.__jesusLovePacsCornerstoneReady = Promise.all([
      import('@cornerstonejs/core'),
      import('@cornerstonejs/tools'),
      import('@cornerstonejs/dicom-image-loader'),
    ]).then(([core, tools, dicomImageLoader]) => {
      core.init();
      dicomImageLoader.init({ maxWebWorkers: 1 });
      tools.init();
      tools.addTool(tools.ZoomTool);
      tools.addTool(tools.PanTool);
      tools.addTool(tools.WindowLevelTool);
      return { core, tools };
    });
  }
  return globalThis.__jesusLovePacsCornerstoneReady;
}

export default function DicomViewer() {
  const elementRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [activeTool, setActiveTool] = useState<ToolMode>('zoom');
  const [status, setStatus] = useState('DICOM 파일을 불러오는 중입니다.');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const renderingEngineId = `xray-rendering-engine-${crypto.randomUUID()}`;
    const viewportId = `xray-viewport-${crypto.randomUUID()}`;
    const toolGroupId = `xray-tool-group-${crypto.randomUUID()}`;

    async function loadDicom() {
      if (!elementRef.current) return;
      try {
        if (mounted) setStatus('Cornerstone3D를 초기화하는 중입니다.');
        const { core, tools } = await initializeCornerstone();
        if (!mounted || !elementRef.current) return;
        if (mounted) setStatus('DICOM 뷰포트를 준비하는 중입니다.');
        const renderingEngine = new core.RenderingEngine(renderingEngineId);
        renderingEngine.enableElement({
          viewportId,
          type: core.Enums.ViewportType.STACK,
          element: elementRef.current,
          defaultOptions: { background: [0, 0, 0] },
        });

        const toolGroup = tools.ToolGroupManager.createToolGroup(toolGroupId);
        if (!toolGroup) throw new Error('Viewer 도구 그룹을 만들 수 없습니다.');
        toolGroup.addTool(tools.ZoomTool.toolName);
        toolGroup.addTool(tools.PanTool.toolName);
        toolGroup.addTool(tools.WindowLevelTool.toolName);
        toolGroup.addViewport(viewportId, renderingEngineId);

        const viewport = renderingEngine.getViewport(viewportId) as any;
        if (mounted) setStatus('DICOM 이미지 PixelData를 불러오는 중입니다.');
        await viewport.setStack([`wadouri:${window.location.origin}/sample-dicom/sample-xray.dcm`]);
        viewport.render();

        viewerRef.current = { renderingEngine, toolGroup, tools, viewport };
        activateTool('zoom');
        if (mounted) setStatus('샘플 X-ray · 마우스 드래그로 선택한 도구를 사용할 수 있습니다.');
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : 'DICOM 파일을 불러오지 못했습니다.');
          setStatus('');
        }
      }
    }

    loadDicom();
    return () => {
      const viewer = viewerRef.current;
      if (viewer?.renderingEngine?.id === renderingEngineId) {
        viewer.tools.ToolGroupManager.destroyToolGroup(toolGroupId);
        viewer.renderingEngine.destroy();
        viewerRef.current = null;
      }
      mounted = false;
    };
  }, []);

  function activateTool(mode: ToolMode) {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const selectedTool = mode === 'zoom' ? viewer.tools.ZoomTool : mode === 'pan' ? viewer.tools.PanTool : viewer.tools.WindowLevelTool;
    viewer.toolGroup.setToolActive(selectedTool.toolName, {
      bindings: [{ mouseButton: viewer.tools.Enums.MouseBindings.Primary }],
    });
    setActiveTool(mode);
  }

  function resetViewer() {
    const viewport = viewerRef.current?.viewport;
    if (!viewport) return;
    viewport.resetCamera();
    viewport.resetProperties();
    viewport.render();
    setActiveTool('zoom');
  }

  return (
    <section className="viewer-canvas dicom-canvas" aria-label="DICOM X-ray Viewer">
      <div className="viewer-toolbar" aria-label="Viewer 도구">
        <button className={activeTool === 'zoom' ? 'active' : ''} type="button" onClick={() => activateTool('zoom')}>⌕ Zoom</button>
        <button className={activeTool === 'pan' ? 'active' : ''} type="button" onClick={() => activateTool('pan')}>✥ Pan</button>
        <button className={activeTool === 'windowLevel' ? 'active' : ''} type="button" onClick={() => activateTool('windowLevel')}>◐ W/L</button>
        <button className="reset" type="button" onClick={resetViewer}>↻ Reset</button>
      </div>
      <div className="cornerstone-viewport" ref={elementRef} />
      {status && <p className="viewer-status">{status}</p>}
      {error && <div className="viewer-error"><strong>DICOM 로딩 오류</strong><span>{error}</span></div>}
    </section>
  );
}
