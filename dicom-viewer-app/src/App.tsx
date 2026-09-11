import { useEffect, useRef, useState } from 'react';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import * as dicomParser from 'dicom-parser';
import './index.css';

type ToolMode = 'zoom' | 'pan' | 'windowLevel';

let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

function ensurePart10ArrayBuffer(inputBuf: ArrayBuffer): ArrayBuffer {
  const u8 = new Uint8Array(inputBuf);
  // DICM prefix at byte 128
  if (u8.length > 132 && u8[128] === 0x44 && u8[129] === 0x49 && u8[130] === 0x43 && u8[131] === 0x4D) {
    return inputBuf;
  }

  // Non-Part 10 raw DICOM: wrap with DICOM Part 10 Header (preamble + DICM + File Meta Information)
  let sopClass = '1.2.840.10008.5.1.4.1.1.1'; // CR Image Storage default
  let sopInstance = '1.2.392.200036.9125.0.19950720112207';
  const transferSyntax = '1.2.840.10008.1.2'; // Implicit VR Little Endian

  try {
    const rawDs = dicomParser.parseDicom(u8, { TransferSyntaxUID: transferSyntax });
    const sc = rawDs.string('x00080016');
    if (sc) sopClass = sc.trim();
    const si = rawDs.string('x00080018');
    if (si) sopInstance = si.trim();
  } catch (e) {
    console.warn('Fallback metadata extraction on raw DICOM:', e);
  }

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
  // 128 bytes preamble initialized to zeros
  out[128] = 0x44; out[129] = 0x49; out[130] = 0x43; out[131] = 0x4D; // DICM
  out.set(eLength, 132);
  out.set(metaBody, 144);
  out.set(u8, headerTotal);

  return out.buffer;
}

