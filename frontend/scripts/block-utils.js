let modelsdir = null;
let cesiumToken = null;
const BACKEND_URL = window.BACKEND_URL;

/**
 * Carga la configuración pública desde el backend.
 * Solo devuelve lo necesario para el frontend.
 */
export async function loadConfig() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/config`);
    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
    const config = await response.json();
    modelsdir = config.modelsdir;
    cesiumToken = config.cesiumToken;
    Cesium.Ion.defaultAccessToken = cesiumToken;
    return config;
  } catch (error) {
    console.error('Error cargando configuración:', error);
    throw error;
  }
}

export function createViewer(containerId) {
  const viewer = new Cesium.Viewer(containerId, {
    animation: false,
    baseLayerPicker: true,
    navigationHelpButton: true,
    sceneModePicker: false,
    homeButton: false,
    geocoder: false,
    fullscreenButton: false,
    timeline: false,
    selectionIndicator: false,
    infoBox: false,
    terrain: Cesium.Terrain.fromWorldTerrain(),
    sceneMode: Cesium.SceneMode.SCENE3D
  });

  viewer.scene.globe.depthTestAgainstTerrain = false;
  viewer.scene.skyAtmosphere.show = true;
  viewer.scene.fog.enabled = false;
  viewer.scene.globe.enableLighting = true;

  viewer.scene.shadowMap.softShadows = true;
  viewer.scene.shadowMap.size = 2048;
  viewer.scene.shadowMap.darkness = 0.6;
  viewer.scene.shadowMap.maximumDistance = 1000.0;

  // Inicializar luz solar
  viewer.scene.light = new Cesium.SunLight();

  if (!viewer.scene.pickPositionSupported) {
    console.warn("pickPosition no soportado");
  }

  return viewer;
}

export const createButton = (panel, text, className, onClick) => {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.className = className;
  btn.onclick = onClick;
  panel.appendChild(btn);
  return btn;
};

/**
 * Carga un 3D Tileset
 */
export async function loadTileset(viewer, school, sector, block) {
  if (!modelsdir) throw new Error('Config no cargada. Llama a loadConfig() primero.');
  const url = `${modelsdir}/${school}/${sector}/${block}/tileset.json`;

  try {
    const tileset = await Cesium.Cesium3DTileset.fromUrl(url);
    viewer.scene.primitives.add(tileset);
    viewer._mainTileset = tileset;

    // Zoom inicial
    try {
      await viewer.zoomTo(tileset, new Cesium.HeadingPitchRange(0, -1.57, 0));
    } catch (e) {
      console.warn('Zoom al tileset falló, continuando sin bloquear:', e);
    }

    console.log(`Tileset cargado correctamente: ${url}`);
    return tileset;
  } catch (error) {
    console.warn(`No se pudo cargar el tileset 3D: ${url}`, error);
    return null;
  }
}


/**
 * Carga líneas desde la API de problemas del backend
 * Evita errores si las posiciones no están disponibles
 */
export async function loadLinesFromDb(viewer, school, sector, block) {
  const allPositions = [];
  const lineEntities = [];
  const labelData = [];
  const allLinePositions = [];
  const apiUrl = `${BACKEND_URL}/api/v1/${school}/${sector}/${block}/problems`;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
    const linesData = await response.json();

    linesData.forEach((line, lineIndex) => {
      if (!line.positions || !line.positions.length) {
        console.warn(`Línea sin posiciones: ${line.name ?? 'Sin nombre'}`);
        return;
      }

      const positions = line.positions
        .map(p => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height))
        .filter(p => !!p);

      if (!positions.length) {
        console.warn(`Línea ${line.name ?? 'Sin nombre'} tiene posiciones inválidas`);
        return;
      }

      allPositions.push(...positions);
      allLinePositions.push(positions);

      const grades = [line.grade, line.grade_ss]
                    .filter(g => g && g.trim() !== "")
      const minGrade =  grades.length ? grades.sort().at(-1) : ""
      const lineColor = getColorByGrade(minGrade);
      const lineWidth = getLineWidthByGrade(minGrade);

      try {
        const entity = viewer.entities.add({
          polyline: {
            positions,
            width: lineWidth,
            material: lineColor.withAlpha(0.4),
            clampToGround: false,
            arcType: Cesium.ArcType.NONE,
            shadows: Cesium.ShadowMode.DISABLED,
            
          },
          customAttributes: { 
            ...line, 
            type: 'line',
            originalColor: lineColor
          }
        });
        lineEntities.push(entity);
      } catch (e) {
        console.error(`Error creando entidad para línea ${line.name ?? 'Sin nombre'}:`, e);
      }

      const labelPos = calculateLabelPosition(positions, allLinePositions, lineIndex);
      labelData.push({
        position: labelPos,
        name: line.name,
        grade: line.grade,
        grade_ss: line.grade_ss,
        color: lineColor,
        lineLength: calculateLineLength(positions),
        linePositions: positions
      });
    });

    return { allPositions, lineEntities, labelData, allLinePositions };
  } catch (error) {
    console.error('Error loading lines:', error);
    return { allPositions, lineEntities, labelData, allLinePositions: [] };
  }
}


/**
 * Determina el color según el grade de dificultad (versión mejorada)
 */
export function getColorByGrade(grade) {
  if (!grade) return Cesium.Color.WHITE;
  
  // 2-4 Azul (#1E88E5 - Azul moderno)
  if (grade.startsWith('2') || grade.startsWith('3') || grade.startsWith('4')) {
    return Cesium.Color.fromCssColorString('#1E88E5');
  }
  // 5-6a Verde (#43A047 - Verde material design)
  else if (grade.startsWith('5') || grade === '6a') {
    return Cesium.Color.fromCssColorString('#43A047');
  }
  // 6a+ - 6b+ Amarillo (#FFD600 - Amarillo vibrante)
  else if (grade.includes('6a+') || grade.includes('6b') || grade === '6a') {
    return Cesium.Color.fromCssColorString('#FFD600');
  }
  // 6c-7a+ Naranja (#FB8C00 - Naranja cálido)
  else if (grade.includes('6c') || grade.includes('7a')) {
    return Cesium.Color.fromCssColorString('#FB8C00');
  }
  // 7b-7c+ Rojo (#E53935 - Rojo intenso)
  else if (grade.includes('7b') || grade.includes('7c')) {
    return Cesium.Color.fromCssColorString('#E53935');
  }
  // 8a-8c+ Morado (#8E24AA - Púrpura elegante)
  else if (grade.includes('8a') || grade.includes('8b') || grade.includes('8c')) {
    return Cesium.Color.fromCssColorString('#8E24AA');
  }
  // 9a para arriba Negro (#212121 - Negro mate)
  else if (grade.startsWith('9')) {
    return Cesium.Color.fromCssColorString('#212121');
  }
  // Por defecto (Blanco suave)
  else {
    return Cesium.Color.fromCssColorString('#F5F5F5');
  }
}

/**
 * Calcula el ancho de línea según el grade
 */
export function getLineWidthByGrade(grade) {
  if (!grade) return 4;
  
  // grades más difíciles = líneas más gruesas
  if (grade.startsWith('2') || grade.startsWith('3') || grade.startsWith('4')) return 3;
  if (grade.startsWith('5') || grade === '6a') return 3.5;
  if (grade.includes('6a+') || grade.includes('6b')) return 4;
  if (grade.includes('6c') || grade.includes('7a')) return 4.5;
  if (grade.includes('7b') || grade.includes('7c')) return 5;
  if (grade.includes('8a') || grade.includes('8b') || grade.includes('8c')) return 5.5;
  if (grade.startsWith('9')) return 6;
  
  return 4;
}

/**
 * Calcula la longitud aproximada de la línea
 */
function calculateLineLength(positions) {
  let length = 0;
  for (let i = 1; i < positions.length; i++) {
    length += Cesium.Cartesian3.distance(positions[i-1], positions[i]);
  }
  return length;
}

/**
 * Agrega labels al viewer (versión mejorada y elegante)
 */
export function addLabels(viewer, labelData) {
  const createdLabels = [];

  labelData.forEach(data => {
    const grades = [data.grade, data.grade_ss]
                   .filter(g => g && g.trim() !== "")
    const minGrade =  grades.length ? grades.sort().at(-1) : ""
    const labelColor = data.color || getColorByGrade(minGrade);

    const gradeText = (data.grade && data.grade.trim() !== '')
      ? `${data.grade}`
      : '';
    const ssGradeText = (data.grade_ss && data.grade_ss.trim() !== '')
      ? `${data.grade_ss} ss`
      : '';

    const entity = viewer.entities.add({
      position: data.position,
      label: {
        text: `${gradeText} \n ${ssGradeText}`,
        font: '600 25px "Montserrat", "Helvetica Neue", Arial, sans-serif',
        fillColor: labelColor.withAlpha(0.70),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        pixelOffset: new Cesium.Cartesian2(0, -22),
        eyeOffset: new Cesium.Cartesian3(0, 0, -0.5),
        scaleByDistance: new Cesium.NearFarScalar(150, 1.0, 5000, 0.5),
        translucencyByDistance: new Cesium.NearFarScalar(2500, 1.0, 8000, 0.0),
        heightReference: Cesium.HeightReference.CLAMP_TO_3D_TILE,
        disableDepthTestDistance: undefined,
      },
      customAttributes: {
        type: 'label',
        originalData: data,
        linePositions: data.linePositions
      }
    });

    createdLabels.push(entity);
  });

  enableLabelSeparation(viewer);
  return createdLabels;
}


/**
 * Calcula la posición óptima para colocar el label de una línea
 * Simple: punto medio de la línea, puede mejorarse más tarde con heurísticas.
 */
export function calculateLabelPosition(positions) {
  if (!positions || !positions.length) return null;

  const midIndex = Math.floor(positions.length / 2);
  return positions[midIndex];
}

/**
 * Ajusta los labels para evitar que se superpongan.
 * Usa un algoritmo simple: separa verticalmente si están muy cerca.
 */
export function enableLabelSeparation(viewer) {
  if (!viewer || !viewer.entities) return;

  const labels = viewer.entities.values.filter(e => e.label);
  if (!labels.length) return;

  const minPixelDistance = 20; // distancia mínima en píxeles para separar

  viewer.scene.preRender.addEventListener(() => {

    for (let i = 0; i < labels.length; i++) {
      const labelA = labels[i];
      if (!labelA.position) continue;

      const screenPosA = Cesium.SceneTransforms.wgs84ToWindowCoordinates(
        viewer.scene,
        labelA.position.getValue(Cesium.JulianDate.now())
      );

      if (!screenPosA) continue;

      for (let j = i + 1; j < labels.length; j++) {
        const labelB = labels[j];
        if (!labelB.position) continue;

        const screenPosB = Cesium.SceneTransforms.wgs84ToWindowCoordinates(
          viewer.scene,
          labelB.position.getValue(Cesium.JulianDate.now())
        );

        if (!screenPosB) continue;

        const dx = screenPosA.x - screenPosB.x;
        const dy = screenPosA.y - screenPosB.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < minPixelDistance) {
          labelB.label.pixelOffset = new Cesium.Cartesian2(0, -minPixelDistance);
        } else {
          labelB.label.pixelOffset = new Cesium.Cartesian2(0, 0);
        }
      }
    }
  });
}

export function hideFloatingInfo(viewer, popupElement, popupTrackedEntity) {
    if (popupElement) popupElement.remove();
    popupElement = null;
    popupTrackedEntity = null;
    viewer.scene.postRender.removeEventListener(updatePopupPosition(viewer, popupTrackedEntity, popupElement));
  }

export function updatePopupPosition(viewer, popupTrackedEntity, popupElement) {
    if (!popupTrackedEntity || !popupElement) return;
    const positions = popupTrackedEntity.polyline.positions.getValue(Cesium.JulianDate.now());
    if (!positions || positions.length < 2) return;

    const midIndex = Math.floor(positions.length / 2);
    const midpoint = Cesium.Cartesian3.midpoint(
      positions[midIndex],
      positions[midIndex + 1] || positions[midIndex],
      new Cesium.Cartesian3()
    );
    const windowPos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, midpoint);
    if (!windowPos) return;

    const cameraDir = viewer.camera.directionWC;
    const pitchDeg = Cesium.Math.toDegrees(Math.asin(cameraDir.z));
    let offsetY = -25;
    if (pitchDeg < -30) offsetY -= 20;
    if (pitchDeg > -5) offsetY += 15;

    popupElement.style.left = `${windowPos.x + 50}px`;
    popupElement.style.top = `${windowPos.y + offsetY}px`;
  }

export function resetEntity(e) {
    const grades = [e.customAttributes?.grade, e.customAttributes?.grade_ss]
                    .filter(g => g && g.trim() !== "");
    const minGrade = grades.length ? grades.sort().at(-1) : "";
    const lineColor = getColorByGrade(minGrade);
    const lineWidth = getLineWidthByGrade(minGrade);
    e.polyline.material = new Cesium.ColorMaterialProperty(lineColor.withAlpha(0.4));
    e.polyline.width = lineWidth;
  }

export function clearSelection(viewer, selectedEntity, popupElement, popupTrackedEntity) {
      if (selectedEntity) resetEntity(selectedEntity);
      hideFloatingInfo(viewer, popupElement, popupTrackedEntity);
      selectedEntity = null;
  }

export let timeLabel = null;
export let timeSlider = null;
export let shadowInfo = null;

export function createTimeControls(panel, referenceBtn, viewer) {
  timeLabel = document.createElement('span');
  timeLabel.id = 'timeLabel';
  timeLabel.className = 'time-label';
  timeLabel.textContent = '12:00';

  const hourLabel = document.createElement('label');
  hourLabel.appendChild(timeLabel);
  hourLabel.className = 'time-label-container';

  timeSlider = document.createElement('input');
  timeSlider.type = 'range';
  timeSlider.id = 'timeSlider';
  timeSlider.min = 6;
  timeSlider.max = 23;
  timeSlider.step = 0.25;
  timeSlider.value = 12;
  timeSlider.className = 'time-slider';

  // Añadir al panel
  const nextSibling = referenceBtn.nextElementSibling;
  panel.insertBefore(hourLabel, nextSibling);
  panel.insertBefore(timeSlider, nextSibling);

  // Evento slider
  timeSlider.addEventListener('input', e => {
    updateSunTime(parseFloat(e.target.value), viewer);
  });

  // Inicializa hora
  updateSunTime(parseFloat(timeSlider.value), viewer);
}

export function removeTimeControls() {
  if (timeSlider) timeSlider.remove();
  if (timeLabel) timeLabel.parentElement.remove();
  if (shadowInfo) shadowInfo.remove();

  timeSlider = null;
  timeLabel = null;
  shadowInfo = null;
}

export function updateSunTime(hour, viewer) {
  const now = new Date();
  now.setHours(hour);
  now.setMinutes((hour % 1) * 60);

  const julianDate = Cesium.JulianDate.fromDate(now);
  viewer.clock.currentTime = julianDate;
  viewer.scene.light = new Cesium.SunLight(julianDate);

  if (timeLabel) {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    timeLabel.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
}

export function toggleEditMode(
  viewer, 
  editModeActive,
  isDrawing,
  activeLine, 
  floatingPoint,
  activeLinePoints,
  pendingLineAttrs,
  selectedEntity, 
  popupElement, 
  popupTrackedEntity
) {
    editModeActive = !editModeActive;

    if (editModeActive) {
        console.log("Modo edición activado");
        enableVertexEditing(viewer);
        isDrawing = false;
        if (activeLine) viewer.entities.remove(activeLine);
        if (floatingPoint) viewer.entities.remove(floatingPoint);
        activeLinePoints = [];
        pendingLineAttrs = null;
    } else {
        console.log("Modo edición desactivado");
        clearSelection(viewer, selectedEntity, popupElement, popupTrackedEntity);
    }
}

export function enableVertexEditing(viewer) {
    viewer.screenSpaceEventHandler.setInputAction((click) => {
        const picked = viewer.scene.pick(click.position);
        if (Cesium.defined(picked) && picked.id?.customAttributes?.type === 'point') {
            const pointEntity = picked.id;
            const relatedLine = viewer.entities.values.find(e =>
                e.customAttributes?.type === 'line' &&
                e.polyline.positions.getValue(Cesium.JulianDate.now()).some(pos =>
                    Cesium.Cartesian3.equals(pos, pointEntity.position.getValue(Cesium.JulianDate.now()))
                )
            );
            if (relatedLine) {
                const positions = relatedLine.polyline.positions.getValue(Cesium.JulianDate.now())
                    .filter(pos => !Cesium.Cartesian3.equals(pos, pointEntity.position.getValue(Cesium.JulianDate.now())));
                relatedLine.polyline.positions = positions;
                viewer.entities.remove(pointEntity);
                updateLinesData(viewer, linesData);
            }
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

export function updateLinesData(viewer, linesData) {
    linesData = viewer.entities.values
        .filter(e => e.polyline && e.customAttributes?.type === 'line')
        .map(entity => {
            const positions = entity.polyline.positions.getValue(Cesium.JulianDate.now());
            let length = 0, minHeight = Infinity, maxHeight = -Infinity;
            for (let i = 1; i < positions.length; i++) length += Cesium.Cartesian3.distance(positions[i - 1], positions[i]);
            positions.forEach(pos => {
                const carto = Cesium.Cartographic.fromCartesian(pos);
                minHeight = Math.min(minHeight, carto.height);
                maxHeight = Math.max(maxHeight, carto.height);
            });

            return {
                grade: entity.customAttributes.grado,
                name: entity.customAttributes.nombre,
                gradeSs: entity.customAttributes.sitstart,
                length,
                height: maxHeight - minHeight,
                positions: positions.map(p => {
                    const c = Cesium.Cartographic.fromCartesian(p);
                    return { lat: Cesium.Math.toDegrees(c.latitude), lon: Cesium.Math.toDegrees(c.longitude), height: c.height };
                }),
            };
        });
}

export function setupLineDrawing(viewer, tileset, school, sector, block, linesData, drawingState) {
    let popup = null;

    function createPoint(position, color = Cesium.Color.YELLOW) {
        return viewer.entities.add({
            position,
            point: { color, pixelSize: 8 },
            customAttributes: { type: 'point' }
        });
    }

    function drawDynamicLine() {
        if (drawingState.activeLine) viewer.entities.remove(drawingState.activeLine);
        drawingState.activeLine = viewer.entities.add({
            polyline: {
                positions: new Cesium.CallbackProperty(() => drawingState.activeLinePoints.slice(), false),
                width: 5,
                clampToGround: false,
                material: new Cesium.PolylineGlowMaterialProperty({ 
                    glowPower: 0.3, 
                    color: Cesium.Color.GREEN 
                }),
                arcType: Cesium.ArcType.NONE
            }
        });
    }

    const OFFSET_DISTANCE = 0.05;
    function offsetTowardCamera(pos) {
        const dir = Cesium.Cartesian3.normalize(
            Cesium.Cartesian3.subtract(viewer.camera.position, pos, new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
        );
        return Cesium.Cartesian3.add(
            pos,
            Cesium.Cartesian3.multiplyByScalar(dir, OFFSET_DISTANCE, new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
        );
    }

    function projectScreenToSurface(screenPos) {
        if (!screenPos) return undefined;
        const win = new Cesium.Cartesian2(screenPos.x, screenPos.y);
        const pos = viewer.scene.pickPosition(win);
        if (Cesium.defined(pos)) return offsetTowardCamera(pos);

        const ray = viewer.camera.getPickRay(win);
        if (!ray) return undefined;
        const hit = viewer.scene.pickFromRay(ray, [tileset]);
        if (Cesium.defined(hit) && Cesium.defined(hit.position)) return offsetTowardCamera(hit.position);

        const globePos = viewer.scene.globe.pick(ray, viewer.scene);
        if (Cesium.defined(globePos)) {
            const normal = viewer.scene.globe.ellipsoid.geodeticSurfaceNormal(globePos);
            return Cesium.Cartesian3.add(
                globePos,
                Cesium.Cartesian3.multiplyByScalar(normal, OFFSET_DISTANCE, new Cesium.Cartesian3()),
                new Cesium.Cartesian3()
            );
        }

        return undefined;
    }

    function terminateDrawing() {
        if (drawingState.floatingPoint) viewer.entities.remove(drawingState.floatingPoint);

        if (drawingState.activeLinePoints.length > 1 && drawingState.pendingLineAttrs) {
            let length = 0;
            let minHeight = Number.POSITIVE_INFINITY;
            let maxHeight = Number.NEGATIVE_INFINITY;

            for (let i = 1; i < drawingState.activeLinePoints.length; i++) {
                length += Cesium.Cartesian3.distance(drawingState.activeLinePoints[i - 1], drawingState.activeLinePoints[i]);
            }

            drawingState.activeLinePoints.forEach(pos => {
                const carto = Cesium.Cartographic.fromCartesian(pos);
                minHeight = Math.min(minHeight, carto.height);
                maxHeight = Math.max(maxHeight, carto.height);
            });

            const height = maxHeight - minHeight;

            const lineColor = getColorByGrade(drawingState.pendingLineAttrs.grade);
            const lineWidth = getLineWidthByGrade(drawingState.pendingLineAttrs.grade);

            viewer.entities.add({
                polyline: {
                    positions: drawingState.activeLinePoints.slice(),
                    width: lineWidth,
                    clampToGround: false,
                    material: new Cesium.ColorMaterialProperty(lineColor.withAlpha(0.4)),
                    arcType: Cesium.ArcType.NONE
                },
                customAttributes: {
                    type: 'line',
                    pointCount: drawingState.activeLinePoints.length,
                    grade: drawingState.pendingLineAttrs.grade,
                    name: drawingState.pendingLineAttrs.name,
                    gradeSs: drawingState.pendingLineAttrs.gradeSs,
                    length,
                    height
                }
            });

            createPoint(drawingState.activeLinePoints[0]);
            createPoint(drawingState.activeLinePoints[drawingState.activeLinePoints.length - 1]);
            updateLinesData(viewer, linesData);

            const problem_attributes = JSON.stringify({
                grade: drawingState.pendingLineAttrs.grade,
                name: drawingState.pendingLineAttrs.name,
                gradeSs: drawingState.pendingLineAttrs.gradeSs,
                length,
                height,
                positions: drawingState.activeLinePoints.map(p => {
                    const c = Cesium.Cartographic.fromCartesian(p);
                    return {
                        lat: Cesium.Math.toDegrees(c.latitude),
                        lon: Cesium.Math.toDegrees(c.longitude),
                        height: c.height
                    };
                })
            });
            console.log(problem_attributes);

            fetch(`${BACKEND_URL}/api/v1/${school}/${sector}/${block}/new-problem`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: problem_attributes
            });
        }

        if (drawingState.activeLine) viewer.entities.remove(drawingState.activeLine);
        drawingState.activeLinePoints = [];
        drawingState.pendingLineAttrs = null;
        drawingState.isDrawing = false;
    }

    function showLineAttrsPopup(onConfirm, onCancel) {
        if (popup) popup.remove();
        popup = document.createElement('div');
        popup.style = `
            position: fixed;
            right: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            background: #fff;
            border: 2px solid #333;
            padding: 20px;
            z-index: 9999;
        `;
        popup.innerHTML = `
            <h3>Completa los atributos del problema</h3>
            <label>Nombre:<br><input id="popupName" type="text"></label><br><br>
            <label>Grado:<br><input id="popupGrade" type="text"></label><br><br>
            <label>Grado (ss):<br><input id="popupGradeSs" type="text"></label><br><br>
            <button id="popupOk">Aceptar</button>
            <button id="popupCancel">Cancelar</button>
        `;
        document.body.appendChild(popup);
        
        document.getElementById('popupOk').onclick = () => {
            const attrs = {
                name: document.getElementById('popupName').value,
                grade: document.getElementById('popupGrade').value,
                gradeSs: document.getElementById('popupGradeSs').value
            };
            drawingState.pendingLineAttrs = attrs;
            onConfirm(attrs);
            popup.remove();
        };

        document.getElementById('popupCancel').onclick = () => {
            if (drawingState.activeLine) viewer.entities.remove(drawingState.activeLine);
            if (drawingState.floatingPoint) viewer.entities.remove(drawingState.floatingPoint);
            drawingState.activeLinePoints = [];
            drawingState.pendingLineAttrs = null;
            drawingState.isDrawing = false;
            
            popup.remove();
            onCancel();
        };
    }

    function startLineDrawing() {
        drawingState.activeLinePoints = [];
        drawingState.isDrawing = true;

        console.log("Modo dibujo activado. Haz click en la superficie para añadir puntos.");

        const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        clickHandler.setInputAction((event) => {
            const position = projectScreenToSurface(event.position);
            if (position) {
                drawingState.activeLinePoints.push(position);
                
                if (drawingState.activeLinePoints.length === 1) {
                    drawingState.floatingPoint = createPoint(position, Cesium.Color.RED);
                    drawDynamicLine();
                } else if (drawingState.activeLinePoints.length === 2) {
                    drawDynamicLine();
                }
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        const moveHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        moveHandler.setInputAction((event) => {
            if (!drawingState.isDrawing || drawingState.activeLinePoints.length === 0) return;
            
            const position = projectScreenToSurface(event.endPosition);
            if (position && drawingState.floatingPoint) {
                drawingState.floatingPoint.position = position;
                
                if (drawingState.activeLinePoints.length >= 1) {
                    drawDynamicLine();
                }
            }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

        const rightClickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        rightClickHandler.setInputAction((event) => {
            if (drawingState.activeLinePoints.length > 1) {
                showLineAttrsPopup(
                    (attrs) => {
                        terminateDrawing();
                        clickHandler.destroy();
                        moveHandler.destroy();
                        rightClickHandler.destroy();
                        if (popup) popup.remove();
                    },
                    () => {
                        if (drawingState.activeLine) viewer.entities.remove(drawingState.activeLine);
                        if (drawingState.floatingPoint) viewer.entities.remove(drawingState.floatingPoint);
                        drawingState.activeLinePoints = [];
                        drawingState.pendingLineAttrs = null;
                        drawingState.isDrawing = false;
                        
                        clickHandler.destroy();
                        moveHandler.destroy();
                        rightClickHandler.destroy();
                        if (popup) popup.remove();
                    }
                );
            }
        }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

        const keyHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        keyHandler.setInputAction((event) => {
            if (event.key === 'Escape') {
                if (drawingState.activeLine) viewer.entities.remove(drawingState.activeLine);
                if (drawingState.floatingPoint) viewer.entities.remove(drawingState.floatingPoint);
                drawingState.activeLinePoints = [];
                drawingState.pendingLineAttrs = null;
                drawingState.isDrawing = false;
                
                clickHandler.destroy();
                moveHandler.destroy();
                rightClickHandler.destroy();
                keyHandler.destroy();
                if (popup) popup.remove();
                console.log("Dibujo cancelado");
            }
        }, Cesium.ScreenSpaceEventType.KEY_DOWN);

        return {
            clickHandler,
            moveHandler,
            rightClickHandler,
            keyHandler
        };
    }

    return startLineDrawing;
}