const BACKEND_URL = window.BACKEND_URL;

// --------- CAPAS BASE ---------
const osm = new ol.layer.Tile({
    source: new ol.source.OSM(),
    visible: true,
    title: "Mapa OSM"
});

const pnoaOrto = new ol.layer.Tile({
    source: new ol.source.XYZ({
        attributions: '© Instituto Geográfico Nacional (IGN)',
        url: "https://www.ign.es/wmts/pnoa-ma?layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}",
        maxZoom: 19
    }),
    visible: false,
    title: "PNOA Ortofoto"
});

const baseGroup = new ol.layer.Group({ layers: [pnoaOrto, osm] });

// --------- FUENTES VECTORIALES ---------
const schoolsSource = new ol.source.Vector();
const sectorsSource = new ol.source.Vector();
const blocksSource = new ol.source.Vector();

// --------- ESTILOS ---------
const schoolNormalStyle = new ol.style.Style({
    stroke: new ol.style.Stroke({ color: 'rgba(35, 144, 245, 0.8)' }),
    fill: new ol.style.Fill({ color: 'rgba(35, 213, 245, 0.3)' })
});

const sectorNormalStyle = new ol.style.Style({
    stroke: new ol.style.Stroke({ color: 'rgba(59,32,137,0.8)' }),
    fill: new ol.style.Fill({ color: 'rgba(166,141,235,0.3)' })
});

const blockNormalStyle = new ol.style.Style({
    stroke: new ol.style.Stroke({ color: 'rgba(251,101,38,0.8)' }),
    fill: new ol.style.Fill({ color: 'rgba(249,169,113,0.7)' })
});

// --------- CAPAS VECTORIALES ---------
const schoolsLayer = new ol.layer.Vector({ source: schoolsSource, style: schoolNormalStyle });
const sectorsLayer = new ol.layer.Vector({ source: sectorsSource, style: sectorNormalStyle, visible: false });
const blocksLayer = new ol.layer.Vector({ source: blocksSource, style: blockNormalStyle, visible: false });

// --------- FUNCIÓN AUX: crear estilo punto+label ---------
function createPointLabelStyle(feature, type = 'School', radius = 6) {
    let normalStyle;
    if (type === 'School') normalStyle = schoolNormalStyle;
    else if (type === 'Sector') normalStyle = sectorNormalStyle;
    else if (type === 'Block') normalStyle = blockNormalStyle;

    const stroke = normalStyle.getStroke();
    const fill = normalStyle.getFill();

    let pointGeom;
    const geom = feature.getGeometry();
    if (geom.getType() === 'Polygon' || geom.getType() === 'MultiPolygon') {
        pointGeom = geom.getInteriorPoint();
    } else {
        pointGeom = geom;
    }

    return new ol.style.Style({
        geometry: pointGeom,
        image: new ol.style.Circle({
            radius: radius,
            stroke: new ol.style.Stroke({
                color: stroke ? stroke.getColor() : '#000',
                width: 1
            }),
            fill: new ol.style.Fill({
                color: fill ? fill.getColor() : '#fff'
            })
        }),
        text: new ol.style.Text({
            text: feature.get('name') || '',
            font: '12px Calibri,sans-serif',
            fill: new ol.style.Fill({ color: '#000' }),
            stroke: new ol.style.Stroke({ color: '#fff', width: 3 }),
            offsetX: -radius - 4,
            offsetY: -radius - 4,
            textAlign: 'right',
            textBaseline: 'bottom'
        })
    });
}

// --------- CACHE DE HIJOS CARGADOS ---------
const schoolLoadedSectors = {};
const sectorLoadedBlocks = {};

// --------- FUNCIONES PARA CARGAR HIJOS ---------
function loadSectorsForSchool(school) {
    const schoolId = school.get("id");
    if (schoolLoadedSectors[schoolId]) return;
    schoolLoadedSectors[schoolId] = true;

    fetch(`${BACKEND_URL}/api/v1/${schoolId}/sectors`)
        .then(r => {
            if (!r.ok) throw new Error(`No se pudo cargar sectores de school ${schoolId}`);
            return r.json();
        })
        .then(geojson => {
            const features = new ol.format.GeoJSON().readFeatures(geojson, { featureProjection: 'EPSG:3857' });
            features.forEach(f => f.set("parentSchool", schoolId));
            sectorsSource.addFeatures(features);
            map.render();
        })
        .catch(err => console.error(err));
}