async function loadInitialImageWithRetry(imageId: string, maxAttempts = 3): Promise<any> {
  let lastError: unknown = new Error('초기 이미지 로드 실패');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[Viewer] loadAndCacheImage attempt ${attempt}/${maxAttempts}`, imageId);
    let timeoutId: number | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error(`초기 이미지 로드 시간 초과 (${attempt}/${maxAttempts})`));
        }, 8000);
      });
      const image = await Promise.race([
        cornerstone.imageLoader.loadAndCacheImage(imageId),
        timeoutPromise,
      ]);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      return image;
    } catch (err) {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      lastError = err;
      console.warn(`[Viewer] loadAndCacheImage retry ${attempt}/${maxAttempts}`, err);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
    }
  }

  throw lastError;
}

async function preloadDicomFile(imageId: string, maxAttempts = 3): Promise<string> {
  const url = imageId.replace(/^wadouri:/, '');
  let lastError: unknown = new Error('DICOM 파일 사전 로드 실패');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);
    try {
      console.log(`[Viewer] DICOM prefetch start ${attempt}/${maxAttempts}`, url);
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`DICOM 파일 요청 실패 (${response.status})`);
      }
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0) {
        throw new Error('DICOM 파일이 비어 있습니다');
      }
      const localImageId = dicomImageLoader.wadouri.fileManager.add(
        new Blob([buffer], { type: response.headers.get('content-type') || 'application/dicom' })
      );
      console.log('[Viewer] DICOM prefetch complete', { localImageId, bytes: buffer.byteLength });
      return localImageId;
    } catch (err) {
      lastError = err;
      console.warn(`[Viewer] DICOM prefetch retry ${attempt}/${maxAttempts}`, err);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw lastError;
}

function initCornerstone(): Promise<void> {
  if (isInitialized) return Promise.resolve();
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    console.log('[Viewer] Cornerstone initialization start');
    await cornerstone.init({
      rendering: {
        useCPURendering: false,
        preferSizeOverAccuracy: true,
      },
    } as any);
    await cornerstoneTools.init();

    cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
    cornerstoneTools.addTool(cornerstoneTools.PanTool);
    cornerstoneTools.addTool(cornerstoneTools.WindowLevelTool);
    cornerstoneTools.addTool(cornerstoneTools.StackScrollTool);

    await dicomImageLoader.init({
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
    console.log('[Viewer] Cornerstone initialization complete');
  })().catch((err) => {
    initializationPromise = null;
    isInitialized = false;
    throw err;
  });

  return initializationPromise;
}

export default function App() {
  const elementRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<{
    renderingEngine: cornerstone.RenderingEngine;
    toolGroup: cornerstoneTools.Types.IToolGroup;
    viewport: cornerstone.Types.IStackViewport;
  } | null>(null);

  // Parse study & series metadata parameters from URL
  const queryParams = new URLSearchParams(window.location.search);
  const studyInstanceUid = queryParams.get('studyInstanceUid') || '';
  const seriesInstanceUid = queryParams.get('seriesInstanceUid') || '';
  const seriesDescription = queryParams.get('seriesDescription') || '';
  const orthancStudyId = queryParams.get('orthancStudyId') || '';
  const orthancSeriesId = queryParams.get('orthancSeriesId') || '';
  const accessionNumber = queryParams.get('accessionNumber') || '';
  const patientId = queryParams.get('patientId') || '';

  const orthancInstanceId = queryParams.get('orthancInstanceId') || '';

  const [activeTool, setActiveTool] = useState<ToolMode>('zoom');
  const [status, setStatus] = useState<string>('초기화 준비 중...');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [totalImages, setTotalImages] = useState<number>(1);
  const [dicomInfo, setDicomInfo] = useState<{
    dimensions: string;
    transferSyntax: string;
    modality: string;
  } | null>(null);

  const showDemoOverlay =
    studyInstanceUid === '2.25.887231153867654541861939074535722688801' &&
    Boolean(dicomInfo) &&
    !isLoading &&
    !error;

  const setupRunRef = useRef(0);

  useEffect(() => {
    const runId = ++setupRunRef.current;
    let isMounted = true;
    const isActive = () => isMounted && setupRunRef.current === runId;
    const renderingEngineId = 'jesus-love-engine';
    const viewportId = 'xray-viewport-main';
    const toolGroupId = 'xray-tool-group-main';
    let renderingEngine: cornerstone.RenderingEngine | null = null;
    let toolGroup: cornerstoneTools.Types.IToolGroup | null = null;
    let imageRenderedHandler: (() => void) | null = null;

    async function setupViewer() {
      if (!elementRef.current) return;

      try {
        setStatus('Cornerstone3D 및 DICOM Loader 초기화 중...');
        await initCornerstone();
        console.log('[Viewer] loader init complete');

        if (!isActive() || !elementRef.current) return;

        setStatus('렌더링 엔진 구성 중...');
        renderingEngine = new cornerstone.RenderingEngine(renderingEngineId);
        console.log('[Viewer] rendering engine created');

        renderingEngine.enableElement({
          viewportId,
          type: cornerstone.Enums.ViewportType.STACK,
          element: elementRef.current,
          defaultOptions: {
            background: [0, 0, 0] as cornerstone.Types.Point3,
          },
        });
        console.log('[Viewer] viewport enabled');

        toolGroup = cornerstoneTools.ToolGroupManager.createToolGroup(toolGroupId) ?? null;
        if (!toolGroup) {
          throw new Error('ToolGroup 생성 실패');
        }

        toolGroup.addTool(cornerstoneTools.ZoomTool.toolName);
        toolGroup.addTool(cornerstoneTools.PanTool.toolName);
        toolGroup.addTool(cornerstoneTools.WindowLevelTool.toolName);
        toolGroup.addTool(cornerstoneTools.StackScrollTool.toolName);

        // Bind mouse wheel to StackScrollTool
        toolGroup.setToolActive(cornerstoneTools.StackScrollTool.toolName, {
          bindings: [
            {
              mouseButton: cornerstoneTools.Enums.MouseBindings.Wheel,
            },
          ],
        });

        toolGroup.addViewport(viewportId, renderingEngineId);

        const viewport = renderingEngine.getViewport(viewportId) as cornerstone.Types.IStackViewport;
        viewerRef.current = { renderingEngine, toolGroup, viewport };

        // Determine images to load: Orthanc instance, series instances, study instances or fallback
        let imageIds: string[] = [];
        let fetchedInstances: Array<{
          ID: string;
          IndexInSeries?: number;
          MainDicomTags?: {
            InstanceNumber?: string;
            SOPInstanceUID?: string;
            Modality?: string;
          };
        }> = [];

        // 1. 단일 Instance ID가 전달된 경우
        if (orthancInstanceId) {
          imageIds = [`wadouri:${window.location.origin}/orthanc/instances/${orthancInstanceId}/file`];
        } else if (orthancSeriesId) {
          // 2. Series ID가 전달된 경우
          setStatus(`Orthanc Series (${orthancSeriesId.slice(0, 8)}...) Instance 목록 조회 중...`);
          try {
            const resp = await fetch(`/orthanc/series/${orthancSeriesId}`);
            if (!resp.ok) {
              throw new Error(`Orthanc series instances 조회 실패: HTTP ${resp.status}`);
            }
            const seriesData = (await resp.json()) as { Instances?: string[] };
            const instanceIds = seriesData.Instances ?? [];
            const firstInstance = instanceIds.length > 0
              ? await (async () => {
                const r = await fetch(`/orthanc/instances/${instanceIds[0]}`);
                return { ID: instanceIds[0], MainDicomTags: r.ok ? (await r.json()).MainDicomTags : undefined };
              })()
              : null;
            const normalizedInstancesData = (firstInstance ? [firstInstance] : []) as Array<{
               ID: string;
               IndexInSeries?: number;
               MainDicomTags?: {
                 InstanceNumber?: string;
                 SOPInstanceUID?: string;
                 Modality?: string;
               };
            }>;
            fetchedInstances = normalizedInstancesData;

            if (instanceIds.length > 0) {
              imageIds = instanceIds.map(
                (id) => `wadouri:${window.location.origin}/orthanc/instances/${id}/file`
              );
            }
          } catch (fetchErr) {
            console.warn('Orthanc Series API 조회 실패:', fetchErr);
          }
        } else if (orthancStudyId) {
          // 3. Study ID가 전달된 경우
          setStatus(`Orthanc Study (${orthancStudyId.slice(0, 8)}...) Series 조회 중...`);
          try {
            const studyResp = await fetch(`/orthanc/studies/${orthancStudyId}`);
            if (studyResp.ok) {
              const studyData = await studyResp.json() as { Series?: string[] };
              const seriesIds = studyData.Series || [];
              // A Study-level view may contain multiple phase Series (for
              // example the synthetic liver CT). Combine their image IDs in
              // SeriesNumber order; explicit Series-level views still use the
              // dedicated orthancSeriesId branch and keep a 12-image stack.
              const selectedSeriesIds = seriesIds;
              const seriesImageGroups: Array<{ seriesNumber: number; imageIds: string[] }> = [];
              for (const sId of selectedSeriesIds) {
                const sResp = await fetch(`/orthanc/series/${sId}`);
                if (sResp.ok) {
                  const seriesData = await sResp.json() as { Instances?: string[]; MainDicomTags?: { Modality?: string } };
                  const seriesUid = (seriesData.MainDicomTags as { SeriesInstanceUID?: string } | undefined)?.SeriesInstanceUID || '';
                  const seriesDesc = (seriesData.MainDicomTags as { SeriesDescription?: string } | undefined)?.SeriesDescription || '';
                  if ((seriesInstanceUid && seriesUid !== seriesInstanceUid) || (seriesDescription && seriesDesc !== seriesDescription)) continue;
                  const instanceIds = seriesData.Instances ?? [];
                  // The Series response already contains every instance ID. Fetch only
                  // the first instance's metadata so the first image can start loading
                  // without waiting for all 32 instance-detail requests to complete.
                  if (instanceIds.length > 0) {
                    const firstInstanceResp = await fetch(`/orthanc/instances/${instanceIds[0]}`);
                    const firstInstance = firstInstanceResp.ok
                      ? await firstInstanceResp.json() as { ID: string; MainDicomTags?: { Modality?: string } }
                      : { ID: instanceIds[0] };
                    fetchedInstances.push({
                      ...firstInstance,
                      MainDicomTags: {
                        ...firstInstance.MainDicomTags,
                        Modality: seriesData.MainDicomTags?.Modality,
                      },
                    });
                  }
                  const seriesNumber = Number.parseInt((seriesData.MainDicomTags as { SeriesNumber?: string } | undefined)?.SeriesNumber || '', 10);
                  seriesImageGroups.push({
                    seriesNumber: Number.isNaN(seriesNumber) ? Number.MAX_SAFE_INTEGER : seriesNumber,
                    imageIds: instanceIds.map((instanceId) =>
                      `wadouri:${window.location.origin}/orthanc/instances/${instanceId}/file`
                    ),
                  });
                }
              }
              seriesImageGroups.sort((a, b) => a.seriesNumber - b.seriesNumber);
              imageIds.push(...seriesImageGroups.flatMap((group) => group.imageIds));
            }
          } catch (fetchErr) {
            console.warn('Orthanc Study API 조회 실패:', fetchErr);
          }
        }

        if (!isActive()) return;

        // Fallback to sample-xray if no instances loaded from Orthanc
        if (imageIds.length === 0) {
          imageIds = [`wadouri:${window.location.origin}/sample-dicom/sample-xray.dcm`];
        }

        setTotalImages(imageIds.length);
        setCurrentImageIndex(0);

        setStatus(`DICOM 파일 (${imageIds.length}건) 로드 및 Stack 생성 중...`);
        // Fetch the first file once and hand it to dicom-image-loader's local
        // file manager. This avoids a second, competing WADO-URI request when
        // StackViewport.setStack() loads the initial image.
        const localInitialImageId = await preloadDicomFile(imageIds[0]);
        imageIds[0] = localInitialImageId;
        const initialImageId = localInitialImageId;
        setStatus('첫 DICOM 이미지 디코딩 중...');
        console.log('[Viewer] loadAndCacheImage start', initialImageId);
        const image = await loadInitialImageWithRetry(initialImageId);
        console.log('[Viewer] loadAndCacheImage resolved', image);
        if (!isActive()) return;

        setStatus('Stack 연결 중...');
        console.log('[Viewer] setStack start', { imageCount: imageIds.length });
        await viewport.setStack(imageIds, 0);
        console.log('[Viewer] setStack resolved');
        if (!isActive()) return;

        // Listen to stack scroll / image changed events to update currentImageIndex
        const element = elementRef.current;
        const handleImageRendered = () => {
          if (!isActive()) return;
          const currentIdx = viewport.getCurrentImageIdIndex();
          setCurrentImageIndex(currentIdx);
        };
        imageRenderedHandler = handleImageRendered;
        element.addEventListener(cornerstone.Enums.Events.STACK_VIEWPORT_SCROLL, handleImageRendered);
        element.addEventListener(cornerstone.Enums.Events.IMAGE_RENDERED, handleImageRendered);

        if (image) {
          (window as any).__debugDicomInfo = {
            hasImage: true,
            imageId: initialImageId,
            totalImages: imageIds.length,
            columns: image.columns,
            rows: image.rows,
            minPixelValue: image.minPixelValue,
            maxPixelValue: image.maxPixelValue,
            windowCenter: image.windowCenter,
            windowWidth: image.windowWidth,
            photometric: image.photometricInterpretation,
            pixelDataLength: image.getPixelData ? image.getPixelData().length : null,
            viewportProperties: viewport.getProperties(),
            camera: viewport.getCamera(),
          };

            const seriesMetadata = cornerstone.metaData.get('generalSeriesModule', initialImageId) as { modality?: string } | undefined;
            const dicomModality = fetchedInstances?.[0]?.MainDicomTags?.Modality || seriesMetadata?.modality || (image.photometricInterpretation === 'MONOCHROME1' || image.rows > 1500 ? 'CR' : 'CT');
            const isCR = dicomModality === 'CR' || dicomModality === 'DX' || image.photometricInterpretation === 'MONOCHROME1';

            const isUS = dicomModality === 'US';
            const isColor = image.photometricInterpretation === 'RGB' || image.color;

            if (isCR) {
              // Calculate VOI based on DICOM window tags or image pixel range
              let lower = 0;
              let upper = 1024;
              if (typeof image.windowCenter === 'number' && typeof image.windowWidth === 'number' && image.windowWidth > 0) {
                lower = image.windowCenter - image.windowWidth / 2;
                upper = image.windowCenter + image.windowWidth / 2;
              } else if (Array.isArray(image.windowCenter) && Array.isArray(image.windowWidth) && image.windowWidth[0] > 0) {
                lower = image.windowCenter[0] - image.windowWidth[0] / 2;
                upper = image.windowCenter[0] + image.windowWidth[0] / 2;
              } else if (typeof image.minPixelValue === 'number' && typeof image.maxPixelValue === 'number' && image.maxPixelValue > image.minPixelValue) {
                lower = image.minPixelValue;
                upper = image.maxPixelValue;
              } else {
                lower = 0;
                upper = 1024;
              }

              viewport.setProperties({
                voiRange: {
                  lower,
                  upper,
                },
                invert: image.photometricInterpretation === 'MONOCHROME1',
              });
              setDicomInfo({
                dimensions: `${image.columns} x ${image.rows}`,
                transferSyntax: 'Implicit VR Little Endian',
                modality: 'CR (X-Ray)',
              });
            } else if (isColor || isUS) {
              // Ultrasound or RGB color image: VOI default 0..255 or native range
              viewport.setProperties({
                voiRange: {
                  lower: 0,
                  upper: 255,
                },
                invert: false,
              });
              setDicomInfo({
                dimensions: `${image.columns} x ${image.rows}`,
                transferSyntax: 'Explicit VR Little Endian',
                modality: isUS ? 'US (Ultrasound)' : `${dicomModality} (Color)`,
              });
            } else {
              // CT / MR / Cross-sectional slice settings using DICOM WindowCenter & WindowWidth
              const wc = typeof image.windowCenter === 'number' ? image.windowCenter : (Array.isArray(image.windowCenter) ? image.windowCenter[0] : (dicomModality === 'MR' ? 800 : 40));
              const ww = typeof image.windowWidth === 'number' ? image.windowWidth : (Array.isArray(image.windowWidth) ? image.windowWidth[0] : (dicomModality === 'MR' ? 1400 : 80));
              const lower = wc - ww / 2;
              const upper = wc + ww / 2;

              viewport.setProperties({
                voiRange: {
                  lower: isNaN(lower) ? 0 : lower,
                  upper: isNaN(upper) ? (dicomModality === 'MR' ? 1500 : 100) : upper,
                },
                invert: image.photometricInterpretation === 'MONOCHROME1',
              });

              const modalityDisplay = dicomModality === 'MR'
                ? 'MR (Magnetic Resonance)'
                : dicomModality === 'CT'
                ? 'CT (Computed Tomography)'
                : `${dicomModality} (Cross-sectional)`;

              setDicomInfo({
                dimensions: `${image.columns} x ${image.rows}`,
                transferSyntax: 'Explicit VR Little Endian',
                modality: modalityDisplay,
              });
            }
        }

        (window as any).__csViewport = viewport;
        (window as any).__csRenderingEngine = renderingEngine;

        renderingEngine.resize();
        viewport.resetCamera();
        if (orthancStudyId === '7542e7cc-ddeaf4f4-0aa2d511-43bfa083-d9900229') {
          const camera = viewport.getCamera();
          camera.parallelScale = Math.max(image.rows, image.columns) * 1.15;
          viewport.setCamera(camera);
        }

        const imageRenderedPromise = new Promise<void>((resolve, reject) => {
          const timeoutId = window.setTimeout(() => {
            element.removeEventListener(cornerstone.Enums.Events.IMAGE_RENDERED, onFirstImageRendered);
            reject(new Error('IMAGE_RENDERED 이벤트 대기 시간 초과'));
          }, 15000);
          function onFirstImageRendered() {
            window.clearTimeout(timeoutId);
            element.removeEventListener(cornerstone.Enums.Events.IMAGE_RENDERED, onFirstImageRendered);
            console.log('[Viewer] image rendered event');
            resolve();
          }
          element.addEventListener(cornerstone.Enums.Events.IMAGE_RENDERED, onFirstImageRendered);
        });

        console.log('[Viewer] viewport render called');
        viewport.render();
        await imageRenderedPromise;
        if (!isActive()) return;

        setTool('zoom');
        setIsLoading(false);
        setStatus(`DICOM Stack (${imageIds.length}건) 렌더링 완료`);
      } catch (err) {
        console.error('DICOM Viewer Load Error:', err);
        if (isActive()) {
          setError(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
          setStatus('오류가 발생했습니다.');
        }
      }
    }

    setupViewer();

    return () => {
      isMounted = false;
      if (elementRef.current && imageRenderedHandler) {
        elementRef.current.removeEventListener(cornerstone.Enums.Events.STACK_VIEWPORT_SCROLL, imageRenderedHandler);
        elementRef.current.removeEventListener(cornerstone.Enums.Events.IMAGE_RENDERED, imageRenderedHandler);
      }
      if (viewerRef.current?.renderingEngine === renderingEngine) {
        try {
          cornerstoneTools.ToolGroupManager.destroyToolGroup(toolGroupId);
        } catch (cleanupErr) {
          console.warn('[Viewer] ToolGroup cleanup skipped:', cleanupErr);
        }
        renderingEngine?.destroy();
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

    // Keep mouse-wheel stack navigation active while switching the primary tool.
    // This is especially important for two-frame synthetic C-arm PRE/POST studies.
    toolGroup.setToolActive(cornerstoneTools.StackScrollTool.toolName, {
      bindings: [
        {
          mouseButton: cornerstoneTools.Enums.MouseBindings.Wheel,
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
          <span className="badge-tag">Series Stack</span>
          <h1>예수사랑병원 Cornerstone3D DICOM Viewer</h1>
        </div>
        <div className="patient-pill" title={orthancStudyId ? `Orthanc Study: ${orthancStudyId}` : undefined}>
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
          <div className="stack-indicator-badge">
            🎞 {currentImageIndex + 1} / {totalImages}
          </div>
        </div>

        <div className="viewer-viewport-wrapper">
          <div
            id="cornerstone-element"
            ref={elementRef}
            className="cornerstone-canvas-container"
          />

          {dicomInfo && !showDemoOverlay && (
            <>
              <div className="info-overlay top-left">
                <div>예수사랑병원 영상의학과</div>
                <div>MODALITY: {dicomInfo.modality}</div>
                <div>DIMENSIONS: {dicomInfo.dimensions}</div>
              </div>
              <div className="info-overlay top-right">
                <div>IMAGE: {currentImageIndex + 1} / {totalImages}</div>
                <div>SYNTAX: {dicomInfo.transferSyntax}</div>
                <div>CODEC: Uncompressed / JPEG 2000</div>
              </div>
              <div className="info-overlay bottom-left">
                <div>TOOL: {activeTool.toUpperCase()} (Primary Drag)</div>
                <div>SCROLL: MOUSE WHEEL</div>
              </div>
              <div className="info-overlay bottom-right">
                {studyInstanceUid && <div title={studyInstanceUid}>STUDY: {studyInstanceUid.slice(0, 20)}...</div>}
                {seriesInstanceUid && <div title={seriesInstanceUid}>SERIES: {seriesInstanceUid.slice(0, 20)}...</div>}
                <div>Cornerstone3D v5.8.2 Stack Viewport</div>
              </div>
            </>
          )}

          {showDemoOverlay && (
            <div className="demo-pacs-overlay" aria-label="Synthetic Chest X-ray 포트폴리오 오버레이">
              <div className="demo-pacs-overlay__corner demo-pacs-overlay__top-left">
                <strong>정현우</strong>
                <span>M / 31Y</span>
                <span>DOB: 1995-04-03</span>
                <span>Chest PA</span>
              </div>
              <div className="demo-pacs-overlay__corner demo-pacs-overlay__top-right">
                <strong>Jesus Love Hospital</strong>
                <span>2026-09-11 14:30</span>
              </div>
              <div className="demo-pacs-overlay__corner demo-pacs-overlay__bottom-left">
                <span>120 kVp</span>
                <span>2.5 mAs</span>
                <span>Exposure Time: 10 ms</span>
              </div>
              <div className="demo-pacs-overlay__corner demo-pacs-overlay__bottom-right">
                <span>Dose: 0.12 mGy</span>
                <span>DX</span>
                <span>PA</span>
              </div>
            </div>
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
