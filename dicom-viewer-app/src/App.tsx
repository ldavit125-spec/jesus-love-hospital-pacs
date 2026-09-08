import { useEffect, useRef, useState } from 'react';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import './index.css';

type ToolMode = 'zoom' | 'pan' | 'windowLevel';

let isInitialized = false;

function initCornerstone() {
  if (isInitialized) return;

  cornerstone.init({
    rendering: {
      useCPURendering: false,
      preferSizeOverAccuracy: true,
    },
  } as any);
  cornerstoneTools.init();

  cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
  cornerstoneTools.addTool(cornerstoneTools.PanTool);
  cornerstoneTools.addTool(cornerstoneTools.WindowLevelTool);

  dicomImageLoader.init({
    maxWebWorkers: navigator.hardwareConcurrency || 1,
    useLegacyMetadataProvider: true,
  });

  // CR X-ray images may have 0.000\0.000 pixel spacing tag which causes 0-width GPU texture spacing
  cornerstone.metaData.addProvider((type: string, _imageId?: string) => {
    if (type === 'imagePlaneModule') {
      return {
        rowPixelSpacing: 1.0,
        columnPixelSpacing: 1.0,
        rowCosines: [1, 0, 0],
        columnCosines: [0, 1, 0],
        imagePositionPatient: [0, 0, 0],
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      };
    }
  }, 10000);

  isInitialized = true;
}