function loadBlocksForSector(sector) {
    const sectorId = sector.get("id");
    if (sectorLoadedBlocks[sectorId]) return;
    sectorLoadedBlocks[sectorId] = true;

    fetch(`${BACKEND_URL}/api/v1/${sectorId}/blocks`)
        .then(r => {
            if (!r.ok) throw new Error(`No se pudo cargar blocks de sector ${sectorId}`);
            return r.json();
        })
        .then(geojson => {
            const features = new ol.format.GeoJSON().readFeatures(geojson, { featureProjection: 'EPSG:3857' });
            features.forEach(f => f.set("parentSector", sectorId));
            blocksSource.addFeatures(features);
            map.render();
        })
        .catch(err => console.error(err));
}

// --------- FUNCIÓN DE ESTILO ADAPTATIVA ---------
function makeAdaptiveStyle(map, type = 'School', level = 'school') {
    let normalStyle;
    if (type === 'School') normalStyle = schoolNormalStyle;
    else if (type === 'Sector') normalStyle = sectorNormalStyle;
    else if (type === 'Block') normalStyle = blockNormalStyle;
    else normalStyle = new ol.style.Style();

    return function(feature) {
        try {
            if (!map || !map.getSize) return normalStyle;
            const mapSize = map.getSize();
            if (!mapSize || mapSize[0] === 0 || mapSize[1] === 0) return normalStyle;

            const geom = feature.getGeometry();
            if (!geom) return normalStyle;

            const zoom = map.getView().getZoom();

            if (geom.getType() === 'Point') {
                feature.set(`isPolygon_${level}`, false);
                return createPointLabelStyle(feature, type);
            }

            const extent = geom.getExtent();
            const bottomLeft = map.getPixelFromCoordinate([extent[0], extent[1]]);
            const topRight = map.getPixelFromCoordinate([extent[2], extent[3]]);
            if (!Array.isArray(bottomLeft) || !Array.isArray(topRight)) {
                feature.set(`isPolygon_${level}`, true);
                return normalStyle;
            }

            const widthPx = Math.max(1, Math.abs(topRight[0] - bottomLeft[0]));
            const heightPx = Math.max(1, Math.abs(topRight[1] - bottomLeft[1]));
            const areaPx = widthPx * heightPx;
            const mapAreaPx = Math.max(1, mapSize[0] * mapSize[1]);
            const ratio = areaPx / mapAreaPx;

            const showPolygon = ratio >= 0.01;
            feature.set(`isPolygon_${level}`, showPolygon);

            if (showPolygon && type === 'School') loadSectorsForSchool(feature);
            if (showPolygon && type === 'Sector') loadBlocksForSector(feature);

            if (!showPolygon) return createPointLabelStyle(feature, type);
            return normalStyle;

        } catch (err) {
            console.error('Adaptive style error:', err);
            return normalStyle;
        }
    };
}

// --------- MAPA ---------
const map = new ol.Map({
    target: 'map',
    layers: [baseGroup, schoolsLayer, sectorsLayer, blocksLayer],
    view: new ol.View({
        center: ol.proj.fromLonLat([-8.8, 43.2]),
        zoom: 11
    }),
    controls: []
});

// --------- ASIGNACIÓN DE ESTILOS ADAPTATIVOS ---------
schoolsLayer.setStyle(makeAdaptiveStyle(map, 'School', 'school'));
sectorsLayer.setStyle(feature => {
    const parentSchool = feature.get('parentSchool');
    const schoolFeature = schoolsSource.getFeatures().find(s => s.get('id') === parentSchool);
    if (!schoolFeature?.get('isPolygon_school')) return null;
    return makeAdaptiveStyle(map, 'Sector', 'sector')(feature);
});
blocksLayer.setStyle(feature => {
    const parentSector = feature.get('parentSector');
    const sectorFeature = sectorsSource.getFeatures().find(s => s.get('id') === parentSector);
    if (!sectorFeature?.get('isPolygon_sector')) return null;
    return makeAdaptiveStyle(map, 'Block', 'block')(feature);
});

