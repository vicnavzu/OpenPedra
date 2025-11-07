import { 
  createViewer, 
  loadTileset, 
  loadLinesFromDb, 
  enableLabelSeparation, 
  addLabels, 
  loadConfig, 
  getColorByGrade, 
  getLineWidthByGrade,
  createTimeControls, 
  removeTimeControls, 
  updateSunTime, 
  timeLabel, 
  timeSlider,
  toggleEditMode,
  createButton,
  enableVertexEditing,
  updateLinesData,
  clearSelection,
  hideFloatingInfo,
  updatePopupPosition,
  resetEntity,
  setupLineDrawing,
  checkIfLoggedIn,
  showLoginForm,
  addLogoutButton,
} from './block-utils.js';

let tileset;
let allPositions = [];
let labelData = [];
let lineEntities = [];
let labelEntities = [];
let shadowsVisible = false;
let editModeActive = false;
let editButtons = [];
let toolbarContainer = null;
let labelsVisible = true;
let linesVisible = true;
let selectedEntity = null;
let popupElement = null;
let popupTrackedEntity = null;

// Variables de dibujo
let activeLine = null;
let floatingPoint = null;
let activeLinePoints = [];
let isDrawing = false;
let pendingLineAttrs = null;
let linesData = [];


document.addEventListener('DOMContentLoaded', async () => {
  if (typeof Cesium === 'undefined') {
    console.error('Cesium no se ha cargado correctamente');
    return;
  }

  const config = window.viewerConfig || {};
  const { school, sector, block } = config;
  if (!school || !sector || !block) {
    console.error('Faltan parámetros en viewerConfig:', config);
    return;
  }

  try {
    await loadConfig();
    console.log('Configuración cargada correctamente');
  } catch (err) {
    console.error('Error cargando configuración:', err);
    return;
  }

  const viewer = createViewer("cesium-container");

  try {
    tileset = await loadTileset(viewer, school, sector, block);
    const linesResult = await loadLinesFromDb(viewer, school, sector, block);
    allPositions = linesResult.allPositions;
    lineEntities = linesResult.lineEntities;
    labelData = linesResult.labelData;
  } catch (err) {
    console.error("Error cargando datos:", err);
  }

  enableLabelSeparation(viewer);

  if (allPositions.length > 0) {
    const boundingSphere = Cesium.BoundingSphere.fromPoints(allPositions);
    viewer.camera.flyToBoundingSphere(boundingSphere, {
      duration: 1,
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(0),
        Cesium.Math.toRadians(-35),
        boundingSphere.radius * 5
      ),
      complete: () => addLabels(viewer, labelData)
    });
  } else {
    addLabels(viewer, labelData);
  }

  // Panel lateral
  const leftPanel = document.createElement('div');
  leftPanel.id = 'left-panel';
  document.body.appendChild(leftPanel);

  const infoContainer = document.createElement('div');
  infoContainer.id = 'infoContainer';
  leftPanel.appendChild(infoContainer);

  const labelBtn = createButton(leftPanel, 'Ocultar grados', 'label-btn', () => {
    labelsVisible = !labelsVisible;
    labelBtn.textContent = labelsVisible ? 'Ocultar grados' : 'Mostrar grados';
    
    if (labelEntities.length > 0) {
      labelEntities.forEach(entity => {
        if (entity.label) entity.label.show = labelsVisible;
      });
    } else {
      let foundLabels = 0;
      viewer.entities.values.forEach(entity => {
        if (entity.label && entity.customAttributes?.type === 'label') {
          entity.label.show = labelsVisible;
          foundLabels++;
        }
      });
      console.log(`Se ${labelsVisible ? 'mostraron' : 'ocultaron'} ${foundLabels} etiquetas`);
      if (foundLabels === 0) {
        viewer.entities.values.forEach(entity => {
          if (entity.label) {
            entity.label.show = labelsVisible;
            foundLabels++;
          }
        });
        console.log(`Método alternativo: ${foundLabels} etiquetas afectadas`);
      }
    }
  });

  // Botón líneas
  const lineBtn = createButton(leftPanel,'Ocultar líneas', 'line-btn', () => {
    linesVisible = !linesVisible;
    lineBtn.textContent = linesVisible ? 'Ocultar líneas' : 'Mostrar líneas';
    viewer.entities.values.forEach(e => {
      if (e.polyline && e.customAttributes?.type === 'line') {
        e.polyline.show = linesVisible;
      }
    });
  });

  // Botón centrar
  createButton(leftPanel,'Centrar', 'center-btn', () => {
    if (allPositions.length > 0) {
      const boundingSphere = Cesium.BoundingSphere.fromPoints(allPositions);
      viewer.camera.flyToBoundingSphere(boundingSphere, {
        duration: 0.5,
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(0),
          Cesium.Math.toRadians(-35),
          boundingSphere.radius * 5.0
        )
      });
    } else if (tileset) {
      viewer.zoomTo(tileset);
    } else {
      console.warn('No hay elementos para centrar');
    }
  });

  // Botón sombras
  const shadowBtn = createButton(leftPanel,'Activar sombras', 'shadow-btn', () => {
    shadowsVisible = !shadowsVisible;
    shadowBtn.textContent = shadowsVisible ? 'Desactivar sombras' : 'Activar sombras';

    viewer.scene.shadowMap.enabled = shadowsVisible;
    viewer.shadows = shadowsVisible;

    if (tileset) tileset.shadows = shadowsVisible ? Cesium.ShadowMode.ENABLED : Cesium.ShadowMode.DISABLED;


    if (shadowsVisible) {
      createTimeControls(leftPanel, shadowBtn, viewer);
      updateSunTime(parseFloat(timeSlider.value), viewer);
    } else {
      removeTimeControls();
    }
  });