export default function App() {
  const elementRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<{
    renderingEngine: cornerstone.RenderingEngine;
    toolGroup: cornerstoneTools.Types.IToolGroup;
    viewport: cornerstone.Types.IStackViewport;
  } | null>(null);

  // Parse study metadata parameters from URL
  const queryParams = new URLSearchParams(window.location.search);
  const studyInstanceUid = queryParams.get('studyInstanceUid') || '';
  const accessionNumber = queryParams.get('accessionNumber') || '';
  const patientId = queryParams.get('patientId') || '';

  const [activeTool, setActiveTool] = useState<ToolMode>('zoom');
  const [status, setStatus] = useState<string>('초기화 준비 중...');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [dicomInfo, setDicomInfo] = useState<{
    dimensions: string;
    transferSyntax: string;
    modality: string;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    const renderingEngineId = 'jesus-love-engine';
    const viewportId = 'xray-viewport-main';
    const toolGroupId = 'xray-tool-group-main';

    async function setupViewer() {
      if (!elementRef.current) return;

      try {
        setStatus('Cornerstone3D 및 DICOM Loader 초기화 중...');
        initCornerstone();

        if (!isMounted || !elementRef.current) return;

        setStatus('렌더링 엔진 구성 중...');
        const renderingEngine = new cornerstone.RenderingEngine(renderingEngineId);
        
        renderingEngine.enableElement({
          viewportId,
          type: cornerstone.Enums.ViewportType.STACK,
          element: elementRef.current,
          defaultOptions: {
            background: [0, 0, 0] as cornerstone.Types.Point3,
          },
        });

        const toolGroup = cornerstoneTools.ToolGroupManager.createToolGroup(toolGroupId);
        if (!toolGroup) {
          throw new Error('ToolGroup 생성 실패');
        }

        toolGroup.addTool(cornerstoneTools.ZoomTool.toolName);
        toolGroup.addTool(cornerstoneTools.PanTool.toolName);
        toolGroup.addTool(cornerstoneTools.WindowLevelTool.toolName);
        toolGroup.addViewport(viewportId, renderingEngineId);

        const viewport = renderingEngine.getViewport(viewportId) as cornerstone.Types.IStackViewport;
        viewerRef.current = { renderingEngine, toolGroup, viewport };

        setStatus('sample-xray.dcm 다운로드 및 PixelData 디코딩 중...');
        const imageId = `wadouri:${window.location.origin}/sample-dicom/sample-xray.dcm`;

        await viewport.setStack([imageId]);

        // MONOCHROME1 and custom window/level adjustment
        const image = cornerstone.cache.getImage(imageId);
        console.log('Cornerstone loaded image object:', image);
        if (image) {
          (window as any).__debugDicomInfo = {
            hasImage: true,
            columns: image.columns,
            rows: image.rows,
            minPixelValue: image.minPixelValue,
            maxPixelValue: image.maxPixelValue,
            windowCenter: image.windowCenter,
            windowWidth: image.windowWidth,
            photometric: image.photometricInterpretation,
            pixelDataLength: image.getPixelData ? image.getPixelData().length : null,
            pixelDataSample: image.getPixelData ? Array.from(image.getPixelData().subarray(1000000, 1000010)) : null,
            viewportProperties: viewport.getProperties(),
            camera: viewport.getCamera(),
          };

          // Apply proper window level for visual contrast
          viewport.setProperties({
            voiRange: {
              lower: 800,
              upper: 26000,
            },
            invert: image.photometricInterpretation === 'MONOCHROME1',
          });

          setDicomInfo({
            dimensions: `${image.columns} x ${image.rows}`,
            transferSyntax: 'Explicit VR Little Endian (1.2.840.10008.1.2.1)',
            modality: 'CR (X-Ray)',
          });
        }

        (window as any).__csViewport = viewport;
        (window as any).__csRenderingEngine = renderingEngine;

        viewport.resetCamera();
        viewport.render();

        setTool('zoom');
        setIsLoading(false);
        setStatus('DICOM 디코딩 성공 - 영상이 정상적으로 렌더링되었습니다.');
      } catch (err) {
        console.error('DICOM Viewer Load Error:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
          setStatus('오류가 발생했습니다.');
        }
      }
    }

    setupViewer();

    return () => {
      isMounted = false;
      if (viewerRef.current) {
        cornerstoneTools.ToolGroupManager.destroyToolGroup(toolGroupId);
        viewerRef.current.renderingEngine.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  const setTool = (tool: ToolMode) => {
    if (!viewerRef.current) return;
    const { toolGroup } = viewerRef.current;

    toolGroup.setToolPassive(cornerstoneTools.ZoomTool.toolName);
    toolGroup.setToolPassive(cornerstoneTools.PanTool.toolName);
    toolGroup.setToolPassive(cornerstoneTools.WindowLevelTool.toolName);

    const toolName =
      tool === 'zoom'
        ? cornerstoneTools.ZoomTool.toolName
        : tool === 'pan'
        ? cornerstoneTools.PanTool.toolName
        : cornerstoneTools.WindowLevelTool.toolName;

    toolGroup.setToolActive(toolName, {
      bindings: [
        {
          mouseButton: cornerstoneTools.Enums.MouseBindings.Primary,
        },
      ],
    });

    setActiveTool(tool);
  };

  const handleReset = () => {
    if (!viewerRef.current) return;
    const { viewport } = viewerRef.current;
    viewport.resetCamera();
    viewport.resetProperties();
    viewport.render();
  };

  return (
    <div className="viewer-app-container">
      <header className="app-header">
        <div className="header-title-area">
          <span className="badge-tag">Standalone</span>
          <h1>예수사랑병원 Cornerstone3D DICOM Viewer</h1>
        </div>
        <div className="patient-pill">
          {patientId ? (
            <>
              <span>Patient:</span>
              <strong>{patientId}</strong>
              {accessionNumber && (
                <>
                  <span>Accession:</span>
                  <strong>{accessionNumber}</strong>
                </>
              )}
            </>
          ) : (
            <>
              <span>Sample:</span>
              <strong>sample-xray.dcm (CR)</strong>
            </>
          )}
        </div>
      </header>

      <div className="viewer-workspace">
        <div className="toolbar-overlay">
          <button
            id="tool-zoom"
            type="button"
            className={`tool-btn ${activeTool === 'zoom' ? 'active' : ''}`}
            onClick={() => setTool('zoom')}
          >
            🔍 Zoom
          </button>
          <button
            id="tool-pan"
            type="button"
            className={`tool-btn ${activeTool === 'pan' ? 'active' : ''}`}
            onClick={() => setTool('pan')}
          >
            ✥ Pan
          </button>
          <button
            id="tool-wl"
            type="button"
            className={`tool-btn ${activeTool === 'windowLevel' ? 'active' : ''}`}
            onClick={() => setTool('windowLevel')}
          >
            ◐ Window/Level
          </button>
          <button
            id="tool-reset"
            type="button"
            className="tool-btn reset-btn"
            onClick={handleReset}
          >
            ↺ Reset
          </button>
        </div>

        <div className="viewer-viewport-wrapper">
          <div
            id="cornerstone-element"
            ref={elementRef}
            className="cornerstone-canvas-container"
          />

          {dicomInfo && (
            <>
              <div className="info-overlay top-left">
                <div>예수사랑병원 영상의학과</div>
                <div>MODALITY: {dicomInfo.modality}</div>
                <div>DIMENSIONS: {dicomInfo.dimensions}</div>
              </div>
              <div className="info-overlay top-right">
                <div>SYNTAX: {dicomInfo.transferSyntax}</div>
                <div>CODEC: Uncompressed / Native</div>
              </div>
              <div className="info-overlay bottom-left">
                <div>TOOL: {activeTool.toUpperCase()} (Primary Drag)</div>
              </div>
              <div className="info-overlay bottom-right">
                <div>Cornerstone3D v5.8.2</div>
              </div>
            </>
          )}

          {error && (
            <div className="error-banner">
              <strong>렌더링 오류 발생:</strong>
              <p>{error}</p>
            </div>
          )}

          <div className="status-indicator-bar">
            <span
              className={`status-dot ${
                isLoading ? 'loading' : error ? 'error' : ''
              }`}
            />
            <span>{status}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