// --------- CONTROL DE VISIBILIDAD JERÁRQUICA ---------
function updateLayerVisibility() {
    const showSectors = schoolsSource.getFeatures().some(f => f.get('isPolygon_school'));
    const showBlocks = sectorsSource.getFeatures().some(f => {
        const parentSchool = f.get('parentSchool');
        const schoolFeature = schoolsSource.getFeatures().find(s => s.get('id') === parentSchool);
        return schoolFeature?.get('isPolygon_school') && f.get('isPolygon_sector');
    });

    sectorsLayer.setVisible(showSectors);
    blocksLayer.setVisible(showBlocks);
}

map.getView().on('change:resolution', () => {
    map.render();
    updateLayerVisibility();
});
map.on('postrender', updateLayerVisibility);

function zoomGeneral() {
    const features = schoolsSource.getFeatures();
    if (!features || features.length === 0) {
        console.warn("No hay escuelas cargadas para mostrar.");
        return;
    }

    const extent = ol.extent.createEmpty();
    features.forEach(f => {
        const geom = f.getGeometry();
        if (geom) ol.extent.extend(extent, geom.getExtent());
    });

    const view = map.getView();

    view.fit(extent, {
        size: map.getSize(),
        padding: [50, 50, 50, 50],
        duration: 800,
        maxZoom: 16
    });
}

function zoomToFeature(feature) {
    const view = map.getView();
    const geom = feature.getGeometry();
    if (!geom) return;
    const mapSize = map.getSize();
    if (!mapSize) return;

    const extent = geom.getExtent();
    const mapWidth = mapSize[0];
    const mapHeight = mapSize[1];

    function calcRatioAtZoom(zoom) {
        const resolution = view.getResolutionForZoom(zoom);
        const widthPx = (extent[2] - extent[0]) / resolution;
        const heightPx = (extent[3] - extent[1]) / resolution;
        const areaPx = widthPx * heightPx;
        const mapAreaPx = mapWidth * mapHeight;
        return areaPx / mapAreaPx;
    }

    const center = (geom.getType() === 'Polygon' || geom.getType() === 'MultiPolygon') ?
        geom.getInteriorPoint().getCoordinates() :
        geom.getCoordinates();


    const maxZoom = view.getMaxZoom() || 19;
    const minZoom = view.getMinZoom() || 0;
    let targetZoom = minZoom;

    for (let zoom = minZoom; zoom <= maxZoom; zoom += 0.1) {
        const ratio = calcRatioAtZoom(zoom);
        if (ratio >= 0.3) {
            targetZoom = zoom;
            break;
        }
    }

    view.animate({ center: center, zoom: targetZoom, duration: 800 });
}

function centerMapOnFeaturePoint(feature) {
    const view = map.getView();
    const geom = feature.getGeometry();
    if (!geom || geom.getType() !== 'Point') return;

    const coords = geom.getCoordinates();
    const currentZoom = view.getZoom() || 11; // Mantiene el zoom actual

    view.animate({
        center: coords,
        zoom: currentZoom,
        duration: 800
    });
}



// ---------- CARGAR ESCUELAS ----------
fetch(`${BACKEND_URL}/api/v1/schools`)
    .then(r => r.json())
    .then(geojson => {
        const features = new ol.format.GeoJSON().readFeatures(geojson, { featureProjection: 'EPSG:3857' });
        schoolsSource.addFeatures(features);
        map.render();

        schoolsPanel();
    })
    .catch(err => console.error("Error cargando escuelas:", err));


// ---------- CLICK MAPA ----------
map.on('singleclick', function(evt) {
    const feature = map.forEachFeatureAtPixel(evt.pixel, f => f);
    if (!feature) {
        schoolsPanel();
    } else if (feature.get('parentSector')) {
        problemsPanel(feature);
    } else if (feature.get('parentSchool')) {
        blocksPanel(feature);
    } else if (feature) {
        sectorsPanel(feature);
    }
});