// === Botón edición ===
const editToggleBtn = createButton(leftPanel, 'Activar edición', 'edit-btn', async () => {
  const loggedIn = await checkIfLoggedIn();

  // Si no está logueado, mostrar formulario y salir
  if (!loggedIn) {
    showLoginForm(leftPanel, () => editToggleBtn.click());
    return;
  } else {
    addLogoutButton(leftPanel);
  }

  editModeActive = !editModeActive;
  toggleEditMode(
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
  );

  if (editModeActive) {
    editToggleBtn.textContent = "Desactivar edición";

    const exportBtn = createButton(leftPanel, 'Exportar JSON', 'export-btn', () => {
      updateLinesData(viewer, linesData);
      const blob = new Blob([JSON.stringify(linesData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lineas_actualizadas.json';
      a.click();
      URL.revokeObjectURL(url);
    });
    editButtons.push(exportBtn);

    const drawBtn = createButton(leftPanel, 'Dibujar línea', 'draw-btn', () => {
      isDrawing = true;

      const drawingState = {
        get isDrawing() { return isDrawing; },
        set isDrawing(value) { isDrawing = value; },
        get activeLinePoints() { return activeLinePoints; },
        set activeLinePoints(value) { activeLinePoints = value; },
        get activeLine() { return activeLine; },
        set activeLine(value) { activeLine = value; },
        get floatingPoint() { return floatingPoint; },
        set floatingPoint(value) { floatingPoint = value; },
        get pendingLineAttrs() { return pendingLineAttrs; },
        set pendingLineAttrs(value) { pendingLineAttrs = value; }
      };

      const startDrawing = setupLineDrawing(viewer, tileset, school, sector, block, linesData, drawingState);
      window.drawingHandlers = startDrawing();
    });

    editButtons.push(drawBtn);

    enableVertexEditing(viewer);

  } else {
    editToggleBtn.textContent = "Activar edición";

    // === Eliminar botones previos ===
    for (const btn of editButtons) {
      if (btn && btn.remove) btn.remove();
    }
    editButtons.length = 0; // Limpieza segura

    // Limpiar cualquier dibujo en curso
    if (activeLine) viewer.entities.remove(activeLine);
    if (floatingPoint) viewer.entities.remove(floatingPoint);
    activeLinePoints = [];
    isDrawing = false;
    pendingLineAttrs = null;

    clearSelection(viewer, selectedEntity, popupElement, popupTrackedEntity);
    console.log("Modo edición desactivado y botones eliminados");
  }
});

  // === HANDLER UNIFICADO ===
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  let popupElement = null;
  let popupTrackedEntity = null;

  handler.setInputAction(event => {
    console.log("Edit mode:", editModeActive, "Is drawing:", isDrawing);
    if (editModeActive && isDrawing){
      return;
    }

    const mousePos = event.position;
    let closestEntity = null;
    let minDist = 25;

    viewer.entities.values.forEach(e => {
      if (e.polyline && e.customAttributes?.type === 'line') {
        const positions = e.polyline.positions.getValue(Cesium.JulianDate.now());
        for (let i = 0; i < positions.length - 1; i++) {
          const p0 = positions[i];
          const p1 = positions[i + 1];
          const win0 = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, p0);
          const win1 = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, p1);
          if (win0 && win1) {
            const dist = pointToSegmentDistance(mousePos, win0, win1);
            if (dist < minDist) { minDist = dist; closestEntity = e; }
          }
        }
      }
    });

    if (closestEntity) {
      if (selectedEntity && selectedEntity !== closestEntity) resetEntity(selectedEntity);
      selectedEntity = closestEntity;
      highlightEntity(selectedEntity);
      showFloatingInfo(viewer, selectedEntity, linesData);
    } else {
      clearSelection(viewer, selectedEntity, popupElement, popupTrackedEntity);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // === FUNCIONES DE RESALTADO ===
  function highlightEntity(e) {
    const grades = [e.customAttributes?.grade, e.customAttributes?.grade_ss]
                    .filter(g => g && g.trim() !== "");
    const minGrade = grades.length ? grades.sort().at(-1) : "";
    const lineColor = getColorByGrade(minGrade);
    e.polyline.material = new Cesium.ColorMaterialProperty(lineColor.withAlpha(0.6));

    const positions = e.polyline.positions.getValue(Cesium.JulianDate.now());
    const { heading, pitch } = calculateDirectionToTileset(positions, tileset);

    if (positions?.length) {
      const boundingSphere = Cesium.BoundingSphere.fromPoints(positions);
      viewer.camera.flyToBoundingSphere(boundingSphere, {
        offset: new Cesium.HeadingPitchRange(heading, pitch, boundingSphere.radius * 5)
      });
    }
  }

  // === POPUP FLOTANTE ===
  function showFloatingInfo(viewer, entity, linesData) {

    hideFloatingInfo(viewer, popupElement, popupTrackedEntity);
    popupTrackedEntity = entity;
    const attrs = entity.customAttributes;

    if (editModeActive) {
    popupElement = document.createElement('div');
    popupElement.className = 'floating-info';
    popupElement.innerHTML = `
      <span class="close-btn" id="closePopupBtn">&times;</span>
      <div class="info-header"><strong>${attrs.name || 'Sin nombre'}</strong></div>
      <div class="info-content">
        <label>Nombre:<br>
        <input id="attrName" type="text" value="${attrs.name ?? ''}">
        </label><br>
        <label>Grado:<br>
          <input id="attrGrade" type="text" value="${attrs.grade ?? ''}">
        </label><br>
        <label>Grado(ss):<br>
          <input id="attrGradeSs" type="text" value="${attrs.grade_ss ?? ''}">
        </label><br>
        <button id="updateProblemBtn">Actualizar problema</button>
        <button id="deleteProblemBtn">Eliminar problema</button>
      </div>`;
    document.body.appendChild(popupElement);
    
    const closeBtn = document.getElementById('closePopupBtn');
    closeBtn.style.cssText = `
      position: absolute;
      top: 5px;
      right: 10px;
      cursor: pointer;
      font-size: 20px;
      font-weight: bold;
      color: #666;
      border: none;
      background: none;
      padding: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    closeBtn.addEventListener('click', () => {
      hideFloatingInfo(viewer, popupElement, popupTrackedEntity);
    });
    
    closeBtn.addEventListener('mouseover', () => {
      closeBtn.style.color = '#000';
      closeBtn.style.backgroundColor = '#f0f0f0';
      closeBtn.style.borderRadius = '3px';
    });
    
    closeBtn.addEventListener('mouseout', () => {
      closeBtn.style.color = '#666';
      closeBtn.style.backgroundColor = 'transparent';
    });

    viewer.scene.postRender.addEventListener(updatePopupPosition(viewer, popupTrackedEntity, popupElement));
    
    // Update local
    document.getElementById('attrName').addEventListener('input', e => {
      attrs.name = e.target.value;
      updateLinesData(viewer, linesData);
    });
    document.getElementById('attrGrade').addEventListener('input', e => {
      attrs.grade = e.target.value;
      updateLinesData(viewer, linesData);
    });
    document.getElementById('attrGradeSs').addEventListener('input', e => {
      attrs.grade_ss = e.target.value;
      updateLinesData(viewer, linesData);
    });

    // Update backend
    document.getElementById('updateProblemBtn').addEventListener('click', async () => {
      if (!attrs.id) {
        alert("No se puede actualizar: id del problema no definido");
        return;
      }

      try {
        const response = await fetch(`${BACKEND_URL}/api/v1/problem/${attrs.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grade: attrs.grade,
            grade_ss: attrs.grade_ss,
            name: attrs.name,
            length: attrs.length,
            height: attrs.height,
            positions: entity.polyline.positions.getValue(Cesium.JulianDate.now()).map(p => {
              const c = Cesium.Cartographic.fromCartesian(p);
              return {
                lat: Cesium.Math.toDegrees(c.latitude),
                lon: Cesium.Math.toDegrees(c.longitude),
                height: c.height
              };
            })
          })
        });
        if (!response.ok) throw new Error(`Error actualizando problema: ${response.status}`);
        alert("Problema actualizado correctamente");
      } catch (err) {
        console.error(err);
        alert(`Error actualizando problema: ${err.message}`);
      }
      await loadLinesFromDb(viewer, school, sector, block);
    });

    // Delete 
    document.getElementById('deleteProblemBtn').addEventListener('click', async () => {
      if (!attrs.id) {
        alert("No se puede eliminar: id del problema no definido");
        return;
      }
      if (!confirm(`¿Deseas eliminar el problema "${attrs.name}"?`)) return;
      try {
        const response = await fetch(`${BACKEND_URL}/api/v1/problem/${attrs.id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error(`Error eliminando problema: ${response.status}`);
        viewer.entities.remove(entity);
        clearSelection(viewer, selectedEntity, popupElement, popupTrackedEntity);
        alert("Problema eliminado correctamente");
      } catch (err) {
        console.error(err);
        alert(`Error eliminando problema: ${err.message}`);
      }
      await loadLinesFromDb(viewer, school, sector, block);
    });
    return;

    } else {
    popupElement = document.createElement('div');
    popupElement.className = 'floating-info';
    popupElement.innerHTML = `
      <div class="info-header"><strong>${attrs.name || 'Sin nombre'}</strong></div>
      <div class="info-content">
        ${attrs.grade ? `<div><b>Grado:</b> ${attrs.grade}</div>` : ''}
        ${attrs.grade_ss ? `<div><b>Grado(ss):</b> ${attrs.grade_ss}</div>` : ''}
        <div><b>Longitud:</b> ${attrs.length?.toFixed?.(2) ?? '0'} m</div>
        <div><b>Altura:</b> ${attrs.height?.toFixed?.(2) ?? '0'} m</div>
      </div>`;
    document.body.appendChild(popupElement);
    viewer.scene.postRender.addEventListener(updatePopupPosition(viewer, popupTrackedEntity, popupElement));
    }
  }

});

// === UTILIDADES ===
function pointToSegmentDistance(mouse, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(mouse.x - a.x, mouse.y - a.y);
  const t = ((mouse.x - a.x) * dx + (mouse.y - a.y) * dy) / (dx*dx + dy*dy);
  const projX = a.x + Math.max(0, Math.min(1, t)) * dx;
  const projY = a.y + Math.max(0, Math.min(1, t)) * dy;
  return Math.hypot(mouse.x - projX, mouse.y - projY);
}

function calculateDirectionToTileset(positions, tileset) {
  if (positions.length < 2) return { heading: 0, pitch: -Cesium.Math.PI_OVER_FOUR };
  const start = positions[0];
  const end = positions[positions.length - 1];
  const midpoint = Cesium.Cartesian3.midpoint(start, end, new Cesium.Cartesian3());
  const tilesetCenter = tileset.boundingSphere.center;
  const midCarto = Cesium.Cartographic.fromCartesian(midpoint);
  const targetCarto = Cesium.Cartographic.fromCartesian(tilesetCenter);
  const deltaLon = targetCarto.longitude - midCarto.longitude;
  const deltaLat = targetCarto.latitude - midCarto.latitude;
  let heading = Math.atan2(deltaLon, deltaLat);
  if (heading < 0) heading += Cesium.Math.TWO_PI;
  const deltaHeight = targetCarto.height - midCarto.height;
  const horizontalDistance = Cesium.Cartesian3.distance(
    Cesium.Cartesian3.fromRadians(midCarto.longitude, midCarto.latitude, 0),
    Cesium.Cartesian3.fromRadians(targetCarto.longitude, targetCarto.latitude, 0)
  );
  const pitch = -Math.atan2(deltaHeight, horizontalDistance);
  return { heading, pitch };
}
