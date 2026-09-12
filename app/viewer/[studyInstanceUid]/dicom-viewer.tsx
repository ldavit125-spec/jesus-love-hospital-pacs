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

function ensurePart10ArrayBuffer(inputBuf: ArrayBuffer): ArrayBuffer {
  const u8 = new Uint8Array(inputBuf);
  // DICM prefix at byte 128
  if (u8.length > 132 && u8[128] === 0x44 && u8[129] === 0x49 && u8[130] === 0x43 && u8[131] === 0x4D) {
    return inputBuf;
  }

  // Non-Part 10 raw DICOM: wrap with DICOM Part 10 Header (preamble + DICM + File Meta Information)
  const sopClass = '1.2.840.10008.5.1.4.1.1.1'; // CR Image Storage default
  const sopInstance = '1.2.392.200036.9125.0.19950720112207';
  const transferSyntax = '1.2.840.10008.1.2'; // Implicit VR Little Endian

  function makeElem(group: number, elem: number, vr: string, valBytes: Uint8Array): Uint8Array {
    let len = valBytes.length;
    let padded = valBytes;
    if (len % 2 !== 0) {
      padded = new Uint8Array(len + 1);
      padded.set(valBytes);
      padded[len] = 0;
      len++;
    }
    const is32Bit = ['OB', 'OW', 'OF', 'SQ', 'UT', 'UN'].includes(vr);
    const headerLen = is32Bit ? 12 : 8;
    const res = new Uint8Array(headerLen + len);
    const view = new DataView(res.buffer);
    view.setUint16(0, group, true);
    view.setUint16(2, elem, true);
    res[4] = vr.charCodeAt(0);
    res[5] = vr.charCodeAt(1);
    if (is32Bit) {
      view.setUint16(6, 0, true);
      view.setUint32(8, len, true);
      res.set(padded, 12);
    } else {
      view.setUint16(6, len, true);
      res.set(padded, 8);
    }
    return res;
  }

  function strToBytes(str: string): Uint8Array {
    const arr = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i);
    return arr;
  }

  const eVersion = makeElem(0x0002, 0x0001, 'OB', new Uint8Array([0x00, 0x01]));
  const eClass = makeElem(0x0002, 0x0002, 'UI', strToBytes(sopClass + '\0'));
  const eInstance = makeElem(0x0002, 0x0003, 'UI', strToBytes(sopInstance + '\0'));
  const eSyntax = makeElem(0x0002, 0x0010, 'UI', strToBytes(transferSyntax + '\0'));

  const metaLen = eVersion.length + eClass.length + eInstance.length + eSyntax.length;
  const metaBody = new Uint8Array(metaLen);
  let off = 0;
  for (const part of [eVersion, eClass, eInstance, eSyntax]) {
    metaBody.set(part, off);
    off += part.length;
  }

  const eLength = new Uint8Array(12);
  const lenView = new DataView(eLength.buffer);
  lenView.setUint16(0, 0x0002, true);
  lenView.setUint16(2, 0x0000, true);
  eLength[4] = 'U'.charCodeAt(0);
  eLength[5] = 'L'.charCodeAt(0);
  lenView.setUint16(6, 4, true);
  lenView.setUint32(8, metaLen, true);

  const headerTotal = 128 + 4 + 12 + metaLen;
  const out = new Uint8Array(headerTotal + u8.length);
  out[128] = 0x44; out[129] = 0x49; out[130] = 0x43; out[131] = 0x4D; // DICM
  out.set(eLength, 132);
  out.set(metaBody, 144);
  out.set(u8, headerTotal);

  return out.buffer;
}