// ---------- PANEL ----------
function showInfo(bodyHtml, showBack = true, backCallback = null) {
    const panel = document.getElementById("left-panel");

    // Botón volver con SVG Tabler
    const backBtnHtml = showBack ? `
    <button id="panel-btn-back" class="common-btn">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M9 14l-4 -4l4 -4" />
        <path d="M5 10h11a4 4 0 1 1 0 8h-1" />
      </svg>
    </button>` : '';

    const html = `
    <div class="panel-header" style="display:flex; align-items:center; gap:8px;">
      ${backBtnHtml}
    </div>
    <div class="panel-body">
      ${bodyHtml}
    </div>
  `;

    panel.innerHTML = html;

    if (showBack && backCallback) {
        const backBtn = document.getElementById('panel-btn-back');
        if (backBtn) backBtn.addEventListener('click', backCallback);
    }
}


function schoolsPanel() {
    const schools = schoolsSource.getFeatures();
    let bodyHtml = '';

    if (schools.length > 0) {
        bodyHtml += '<ul class="child-list">';
        schools.forEach((s, index) => {
            bodyHtml += `<li>
        <button class="common-btn" data-index="${index}">${s.get('name') || 'S.N.'}</button>
      </li>`;
        });
        bodyHtml += '</ul>';
    } else {
        bodyHtml = '<p>No hay escuelas disponibles.</p>';
    }

    showInfo(bodyHtml, 'Escuelas');

    schools.forEach((s, index) => {
        const btn = document.querySelector(`.common-btn[data-index='${index}']`);
        btn.addEventListener('click', () => {
            zoomToFeature(s);
            sectorsPanel(s);
        });
    });
}

function sectorsPanel(schoolFeature) {
    const props = schoolFeature.getProperties();
    const schoolId = schoolFeature.get('id');
    zoomToFeature(schoolFeature);

    fetch(`${BACKEND_URL}/api/v1/${schoolId}/sectors`)
        .then(res => res.ok ? res.json() : Promise.reject('Error cargando sectores'))
        .then(geojson => {
            const sectors = new ol.format.GeoJSON().readFeatures(geojson, { featureProjection: 'EPSG:3857' });
            sectors.forEach(s => s.set('parentSchool', schoolId));
            sectorsSource.clear();
            sectorsSource.addFeatures(sectors);

            let bodyHtml = '';
            if (sectors.length > 0) {
                bodyHtml += '<ul class="child-list">';
                sectors.forEach((s, index) => {
                    bodyHtml += `<li>
            <button class="common-btn" data-index="${index}">${s.get('name') || 'S.N.'}</button>
          </li>`;
                });
                bodyHtml += '</ul>';
            } else {
                bodyHtml = '<p>No hay sectores disponibles.</p>';
            }

            showInfo(bodyHtml, props.name, () => {
                schoolsPanel();
                zoomGeneral();
            });

            sectors.forEach((s, index) => {
                const btn = document.querySelector(`.common-btn[data-index='${index}']`);
                btn.addEventListener('click', () => blocksPanel(s));
            });
        });
}

function blocksPanel(sectorFeature) {
    const props = sectorFeature.getProperties();
    const sectorId = sectorFeature.get('id');
    const schoolId = sectorFeature.get('school_id');
    zoomToFeature(sectorFeature);

    fetch(`${BACKEND_URL}/api/v1/${sectorId}/blocks`)
        .then(res => res.ok ? res.json() : Promise.reject('Error cargando bloques'))
        .then(geojson => {
            const blocks = new ol.format.GeoJSON().readFeatures(geojson, { featureProjection: 'EPSG:3857' });
            blocks.forEach(b => b.set('parentSector', sectorId));
            blocksSource.clear();
            blocksSource.addFeatures(blocks);

            let bodyHtml = '';
            if (blocks.length > 0) {
                bodyHtml += '<ul class="child-list">';
                blocks.forEach((b, index) => {
                    bodyHtml += `<li>
            <button class="common-btn" data-index="${index}">${b.get('name') || 'S.N.'}</button>
          </li>`;
                });
                bodyHtml += '</ul>';
            } else {
                bodyHtml = '<p>No hay bloques disponibles.</p>';
            }

            showInfo(bodyHtml, props.name, () => {
                const parentSchool = schoolsSource.getFeatures().find(s => s.get('id') === schoolId);
                if (parentSchool) {
                    zoomToFeature(parentSchool);
                    sectorsPanel(parentSchool);
                } else {
                    zoomToAllSchools();
                    schoolsPanel();
                }
            });

            blocks.forEach((b, index) => {
                const btn = document.querySelector(`.common-btn[data-index='${index}']`);
                btn.addEventListener('click', () => problemsPanel(b));
            });
        });
}


function problemsPanel(feature) {
    const props = feature.getProperties();
    const blockId = feature.get('id');
    const blockName = feature.get('name');
    const sectorId = feature.get('sector_id');
    const sectorName = feature.get('sector_name');
    const schoolName = feature.get('school_name');
    centerMapOnFeaturePoint(feature);

    fetch(`${BACKEND_URL}/api/v1/${schoolName}/${sectorName}/${blockName}/problems`)
        .then(res => {
            if (!res.ok) throw new Error(`No se pudo cargar problemas del block ${blockId}`);
            return res.json();
        })
        .then(problems => {
            let bodyHtml = `
      <a href="/${schoolName}/${sectorName}/${blockName}" 
        class="common-btn">
        <svg xmlns="http://www.w3.org/2000/svg" 
            width="24" height="24" viewBox="0 0 24 24" 
            fill="none" stroke="currentColor" 
            stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" 
            class="icon icon-tabler icons-tabler-outline icon-tabler-badge-3d">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" />
          <path d="M7 9h1.5a1.5 1.5 0 0 1 0 3h-.5h.5a1.5 1.5 0 0 1 0 3h-1.5" />
          <path d="M14 9v6h1a2 2 0 0 0 2 -2v-2a2 2 0 0 0 -2 -2z" />
        </svg>
      </a>
    `;

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = bodyHtml;
            const btn = tempDiv.querySelector('a');
            btn.addEventListener('mouseenter', () => btn.style.backgroundColor = '#2563eb');
            btn.addEventListener('mouseleave', () => btn.style.backgroundColor = '#1d4ed8');
            bodyHtml = tempDiv.innerHTML;
            if (problems.length > 0) {
                const gradePairs = [];

                problems.forEach(p => {
                    if (p.grade && p.grade.trim() !== '') {
                        gradePairs.push([p.grade.toLowerCase(), p.name || 'S.N.']);
                    }
                    if (p.grade_ss && p.grade_ss.trim() !== '') {
                        gradePairs.push([p.grade_ss.toLowerCase(), `${p.name || 'S.N.'} (ss)`]);
                    }
                });

                gradePairs.sort((a, b) => a[0].localeCompare(b[0]));

                bodyHtml += '<table style="border-collapse: collapse; width:100%;">';
                gradePairs.forEach(([grade, name]) => {
                    bodyHtml += `
            <tr>
              <td style="text-align:left; width:60px;">${grade}</td>
              <td style="width:10px;"></td>
              <td style="text-align:left;">${name}</td>
            </tr>
          `;
                });
                bodyHtml += '</table>';
            } else {
                bodyHtml += '<p>No hay problemas reportados.</p>';
            }

            showInfo(bodyHtml, props.name, () => {
                const parentSector = sectorsSource.getFeatures().find(s => s.get('id') === sectorId);
                if (parentSector) {
                    zoomToFeature(parentSector);
                    blocksPanel(parentSector);
                } else {
                    zoomToAllSchools();
                    schoolsPanel();
                }
            });
        })
        .catch(err => {
            console.error(err);
            showInfo(`<p>Error cargando problemas.</p>`, props.name);
        });
}


// ---------- CONTROL DE FLECHAS PARA BASEMAP ----------
const baseLayers = baseGroup.getLayers().getArray();
let currentIndex = baseLayers.findIndex(l => l.getVisible());

function updateBasemap(direction) {
    baseLayers[currentIndex].setVisible(false);

    if (direction === "next") {
        currentIndex = (currentIndex + 1) % baseLayers.length;
    } else if (direction === "prev") {
        currentIndex = (currentIndex - 1 + baseLayers.length) % baseLayers.length;
    }

    baseLayers[currentIndex].setVisible(true);
}

document.getElementById("next-basemap").addEventListener("click", () => updateBasemap("next"));