function initializeCornerstone(): Promise<CornerstoneModules> {
  if (!globalThis.__jesusLovePacsCornerstoneReady) {
    globalThis.__jesusLovePacsCornerstoneReady = Promise.all([
      import('@cornerstonejs/core'),
      import('@cornerstonejs/tools'),
      import('@cornerstonejs/dicom-image-loader'),
    ]).then(([core, tools, dicomImageLoader]) => {
      core.init();
      dicomImageLoader.init({
        maxWebWorkers: 1,
        useLegacyMetadataProvider: true,
      });

      dicomImageLoader.internal.setOptions({
        beforeProcessing: (xhr: XMLHttpRequest) => {
          const response = xhr.response;
          if (response instanceof ArrayBuffer) {
            return Promise.resolve(ensurePart10ArrayBuffer(response));
          }
          return Promise.resolve(response);
        },
      });

      core.metaData.addProvider((type: string) => {
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

      tools.init();
      tools.addTool(tools.ZoomTool);
      tools.addTool(tools.PanTool);
      tools.addTool(tools.WindowLevelTool);
      tools.addTool(tools.StackScrollTool);
      return { core, tools };
    });
  }
  return globalThis.__jesusLovePacsCornerstoneReady;
}

interface DicomViewerProps {
  instanceIds: string[];
  metadata: {
    patientName: string;
    patientId: string;
    studyDescription: string;
    studyDate: string;
    modality: string;
    studyInstanceUid: string;
    seriesInstanceUid?: string;
  };
}

export default function DicomViewer({ instanceIds, metadata }: DicomViewerProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [activeTool, setActiveTool] = useState<ToolMode>('zoom');
  const [status, setStatus] = useState<string>('DICOM 파일을 불러오는 중입니다.');
  const [error, setError] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [currentSlice, setCurrentSlice] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    const renderingEngineId = `engine-${crypto.randomUUID()}`;
    const viewportId = `viewport-${crypto.randomUUID()}`;
    const toolGroupId = `toolgroup-${crypto.randomUUID()}`;

    async function loadDicom() {
      if (!elementRef.current) return;
      if (!instanceIds || instanceIds.length === 0) {
        if (mounted) {
          setError('해당 검사에 등록된 DICOM Instance가 없습니다.');
          setStatus('');
        }
        return;
      }

      try {
        if (mounted) setStatus('Cornerstone3D 렌더링 엔진 초기화 중...');
        const { core, tools } = await initializeCornerstone();
        if (!mounted || !elementRef.current) return;

        if (mounted) setStatus('DICOM 뷰포트 구성 중...');
        const renderingEngine = new core.RenderingEngine(renderingEngineId);
        renderingEngine.enableElement({
          viewportId,
          type: core.Enums.ViewportType.STACK,
          element: elementRef.current,
          defaultOptions: { background: [0, 0, 0] },
        });

        const toolGroup = tools.ToolGroupManager.createToolGroup(toolGroupId);
        if (!toolGroup) throw new Error('Viewer 도구 그룹을 생성할 수 없습니다.');

        toolGroup.addTool(tools.ZoomTool.toolName);
        toolGroup.addTool(tools.PanTool.toolName);
        toolGroup.addTool(tools.WindowLevelTool.toolName);
        toolGroup.addTool(tools.StackScrollTool.toolName);

        // Bind mouse wheel to StackScrollTool
        toolGroup.setToolActive(tools.StackScrollTool.toolName, {
          bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }],
        });

        toolGroup.addViewport(viewportId, renderingEngineId);

        const viewport = renderingEngine.getViewport(viewportId) as any;

        // Build image IDs pointing to DICOM binary proxy API
        const imageIds = instanceIds.map(
          (id) => `wadouri:${window.location.origin}/api/orthanc/instance-file?instanceId=${encodeURIComponent(id)}`
        );

        if (mounted) setStatus(`DICOM 이미지 로드 중 (총 ${imageIds.length}건)...`);

        // Load and cache the initial image first to verify rendering before showing completion
        const initialImage = await core.imageLoader.loadAndCacheImage(imageIds[0]);
        if (!mounted || !elementRef.current) return;

        // Setup Stack in viewport
        await viewport.setStack(imageIds, 0);

        // Adjust VOI based on modality and image properties
        const isCR = metadata.modality === 'CR' || metadata.modality === 'DX' || initialImage.photometricInterpretation === 'MONOCHROME1';
        if (isCR) {
          let lower = 0;
          let upper = 1024;
          if (typeof initialImage.windowCenter === 'number' && typeof initialImage.windowWidth === 'number' && initialImage.windowWidth > 0) {
            lower = initialImage.windowCenter - initialImage.windowWidth / 2;
            upper = initialImage.windowCenter + initialImage.windowWidth / 2;
          } else if (typeof initialImage.minPixelValue === 'number' && typeof initialImage.maxPixelValue === 'number' && initialImage.maxPixelValue > initialImage.minPixelValue) {
            lower = initialImage.minPixelValue;
            upper = initialImage.maxPixelValue;
          }
          viewport.setProperties({
            voiRange: { lower, upper },
            invert: initialImage.photometricInterpretation === 'MONOCHROME1',
          });
        } else if (metadata.modality === 'CT' || metadata.modality === 'MR') {
          const wc = typeof initialImage.windowCenter === 'number' ? initialImage.windowCenter : (metadata.modality === 'MR' ? 800 : 40);
          const ww = typeof initialImage.windowWidth === 'number' ? initialImage.windowWidth : (metadata.modality === 'MR' ? 1400 : 80);
          viewport.setProperties({
            voiRange: {
              lower: wc - ww / 2,
              upper: wc + ww / 2,
            },
            invert: initialImage.photometricInterpretation === 'MONOCHROME1',
          });
        }

        renderingEngine.resize();
        viewport.resetCamera();
        viewport.render();

        // Listen for slice scroll changes
        const element = elementRef.current;
        const handleScroll = () => {
          if (!mounted) return;
          const idx = viewport.getCurrentImageIdIndex();
          setCurrentSlice(idx);
        };
        element.addEventListener(core.Enums.Events.STACK_VIEWPORT_SCROLL, handleScroll);

        viewerRef.current = { renderingEngine, toolGroup, tools, viewport, handleScroll };

        // Activate default Zoom tool
        toolGroup.setToolActive(tools.ZoomTool.toolName, {
          bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }],
        });
        setActiveTool('zoom');

        if (mounted) {
          setIsLoaded(true);
          setStatus(`렌더링 완료 (${imageIds.length}건) · 마우스 휠로 슬라이스 이동, 드래그로 조작 가능`);
        }
      } catch (loadError) {
        console.error('Cornerstone viewer load error:', loadError);
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : 'DICOM 이미지를 불러오지 못했습니다.');
          setStatus('');
        }
      }
    }

    loadDicom();

    return () => {
      mounted = false;
      const viewer = viewerRef.current;
      if (viewer) {
        if (elementRef.current && viewer.handleScroll) {
          elementRef.current.removeEventListener(
            'CORNERSTONE_STACK_VIEWPORT_SCROLL' as any,
            viewer.handleScroll
          );
        }
        try {
          viewer.tools.ToolGroupManager.destroyToolGroup(toolGroupId);
          viewer.renderingEngine.destroy();
        } catch {
          // Cleanup error ignore
        }
        viewerRef.current = null;
      }
    };
  }, [instanceIds, metadata.modality]);

  function activateTool(mode: ToolMode) {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const { toolGroup, tools } = viewer;

    toolGroup.setToolPassive(tools.ZoomTool.toolName);
    toolGroup.setToolPassive(tools.PanTool.toolName);
    toolGroup.setToolPassive(tools.WindowLevelTool.toolName);

    const selectedTool = mode === 'zoom' ? tools.ZoomTool : mode === 'pan' ? tools.PanTool : tools.WindowLevelTool;
    toolGroup.setToolActive(selectedTool.toolName, {
      bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }],
    });

    // Ensure mouse wheel stack scroll is preserved
    toolGroup.setToolActive(tools.StackScrollTool.toolName, {
      bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }],
    });

    setActiveTool(mode);
  }

  function resetViewer() {
    const viewport = viewerRef.current?.viewport;
    if (!viewport) return;
    viewport.resetCamera();
    viewport.resetProperties();
    viewport.render();
    activateTool('zoom');
  }

  return (
    <section className="viewer-canvas dicom-canvas" aria-label="DICOM Viewer Canvas">
      <div className="viewer-toolbar" aria-label="Viewer 도구">
        <button
          className={activeTool === 'zoom' ? 'active' : ''}
          type="button"
          onClick={() => activateTool('zoom')}
        >
          ⌕ Zoom
        </button>
        <button
          className={activeTool === 'pan' ? 'active' : ''}
          type="button"
          onClick={() => activateTool('pan')}
        >
          ✥ Pan
        </button>
        <button
          className={activeTool === 'windowLevel' ? 'active' : ''}
          type="button"
          onClick={() => activateTool('windowLevel')}
        >
          ◐ W/L
        </button>
        <button className="reset" type="button" onClick={resetViewer}>
          ↻ Reset
        </button>
        <span className="viewer-slice-badge">
          🎞 {instanceIds.length > 0 ? currentSlice + 1 : 0} / {instanceIds.length}
        </span>
      </div>

      <div className="cornerstone-viewport" ref={elementRef} />

      {/* DICOM Metadata Corner Overlays */}
      {isLoaded && (
        <>
          <div className="viewer-overlay top-left">
            <div className="primary-text">{metadata.patientName || 'ANONYMOUS'}</div>
            <div>ID: {metadata.patientId || '-'}</div>
            <div>MODALITY: {metadata.modality}</div>
          </div>
          <div className="viewer-overlay top-right">
            <div>{metadata.studyDescription || '-'}</div>
            <div>DATE: {metadata.studyDate || '-'}</div>
            <div className="slice-text">
              IMAGE: {currentSlice + 1} / {instanceIds.length}
            </div>
          </div>
          <div className="viewer-overlay bottom-left">
            <div>TOOL: {activeTool.toUpperCase()}</div>
            <div>SCROLL: MOUSE WHEEL</div>
          </div>
          <div className="viewer-overlay bottom-right">
            <div title={metadata.studyInstanceUid}>
              STUDY: {metadata.studyInstanceUid.length > 25 ? `${metadata.studyInstanceUid.slice(0, 25)}...` : metadata.studyInstanceUid}
            </div>
            {metadata.seriesInstanceUid && (
              <div title={metadata.seriesInstanceUid}>
                SERIES: {metadata.seriesInstanceUid.length > 25 ? `${metadata.seriesInstanceUid.slice(0, 25)}...` : metadata.seriesInstanceUid}
              </div>
            )}
            <div>예수사랑병원 PACS</div>
          </div>
        </>
      )}

      {status && <p className="viewer-status">{status}</p>}
      {error && (
        <div className="viewer-error">
          <strong>DICOM 로딩 오류</strong>
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}
