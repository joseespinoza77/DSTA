// Gemelo Digital EDAR Silvouta — Visor 3D con GPS-X 8.0
const container = document.getElementById('canvas-container');
const tooltip = document.getElementById('tooltip');

const scene = new THREE.Scene();

// Fondo claro de consulta tecnica, alineado con el formato de Dimensionar.
(function setupBackground() {
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = 2;
    bgCanvas.height = 512;
    const bgCtx = bgCanvas.getContext('2d');
    const skyGrad = bgCtx.createLinearGradient(0, 0, 0, 512);
    skyGrad.addColorStop(0.0, '#dceff5');
    skyGrad.addColorStop(0.48, '#d7e7e8');
    skyGrad.addColorStop(0.72, '#b8cbc6');
    skyGrad.addColorStop(1.0, '#879b94');
    bgCtx.fillStyle = skyGrad;
    bgCtx.fillRect(0, 0, 2, 512);
    const bgTexture = new THREE.CanvasTexture(bgCanvas);
    scene.background = bgTexture;
    // Niebla eliminada — interfería con la visibilidad del modelo
})();

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 3000);
camera.position.set(420, 330, -420);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(1, 1, false);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputEncoding = THREE.sRGBEncoding;
container.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 6, 0);
controls.minDistance = 30;
controls.maxDistance = 1600;
controls.maxPolarAngle = Math.PI * 0.85;
camera.lookAt(controls.target);

// Iluminacion mejorada: ambiente + hemisferio + direccional + fill
const ambientLight = new THREE.AmbientLight(0xc5d4d7, 0.68);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xf4fbff, 0xaabbae, 0.72);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xfff6e8, 1.12);
dirLight.position.set(120, 240, 80);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.top = 220;
dirLight.shadow.camera.bottom = -220;
dirLight.shadow.camera.left = -220;
dirLight.shadow.camera.right = 220;
dirLight.shadow.camera.near = 5;
dirLight.shadow.camera.far = 800;
dirLight.shadow.bias = -0.0004;
dirLight.shadow.normalBias = 0.02;
scene.add(dirLight);

// Luz de relleno desde el lado opuesto
const fillLight = new THREE.DirectionalLight(0xb9d7e5, 0.55);
fillLight.position.set(-80, 60, -120);
scene.add(fillLight);

// GridHelper eliminado — interfería visualmente con la topografía

// Anillo sutil de contexto en el suelo
(function addSiteRing() {
    const ringGeo = new THREE.RingGeometry(158, 162, 64);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x2a9d8f, side: THREE.DoubleSide,
        transparent: true, opacity: 0.22, depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -2.45;
    ring.name = 'site_ring';
    scene.add(ring);
})();

const structuresGroup = new THREE.Group();
scene.add(structuresGroup);

// ==========================================
// BLOCK B: Globals (modified)
// ==========================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let SELECTED_MESH = null;
let ORIGINAL_EMISSIVE_HEX = 0x000000;
let currentView = 'iso';
let currentMode = 'presentacion';
let MODEL_METADATA = {};
let labelLayoutDirty = true;
let labelFrame = 0;
let hasBuiltPlant = false;
let labelScaleFactor = 1.0;
const VIEWER_VERSION = '20260624-fix-elevations-1';

// ==========================================
// BLOCK C: Coordinate transforms, line labels, visibility
// ==========================================

// El JSON conserva coordenadas GIS locales: X=Este, Z=Norte.
// Para que la vista superior de Three.js se lea como QGIS (Este a la derecha),
// se espeja X solo al renderizar.
function toSceneX(x) { return -x; }
function toSceneZ(z) { return z; }

function getTopViewHeight() {
    var fov = THREE.MathUtils.degToRad(camera.fov);
    var rect = container.getBoundingClientRect();
    var aspect = Math.max(rect.width / Math.max(rect.height, 1), 0.1);
    var halfSiteWidth = 320;
    return Math.max(420, halfSiteWidth / (Math.tan(fov / 2) * aspect));
}

const LABEL_PRIORITY = {
    label_aliviadero: 4,
    label_vertido: 4,
    label_A01_LLEGADA: 3,
    label_A02_POZO: 3,
    label_A03a_DESBASTE_GR: 3,
    label_A03b_DESBASTE_FN: 3,
    label_A04_BOMBEO: 3,
    label_A05_DESARENADO: 3,
    label_A07_FECL3: 3,
    label_A13_RETORNOS: 3,
    label_F00_TAMIZADO: 3,
    label_F01_ESPESADOR: 3,
    label_F02_ACOND: 3,
    label_F04_TAMPON: 3,
    label_antorcha_biogas: 3,
    label_chimenea_aire_tratado_olores: 3,
    label_edificio_soplantes: 3,
    label_A08a_REACTOR_MBR_1: 4,
    label_A08b_REACTOR_MBR_2: 4,
    label_F03_DIGESTOR: 4,
    label_G_SISTEMA_BIOGAS: 4,
    label_O_DESOD_EDIFICIOS: 4,
    label_F05_DESHID: 3,
    label_F06_SILOS: 3,
    label_A06a_PRIMARIO_1: 3,
    label_A06b_PRIMARIO_2: 3,
    label_A10_UV: 3,
    label_rio: 2,
    label_calle: 2,
    label_carga_fangos: 2
};

var LINE_LABELS = {
    aguas: 'Línea de Aguas',
    aguas_primaria: 'Línea de Aguas (Primaria)',
    aguas_biologica: 'Línea de Aguas (Biológica)',
    fangos: 'Línea de Fangos',
    fangos_espesamiento: 'Línea de Fangos (Espesamiento)',
    fangos_digestión: 'Línea de Fangos (Digestión)',
    fangos_digestion: 'Línea de Fangos (Digestión)',
    gas: 'Línea de Gas',
    olores: 'Línea de Olores',
    rechazos: 'Rechazos de Pretratamiento',
    equipo: 'Equipo Auxiliar',
    obra_civil: 'Obra Civil',
    topografia: 'Topografía',
    rio: 'Río',
    calle: 'Calle y Accesos',
    servicios: 'Servicios GIS',
    contexto_gis: 'Contexto GIS',
    etiquetas: 'Etiquetas'
};

var PROCESS_LINES = [
    'Línea de Aguas (Primaria)',
    'Línea de Aguas (Biológica)',
    'Línea de Fangos (Espesamiento)',
    'Línea de Fangos (Digestión)',
    'Línea de Gas',
    'Línea de Olores',
    'Topografía',
    'Río',
    'Calle y Accesos',
    'Servicios GIS',
    'Contexto GIS',
    'Etiquetas'
];
var activeLines = new Set(PROCESS_LINES);

function formatLine(linea) {
    return LINE_LABELS[linea] || linea || 'Sin línea asignada';
}

function isProcessLine(linea) {
    return PROCESS_LINES.indexOf(formatLine(linea)) !== -1;
}

function updateLineVisibility() {
    structuresGroup.children.forEach(function (mesh) {
        var lineLabel = formatLine(mesh.userData.linea);
        mesh.userData.layerVisible = !isProcessLine(lineLabel) || activeLines.has(lineLabel);
        if (mesh.userData.tipo !== 'label') {
            mesh.visible = mesh.userData.layerVisible;
        }
    });
    labelLayoutDirty = true;
}

// Layers that are GIS context — should NOT drive the camera framing
var GIS_CONTEXT_LINES = new Set([
    'Topografía', 'Río', 'Calle y Accesos', 'Servicios GIS', 'Contexto GIS'
]);

function visibleSceneBounds() {
    var box = new THREE.Box3();
    var hasObject = false;
    structuresGroup.children.forEach(function (obj) {
        if (!obj.userData || !obj.userData.layerVisible || obj.userData.tipo === 'label') return;
        // Skip GIS context layers — they extend far beyond the plant footprint
        var lineLabel = formatLine(obj.userData.linea);
        if (GIS_CONTEXT_LINES.has(lineLabel)) return;
        if (obj.userData.tipo === 'terrain_mesh' || obj.userData.tipo === 'terrain_cell') return;
        if (obj.userData.tipo === 'road' || obj.userData.tipo === 'pipe' ||
            ['box', 'cylinder', 'sphere', 'pump', 'water_volume', 'water_plane'].indexOf(obj.userData.tipo) !== -1) {
            box.expandByObject(obj);
            hasObject = true;
        }
    });
    if (!hasObject || box.isEmpty()) {
        box.setFromCenterAndSize(new THREE.Vector3(0, 10, 0), new THREE.Vector3(520, 80, 340));
    }
    return box;
}

function fitCameraToVisible(view) {
    if (!hasBuiltPlant) return;
    var box = visibleSceneBounds();
    var sphere = box.getBoundingSphere(new THREE.Sphere());
    var center = sphere.center.clone();
    var rect = container.getBoundingClientRect();
    var aspect = Math.max(rect.width / Math.max(rect.height, 1), 0.2);
    var vFov = THREE.MathUtils.degToRad(camera.fov);
    var hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    var limitingFov = Math.max(0.25, Math.min(vFov, hFov));
    var distance = Math.max(120, sphere.radius / Math.sin(limitingFov / 2) * 0.92);
    var direction;

    if (view === 'top') {
        camera.up.set(0, 0, 1);
        direction = new THREE.Vector3(0, 1, 0);
        controls.enableRotate = false;
    } else if (view === 'side') {
        camera.up.set(0, 1, 0);
        direction = new THREE.Vector3(0, 0.16, 1).normalize();
        controls.enableRotate = true;
    } else {
        camera.up.set(0, 1, 0);
        direction = new THREE.Vector3(1, 0.72, -1).normalize();
        controls.enableRotate = true;
    }

    controls.target.copy(center);
    camera.position.copy(center).add(direction.multiplyScalar(distance));
    camera.near = Math.max(0.1, distance - sphere.radius * 2.2);
    camera.far = distance + sphere.radius * 5.5;
    camera.updateProjectionMatrix();
    camera.lookAt(center);
    controls.update();
    labelLayoutDirty = true;
}

function labelMatchesVisibleProfile(mesh) {
    var targetId = mesh.userData.labelTargetId;
    var unitInfo = UNIDADES_DATA[targetId];
    if (!unitInfo) return true;
    return activeLines.has(unitInfo.line);
}

function overlayCollisionRects(canvasRect) {
    return ['.toolbar', '.status', '.help-note'].map(function (selector) {
        var el = document.querySelector(selector);
        if (!el || el.offsetParent === null) return null;
        var r = el.getBoundingClientRect();
        return {
            left: r.left - canvasRect.left, top: r.top - canvasRect.top,
            right: r.right - canvasRect.left, bottom: r.bottom - canvasRect.top
        };
    }).filter(Boolean);
}

function rectsOverlap(a, b, pad) {
    return !(a.right + pad < b.left || a.left - pad > b.right ||
        a.bottom + pad < b.top || a.top - pad > b.bottom);
}

function updateSmartLabels() {
    var canvasRect = renderer.domElement.getBoundingClientRect();
    if (canvasRect.width < 2 || canvasRect.height < 2) return;
    var occupied = overlayCollisionRects(canvasRect);
    var candidates = [];

    structuresGroup.children.forEach(function (mesh) {
        if (!mesh.userData || mesh.userData.tipo !== 'label') return;
        var priority = mesh.userData.labelPriority || 1;
        var labelsEnabled = activeLines.has('Etiquetas') && mesh.userData.layerVisible;
        var modeAllows = currentMode !== 'limpio' &&
            (currentMode !== 'presentacion' || priority >= 2);
        var profileAllows = labelMatchesVisibleProfile(mesh);
        if (!labelsEnabled || !modeAllows || !profileAllows) {
            mesh.visible = false;
            return;
        }

        var projected = mesh.position.clone().project(camera);
        if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1.04 || Math.abs(projected.y) > 1.04) {
            mesh.visible = false;
            return;
        }

        var distance = camera.position.distanceTo(mesh.position);
        var hWorld = Math.max(1.3, Math.min(2.8, distance * 0.005)) * labelScaleFactor;
        mesh.scale.set(hWorld * mesh.userData.labelAspect, hWorld, 1);

        var x = (projected.x * 0.5 + 0.5) * canvasRect.width;
        var y = (-projected.y * 0.5 + 0.5) * canvasRect.height;
        var width = Math.max(45, Math.min(110, mesh.userData.labelPixelWidth * 0.5));
        var height = 15;
        candidates.push({
            mesh: mesh, priority: priority, distance: distance,
            rect: {
                left: x - width / 2, top: y - height / 2,
                right: x + width / 2, bottom: y + height / 2
            }
        });
    });

    candidates.sort(function (a, b) {
        return b.priority - a.priority || a.distance - b.distance;
    });

    candidates.forEach(function (candidate) {
        var collides = occupied.some(function (rect) {
            return rectsOverlap(candidate.rect, rect, 6);
        });
        candidate.mesh.visible = !collides;
        if (!collides) occupied.push(candidate.rect);
    });
    labelLayoutDirty = false;
}

// ==========================================
// BLOCK D: setupLegendToggles (REPLACED — checkbox-based)
// ==========================================
function setupLegendToggles() {
    document.querySelectorAll('.layer-chk[data-line]').forEach(function (chk) {
        chk.addEventListener('change', function () {
            var line = this.dataset.line;
            if (this.checked) {
                activeLines.add(line);
            } else {
                activeLines.delete(line);
            }
            if (line === 'Etiquetas') {
                var chkToggleLabels = document.getElementById('chk-toggle-labels');
                if (chkToggleLabels) chkToggleLabels.checked = this.checked;
            }
            updateLineVisibility();
        });
    });
}

// ==========================================
// BLOCK E: UNIDADES_DATA dictionary
// ==========================================
const UNIDADES_DATA = {
    "A01_LLEGADA": {
        name: "Caja de Llegada y Entrada",
        line: "Línea de Aguas (Primaria)",
        desc: "Punto de recepción y vertido por gravedad desde la red de alcantarillado exterior de Silvouta.",
        process: "Soporta la transición hidráulica inicial y aloja el canal de bypass hacia el aliviadero de tormentas.",
        parameters: { "Caudal de diseño": "64.800 m3/d", "Caudal punta": "84.240 m3/d", "Dimensiones": "Caja hormigón 5.4 x 4.2 x 2.0 m" }
    },
    "A01_BYPASS": {
        name: "Aliviadero y By-pass de Entrada",
        line: "Línea de Aguas (Primaria)",
        desc: "Canal de descarga para exceso de caudales en tiempo de lluvias.",
        process: "Desvía caudales superiores al límite hidráulico directamente al canal de vertido exterior al Río Sar.",
        parameters: { "Caudal de alivio": "Hasta 3.0 m3/s", "Criterio de corte": "Gravedad" }
    },
    "A02_POZO": {
        name: "Pozo de Gruesos",
        line: "Línea de Aguas (Primaria)",
        desc: "Fosa profunda de recepción del caudal del colector general.",
        process: "Retiene las arenas pesadas y piedras antes del desbaste, permitiendo la extracción por cuchara bivalva.",
        parameters: { "Profundidad útil": "5.5 m", "Extracción": "Mecánica bivalva", "Ubicación contenedor": "Lado Este" }
    },
    "A03a_DESBASTE_GR": {
        name: "Desbaste de Gruesos",
        line: "Línea de Aguas (Primaria)",
        desc: "Rejas de limpieza mecánica gruesa.",
        process: "Retención y eliminación de sólidos de gran tamaño (trapos, plásticos) para proteger las bombas de impulsión.",
        parameters: { "Luz de paso": "25 mm", "Inclinación": "75 grados", "Limpieza": "Mecánica" }
    },
    "A03b_DESBASTE_FN": {
        name: "Desbaste de Finos",
        line: "Línea de Aguas (Primaria)",
        desc: "Tamices mecánicos finos autolimpiantes.",
        process: "Retienen el cabello, fibras e impurezas finas antes de la entrada al decantador primario y reactores biológicos.",
        parameters: { "Luz de paso": "6 mm", "Limpieza": "Automática contraflujo" }
    },
    "A04_BOMBEO": {
        name: "Bombeo de Agua Bruta (B1)",
        line: "Línea de Aguas (Primaria)",
        desc: "Estación de bombeo principal para elevación hidráulica.",
        process: "Impulsa el agua residual desbastada hacia la cota del desarenador y decantación primaria.",
        parameters: { "Bombas instaladas": "5 unidades (4 activas + 1 reserva)", "Caudal de impulsión": "3.510 m3/h", "Pérdida de carga": "0.402 m", "H manométrica": "7.702 m", "Potencia total": "98.22 kW" }
    },
    "A05_DESARENADO": {
        name: "Desarenador-Desengrasador",
        line: "Línea de Aguas (Primaria)",
        desc: "Canales aireados de velocidad controlada.",
        process: "Sedimentación de arenas finas y flotación asistida por aireación para grasas, aceites y espumas.",
        parameters: { "Profundidad": "3.5 m", "Sistema de extracción": "Puente barredor rasante", "Inyección aire": "Soplante de burbuja media" }
    },
    "A06a_PRIMARIO_1": {
        name: "Decantador Primario Rectangular 1",
        line: "Línea de Aguas (Primaria)",
        desc: "Tanque de decantación física primaria por gravedad (Línea 1).",
        process: "Sedimenta la materia orgánica suspendida, reduciendo la carga biológica de DBO5/SST y produciendo lodos primarios.",
        parameters: { "Profundidad": "3.5 m", "Área total": "810 m2", "Producción lodo primario": "2.151 kgSS/d", "Caudal purga": "500 m3/d" }
    },
    "A06b_PRIMARIO_2": {
        name: "Decantador Primario Rectangular 2",
        line: "Línea de Aguas (Primaria)",
        desc: "Tanque de decantación física primaria por gravedad (Línea 2).",
        process: "Sedimenta la materia orgánica suspendida, reduciendo la carga biológica de DBO5/SST y produciendo lodos primarios.",
        parameters: { "Profundidad": "3.5 m", "Área total": "810 m2", "Producción lodo primario": "2.151 kgSS/d", "Caudal purga": "500 m3/d" }
    },
    "A07_FECL3": {
        name: "Dosificación y Almacenamiento FeCl3",
        line: "Línea de Aguas (Primaria)",
        desc: "Punto de inyección química para precipitación de fósforo.",
        process: "Añade Cloruro Férrico (FeCl3) al licor mezcla para coagular el fósforo soluble como fango químico antes del MBR.",
        parameters: { "Dosis aplicada": "10 gFe/m3", "Modo control": "Proporcional a caudal (doci_Eflu)", "Consumo GPS-X max": "834,45 kg/d" }
    },
    "A08a_REACTOR_MBR_1": {
        name: "Reactor Biológico y Tanque MBR 1",
        line: "Línea de Aguas (Biológica)",
        desc: "Reactor de fangos activos de aireación extendida MBR (Línea 1).",
        process: "Eliminación biológica de nutrientes (Nitrificación/Desnitrificación) mediante zonas anóxicas y aeróbicas.",
        parameters: { "Volumen reactor": "10.010 m3", "Área membranas": "87.750 m2", "MLSS biomasa": "18.030 mg/L", "Perfil redox": "1 Anóxica / 3 Aeróbicas", "Oxígeno disuelto": "0.0 / 1.5 / 1.5 / 1.5 mg/L" }
    },
    "A08b_REACTOR_MBR_2": {
        name: "Reactor Biológico y Tanque MBR 2",
        line: "Línea de Aguas (Biológica)",
        desc: "Reactor de fangos activos de aireación extendida MBR (Línea 2).",
        process: "Eliminación biológica de nutrientes (Nitrificación/Desnitrificación) mediante zonas anóxicas y aeróbicas.",
        parameters: { "Volumen reactor": "10.010 m3", "Área membranas": "87.750 m2", "MLSS biomasa": "18.030 mg/L", "Perfil redox": "1 Anóxica / 3 Aeróbicas", "Oxígeno disuelto": "0.0 / 1.5 / 1.5 / 1.5 mg/L" }
    },
    "A10_UV": {
        name: "Canal de Desinfección UV",
        line: "Línea de Aguas (Biológica)",
        desc: "Etapa de desinfección final por radiación Ultravioleta.",
        process: "Elimina patógenos del permeado MBR antes de su descarga definitiva al Río Sar.",
        parameters: { "Líneas de lámparas": "2 activas (Línea 1/2)", "Caudal efluente": "84.240 m3/d" }
    },
    "A11_VERTIDO": {
        name: "Arqueta de Vertido Final",
        line: "Línea de Aguas (Biológica)",
        desc: "Punto final de salida de agua depurada e instrumentación de vertido.",
        process: "Mide caudal final de salida y aloja la conducción de vertido directo hacia el cauce occidental del Río Sar.",
        parameters: { "Caudal final": "82.944,58 m3/d", "DBO5 final": "2,02 mg/L", "DQO final": "22,26 mg/L", "SST final": "1,98 mg/L", "TN final": "5,29 mg/L", "TP final": "0,40 mg/L" }
    },
    "A13_RETORNOS": {
        name: "Depósito de Sobrenadantes y Retornos",
        line: "Línea de Aguas (Primaria)",
        desc: "Estación de captación de retornos y escurridos de fangos.",
        process: "Recibe los escurridos de deshidratación y espesadores para bombearlos gradualmente al pretratamiento.",
        parameters: { "Caudal medio": "1.250 m3/d (recirculado)" }
    },
    "F00_TAMIZADO": {
        name: "Tamizado de Fangos Primarios",
        line: "Línea de Fangos (Espesamiento)",
        desc: "Tamiz de lodos procedentes de decantación primaria.",
        process: "Retira sólidos gruesos atrapados en el lodo primario para proteger el digestor.",
        parameters: { "Caudal de lodo": "500 m3/d" }
    },
    "F01_ESPESADOR": {
        name: "Espesador de Lodos por Gravedad",
        line: "Línea de Fangos (Espesamiento)",
        desc: "Espesamiento físico de fangos mixtos.",
        process: "Reduce el volumen de los lodos disminuyendo el contenido de agua libre mediante sedimentación por gravedad.",
        parameters: { "Profundidad": "3.5 m", "Caudal alimentación": "1.100 m3/d", "Consistencia salida": "6% sólidos" }
    },
    "F02_ACOND": {
        name: "Depósito de Acondicionamiento y Mezcla",
        line: "Línea de Fangos (Espesamiento)",
        desc: "Homogeneización de fangos primarios y secundarios.",
        process: "Mezcla íntima de corrientes lodosas y adición de polímeros floculantes para estabilizar la alimentación del digestor.",
        parameters: { "Capacidad": "350 m3", "Agitadores": "2 hélices sumergibles" }
    },
    "F03_DIGESTOR": {
        name: "Digestor Anaerobio Primario",
        line: "Línea de Fangos (Digestión)",
        desc: "Reactor biológico de digestión anaerobia mesófila.",
        process: "Estabiliza la materia orgánica del lodo, destruyendo patógenos y produciendo biogás como subproducto energético.",
        parameters: { "Volumen digestor": "4.339 m3 (2 unidades)", "Temperatura": "35 °C", "Producción biogás": "2.336 m3/d", "Tiempo de retención": "20 días" }
    },
    "F04_TAMPON": {
        name: "Depósito Tampón de Lodo Digerido",
        line: "Línea de Fangos (Digestión)",
        desc: "Tanque de regulación intermedia de lodo digerido.",
        process: "Desacopla la digestión continua del proceso discontinuo de deshidratación mecánica.",
        parameters: { "Capacidad útil": "600 m3", "Tiempo almacenamiento": "2.5 días" }
    },
    "F05_DESHID": {
        name: "Edificio de Deshidratación de Lodos",
        line: "Línea de Fangos (Digestión)",
        desc: "Edificio industrial para centrifugación mecánica.",
        process: "Centrífugas de tambor de alta velocidad que separan el agua de los lodos, alcanzando una torta sólida seca.",
        parameters: { "Producción torta deshidratada": "28,70 t/d húmeda", "Sólidos en torta": "8,04 tSS/d", "Sequedad": "28%", "Retirada": "2 viajes/d de 20 t" }
    },
    "F06_SILOS": {
        name: "Silos de Almacenamiento de Fangos",
        line: "Línea de Fangos (Digestión)",
        desc: "Silos elevados para lodo deshidratado.",
        process: "Almacenan la torta sólida de lodo hasta su carga gravitatoria en los camiones de transporte agrícola.",
        parameters: { "Capacidad": "2 silos de 120 t", "Destino fango": "Camión de 20 t (2 viajes diarios)" }
    },
    "G_SISTEMA_BIOGAS": {
        name: "Gasómetros y Tratamiento de Biogás",
        line: "Línea de Gas",
        desc: "Red de almacenamiento y acondicionamiento de biogás.",
        process: "Almacena biogás producido, retiene humedad (condensados) y desulfura mediante filtros de carbón.",
        parameters: { "Capacidad gasómetros": "2.494 m3", "Producción": "2.336 m3/d" }
    },
    "O_DESOD_EDIFICIOS": {
        name: "Sistema de Desodorización y Biofiltro",
        line: "Línea de Olores",
        desc: "Instalación centralizada de tratamiento de aire oloroso.",
        process: "Extrae aire confinado de pretratamientos y fangos, eliminando sulfhídrico (H2S) y mercaptanos antes de su salida.",
        parameters: { "Caudal de aire": "103.200 m3/h", "Chimenea de salida": "Diámetro 1.4m x Altura 14m", "Tratamiento": "Biofiltración orgánica" }
    },
    "antorcha_biogas": {
        name: "Antorcha de Biogás de Seguridad",
        line: "Línea de Gas",
        desc: "Antorcha quemadora de biogás de seguridad.",
        process: "Quema excedentes de biogás cuando el sistema de cogeneración o caldera se encuentran fuera de servicio.",
        parameters: { "Capacidad quema": "150 m3/h" }
    },
    "chimenea_aire_tratado_olores": {
        name: "Chimenea de Descarga Olores",
        line: "Línea de Olores",
        desc: "Salida vertical de ventilación forzada.",
        process: "Evacúa el caudal tratado del biofiltro a la atmósfera respetando los límites de emisión de H2S.",
        parameters: { "Altura": "14.0 m", "Velocidad descarga": "12 m/s" }
    },
    "edificio_soplantes_25x16": {
        name: "Edificio de Soplantes",
        line: "Línea de Aguas (Biológica)",
        desc: "Sala de soplantes y control eléctrico.",
        process: "Produce aire para los difusores sumergibles del reactor MBR y el lavado neumático de membranas.",
        parameters: { "Caudal aireación": "30.282 m3/h", "Potencia sopladores": "316.70 kW" }
    },
    "contenedor_gruesos": {
        name: "Contenedor de Gruesos de Pretratamiento",
        line: "Rechazos de Pretratamiento",
        desc: "Cubeto metálico abierto para residuos industriales.",
        process: "Recibe sólidos retenidos por el desbaste grueso del pozo de entrada.",
        parameters: { "Capacidad": "12 m3" }
    }
};

// ==========================================
// BLOCK F: Panel rendering functions
// ==========================================
const panel = document.getElementById("side-panel");

function formatNumber(value, decimals) {
    var numeric = Number(value);
    if (!Number.isFinite(numeric)) return 'N/D';
    return numeric.toLocaleString('es-ES', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function effluentValue(key, fallback) {
    var eff = MODEL_METADATA.effluent || {};
    return eff[key] && Number.isFinite(Number(eff[key].value)) ? Number(eff[key].value) : fallback;
}

function defaultPanel() {
    var qMedio = Number(MODEL_METADATA.q_medio_m3_d || 64800);
    var qPunta = Number(MODEL_METADATA.q_punta_m3_d || 84240);
    var parcela = Number(MODEL_METADATA.superficie_zona_m2 || 37306.95);
    var ocupacion = Number(MODEL_METADATA.ocupacion_pct || 54.76);
    var finalFlow = Number(MODEL_METADATA.final_flow_m3_d || 82944.576);
    panel.innerHTML = `
        <div class="panel-kicker">Gemelo Digital</div>
        <h2 style="margin:4px 0 14px 0;font-size:20px;color:var(--text-dark);">DSTA Silvouta</h2>
        
        <div class="card">
            <h3>Bases Generales del Diseño</h3>
            <div class="data-grid">
                <span class="grid-label">Caudal Medio (Qmed)</span><span class="grid-value">${formatNumber(qMedio, 0)} m³/d</span>
                <span class="grid-label">Caudal Punta (Qpunta)</span><span class="grid-value">${formatNumber(qPunta, 0)} m³/d</span>
                <span class="grid-label">Caudal final GPS-X</span><span class="grid-value">${formatNumber(finalFlow, 1)} m³/d</span>
                <span class="grid-label">Población Equivalente</span><span class="grid-value">257.040 hab-eq</span>
                <span class="grid-label">Superficie Parcela</span><span class="grid-value">${formatNumber(parcela, 2)} m²</span>
                <span class="grid-label">Ocupación Relativa</span><span class="grid-value">${formatNumber(ocupacion, 2)}%</span>
            </div>
        </div>

        <div class="card">
            <h3>Desempeño Efluente Final (GPS-X8 Max)</h3>
            <div class="data-grid">
                <span class="grid-label">DBO5 Efluente</span><span class="grid-value">${formatNumber(effluentValue('DBO5', 2.0246), 2)} mg/L <span class="pill">Cumple</span></span>
                <span class="grid-label">DQO Efluente</span><span class="grid-value">${formatNumber(effluentValue('DQO', 22.2619), 2)} mg/L <span class="pill">Cumple</span></span>
                <span class="grid-label">SST Efluente</span><span class="grid-value">${formatNumber(effluentValue('SST', 1.9818), 2)} mg/L <span class="pill">Cumple</span></span>
                <span class="grid-label">Nitrógeno Total (TN)</span><span class="grid-value">${formatNumber(effluentValue('TN', 5.2860), 2)} mg/L <span class="pill">Cumple</span></span>
                <span class="grid-label">Fósforo Total (TP)</span><span class="grid-value">${formatNumber(effluentValue('TP', 0.3965), 2)} mg/L <span class="pill">Cumple</span></span>
            </div>
        </div>

        <div class="card">
            <h3>Instrucciones de Uso</h3>
            <p>Haz clic en cualquier equipo (tanque, bomba, tubería) en el visualizador 3D para ver su ficha de proceso, parámetros de diseño y rol operativo.</p>
        </div>
    `;
}

function unitPanel(id) {
    const u = UNIDADES_DATA[id];
    if (!u) {
        defaultPanel();
        return;
    }

    let paramHTML = "";
    for (const [key, val] of Object.entries(u.parameters || {})) {
        paramHTML += '<span class="grid-label">' + key + '</span><span class="grid-value">' + val + '</span>';
    }

    panel.innerHTML = `
        <div class="panel-kicker">${u.line}</div>
        <h2 style="margin:4px 0 14px 0;font-size:20px;color:var(--text-dark);">${u.name}</h2>
        
        <div class="card">
            <h3>¿Qué es?</h3>
            <p>${u.desc}</p>
        </div>

        <div class="card">
            <h3>¿Qué proceso ocurre aquí?</h3>
            <p>${u.process}</p>
        </div>

        <div class="card">
            <h3>Parámetros de Diseño (Excel V11)</h3>
            <div class="data-grid">
                ${paramHTML}
            </div>
        </div>

        <button onclick="clearSelection()" style="width:100%;margin-top:10px;background:#334455;color:#fff;">Cerrar Selección</button>
    `;
}

function pipePanel(pData) {
    panel.innerHTML = `
        <div class="panel-kicker">${pData.linea || 'Tubería de Conexión'}</div>
        <h2 style="margin:4px 0 14px 0;font-size:20px;color:var(--text-dark);">${pData.nombre || 'Conducción'}</h2>
        
        <div class="card">
            <h3>Detalle Hidráulico</h3>
            <p>Conecta las unidades de proceso asegurando la continuidad del flujo del Gemelo Digital.</p>
        </div>

        <div class="card">
            <h3>Datos Físicos (GIS)</h3>
            <div class="data-grid">
                <span class="grid-label">Eje de Conexión</span><span class="grid-value">${pData.tipo || 'Tubería'}</span>
                <span class="grid-label">Radio nominal</span><span class="grid-value">${pData.rawUnit && pData.rawUnit.r ? pData.rawUnit.r.toFixed(2) + ' m' : 'N/D'}</span>
                <span class="grid-label">Color de flujo</span><span class="grid-value" style="color:${pData.rawUnit ? pData.rawUnit.color : '#444'}">■ Activo</span>
            </div>
        </div>

        <button onclick="clearSelection()" style="width:100%;margin-top:10px;background:#334455;color:#fff;">Cerrar Selección</button>
    `;
}

// ==========================================
// BLOCK G: fetch geometry.json → buildPlant (PRESERVED)
// ==========================================

// Gráficos temporales desactivados (fase de infraestructura).
// Las funciones de simulación dinámica se eliminan en esta versión.

fetch('data/geometry.json?v=' + VIEWER_VERSION)
    .then(function (response) { return response.json(); })
    .then(function (data) {
        MODEL_METADATA = data.metadata || {};
        buildPlant(data.unidades);
        defaultPanel();
    })
    .catch(function (err) { console.error('Error cargando JSON:', err); });

function buildPlant(unidades) {
    unidades.forEach(function (unit, index) {
        var mesh;
        var y_offset = 0;
        var pipeStartLocal = null;
        var pipeEndLocal = null;

        if (unit.tipo === 'box' || unit.tipo === 'cylinder' || unit.tipo === 'sphere') {
            var geometry;
            if (unit.tipo === 'box') {
                geometry = new THREE.BoxGeometry(unit.l, unit.h, unit.w);
            } else if (unit.tipo === 'cylinder') {
                geometry = new THREE.CylinderGeometry(unit.r, unit.r, unit.h, 32);
            } else if (unit.tipo === 'sphere') {
                geometry = new THREE.SphereGeometry(unit.r, 32, 32);
            }

            var roughness = 0.38;
            var metalness = 0.08;
            // Materiales especiales por tipo de equipo — colores más vivos
            if (unit.linea && unit.linea.indexOf('Biológica') !== -1) {
                roughness = 0.28; metalness = 0.15;
            } else if (unit.linea && unit.linea.indexOf('Gas') !== -1) {
                roughness = 0.20; metalness = 0.35;
            } else if (unit.linea && unit.linea.indexOf('Olores') !== -1) {
                roughness = 0.35; metalness = 0.12;
            } else if (unit.linea && unit.linea.indexOf('Fangos') !== -1) {
                roughness = 0.40; metalness = 0.10;
            }

            // Saturar el color un 30% para que destaque más
            var baseColor = new THREE.Color(unit.color);
            var hsl = {};
            baseColor.getHSL(hsl);
            baseColor.setHSL(hsl.h, Math.min(1.0, hsl.s * 1.3), Math.max(0.18, Math.min(0.62, hsl.l)));

            var material = new THREE.MeshStandardMaterial({
                color: baseColor, roughness: roughness, metalness: metalness
            });
            mesh = new THREE.Mesh(geometry, material);
            y_offset = (unit.h || 0) / 2;
            mesh.position.set(toSceneX(unit.x), unit.y + y_offset, toSceneZ(unit.z));
            mesh.castShadow = true;
            mesh.receiveShadow = true;

        } else if (unit.tipo === 'terrain_cell') {
            // Legacy terrain cells (ya no se generan, se mantiene compatibilidad)
            var tgeo = new THREE.BoxGeometry(unit.l, unit.h || 0.22, unit.w);
            var tmat = new THREE.MeshStandardMaterial({
                color: unit.color, roughness: 0.92, metalness: 0.0,
                transparent: true, opacity: unit.opacity || 0.62, depthWrite: false
            });
            mesh = new THREE.Mesh(tgeo, tmat);
            mesh.position.set(toSceneX(unit.x), unit.y, toSceneZ(unit.z));
            mesh.receiveShadow = true;

        } else if (unit.tipo === 'terrain_mesh') {
            // DEM triangulación completa — BufferGeometry indexado con vertex colors
            var vArr = new Float32Array(unit.vertices);
            var iArr = unit.indices.length > 65535
                ? new Uint32Array(unit.indices)
                : new Uint16Array(unit.indices);
            var cArr = new Float32Array(unit.colors);

            var tmeshGeo = new THREE.BufferGeometry();
            tmeshGeo.setIndex(new THREE.BufferAttribute(iArr, 1));
            tmeshGeo.setAttribute('position', new THREE.BufferAttribute(vArr, 3));
            tmeshGeo.setAttribute('color', new THREE.BufferAttribute(cArr, 3));
            tmeshGeo.computeVertexNormals();

            var tmeshMat = new THREE.MeshStandardMaterial({
                vertexColors: true,
                roughness: 0.92,
                metalness: 0.0,
                transparent: true,
                opacity: unit.opacity || 0.78,
                depthWrite: true,
                side: THREE.DoubleSide,
                polygonOffset: true,
                polygonOffsetFactor: 2.0,
                polygonOffsetUnits: 1.0
            });
            mesh = new THREE.Mesh(tmeshGeo, tmeshMat);
            mesh.name = "dem_terrain_mesh";

            // Dibujar los límites exteriores de los polígonos de Thiessen (Voronoi) si están presentes
            var wireframe;
            if (unit.line_indices && unit.line_indices.length > 0) {
                var lineGeo = new THREE.BufferGeometry();
                lineGeo.setAttribute('position', new THREE.BufferAttribute(vArr, 3));
                var liArr = unit.line_indices.length > 65535
                    ? new THREE.Uint32BufferAttribute(unit.line_indices, 1)
                    : new THREE.Uint16BufferAttribute(unit.line_indices, 1);
                lineGeo.setIndex(liArr);
                var wireframeMat = new THREE.LineBasicMaterial({
                    color: 0x2a9d8f,
                    transparent: true,
                    opacity: 0.38
                });
                wireframe = new THREE.LineSegments(lineGeo, wireframeMat);
            } else {
                // Fallback a wireframe regular de triángulos si no hay line_indices
                var wireframeGeo = new THREE.WireframeGeometry(tmeshGeo);
                var wireframeMat = new THREE.LineBasicMaterial({
                    color: 0x2a9d8f,
                    transparent: true,
                    opacity: 0.25
                });
                wireframe = new THREE.LineSegments(wireframeGeo, wireframeMat);
            }
            wireframe.name = "dem_terrain_wireframe";
            mesh.add(wireframe);

            // Los vértices YA están en coordenadas locales (lx, ly, lz), solo hay que espejar X
            // Pero el mesh se posiciona en (0,0,0) porque los vértices ya tienen la transformación
            // Espejar X en los vértices
            var posAttr = tmeshGeo.getAttribute('position');
            for (var vi = 0; vi < posAttr.count; vi++) {
                posAttr.setX(vi, toSceneX(posAttr.getX(vi)));
            }
            posAttr.needsUpdate = true;
            tmeshGeo.computeVertexNormals();
            mesh.position.set(0, 0, 0);
            mesh.receiveShadow = true;
            mesh.castShadow = true;

        } else if (unit.tipo === 'pipe') {
            var start = new THREE.Vector3(toSceneX(unit.x1), unit.y1, toSceneZ(unit.z1));
            var end = new THREE.Vector3(toSceneX(unit.x2), unit.y2, toSceneZ(unit.z2));
            var distance = start.distanceTo(end);
            var cylGeo = new THREE.CylinderGeometry(unit.r, unit.r, distance, 16);
            var cylMat = new THREE.MeshStandardMaterial({
                color: unit.color, metalness: 0.55, roughness: 0.25
            });
            mesh = new THREE.Mesh(cylGeo, cylMat);
            var midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
            mesh.position.copy(midPoint);
            mesh.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()
            );
            mesh.castShadow = true;

            pipeStartLocal = start.clone().sub(midPoint);
            pipeEndLocal = end.clone().sub(midPoint);

        } else if (unit.tipo === 'road') {
            var roadGeo = new THREE.BoxGeometry(unit.l, unit.h, unit.w);
            var roadMat = new THREE.MeshStandardMaterial({
                color: unit.color || '#3a3c40',
                roughness: 0.85,
                metalness: 0.05,
            });
            mesh = new THREE.Mesh(roadGeo, roadMat);
            mesh.position.set(toSceneX(unit.x), unit.y, toSceneZ(unit.z));
            mesh.rotation.y = unit.angle || 0;
            mesh.receiveShadow = true;
            mesh.castShadow = true;

        } else if (unit.tipo === 'water_volume') {
            var wvGeo = new THREE.BoxGeometry(unit.l, unit.h, unit.w);
            var wvMat = new THREE.MeshPhysicalMaterial({
                color: unit.color, transparent: true,
                opacity: unit.opacity || 0.35, roughness: 0.05,
                transmission: 0.45, thickness: 1.0, depthWrite: false
            });
            mesh = new THREE.Mesh(wvGeo, wvMat);
            y_offset = (unit.h || 0) / 2;
            mesh.position.set(toSceneX(unit.x), unit.y + y_offset, toSceneZ(unit.z));

        } else if (unit.tipo === 'water_plane') {
            var wpGeo;
            if (unit.isCircle) {
                wpGeo = new THREE.CircleGeometry(unit.r, 32);
            } else {
                wpGeo = new THREE.PlaneGeometry(unit.l, unit.w);
            }
            var wpMat = new THREE.MeshPhysicalMaterial({
                color: unit.color, transparent: true, opacity: 0.6,
                roughness: 0.1, transmission: 0.6, thickness: 1.0
            });
            mesh = new THREE.Mesh(wpGeo, wpMat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(toSceneX(unit.x), unit.y, toSceneZ(unit.z));

        } else if (unit.tipo === 'pump') {
            var pGeo = new THREE.CylinderGeometry(0.8, 1, 1.5, 16);
            var pMat = new THREE.MeshStandardMaterial({ color: unit.color, metalness: 0.8, roughness: 0.3 });
            mesh = new THREE.Mesh(pGeo, pMat);
            y_offset = 0.75;
            mesh.position.set(toSceneX(unit.x), unit.y + y_offset, toSceneZ(unit.z));
            mesh.castShadow = true;

        } else if (unit.tipo === 'aeration') {
            mesh = new THREE.GridHelper(unit.l, 10, unit.color, unit.color);
            mesh.position.set(toSceneX(unit.x), unit.y, toSceneZ(unit.z));
            mesh.scale.set(1, 1, unit.w / unit.l);
        } else if (unit.tipo === 'label') {
            mesh = makeLabelSprite(unit.text || unit.nombre, unit.color || '#ffffff', unit.size || 48, unit.id);
            mesh.position.set(toSceneX(unit.x), unit.y, toSceneZ(unit.z));
        }

        if (mesh) {
            mesh.name = unit.id || ('unit_' + index);
            mesh.userData = Object.assign({}, mesh.userData, {
                nombre: unit.nombre,
                linea: unit.linea,
                tipo: unit.tipo,
                rawUnit: unit,
                index: index,
                y_offset: y_offset,
                originalCenterY: mesh.position.y,
                pipeStartLocal: pipeStartLocal,
                pipeEndLocal: pipeEndLocal,
                layerVisible: true,
                labelTargetId: unit.tipo === 'label' ? String(unit.id || '').replace(/^label_/, '') : null,
                labelPriority: unit.tipo === 'label' ? (LABEL_PRIORITY[unit.id] || 1) : 0
            });
            structuresGroup.add(mesh);
        }
    });
    hasBuiltPlant = true;
    updateLineVisibility();
    resize();
    applySceneMode('presentacion', false);
    fitCameraToVisible('iso');
    collectWaterPlanes();
}

function makeLabelSprite(text, color, size, id) {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    // Aumentamos el tamaño de la fuente para que sea más legible y grande (48 a 72px)
    var fontSize = Math.max(48, Math.min(size * 1.3, 72));
    ctx.font = '800 ' + fontSize + 'px "Segoe UI", Arial, Helvetica, sans-serif';
    var metrics = ctx.measureText(text);
    // Padding un poco mayor para el texto más grande
    var padH = 16, padV = 8;
    canvas.width = Math.ceil(metrics.width + padH * 2);
    canvas.height = Math.ceil(fontSize * 1.1 + padV * 2);

    ctx.font = '800 ' + fontSize + 'px "Segoe UI", Arial, Helvetica, sans-serif';

    // Fondo claro de alta opacidad y alto contraste (para texto negro)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    roundedRect(ctx, 2, 2, canvas.width - 4, canvas.height - 4, canvas.height / 2);
    ctx.fill();

    // Borde de acento verde/azul característico de la EDAR
    ctx.strokeStyle = '#2a9d8f';
    ctx.lineWidth = 3;
    roundedRect(ctx, 2, 2, canvas.width - 4, canvas.height - 4, canvas.height / 2);
    ctx.stroke();

    // Texto negro relleno
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Sombra de luz sutil detrás del texto negro para que resalte
    ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
    ctx.shadowBlur = 2;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    ctx.shadowBlur = 0;

    var texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    var material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false });
    var sprite = new THREE.Sprite(material);
    sprite.renderOrder = 999;
    sprite.scale.set(1, 1, 1);
    sprite.userData.labelAspect = canvas.width / canvas.height;
    sprite.userData.labelPixelWidth = Math.max(80, Math.min(220, canvas.width * 0.40));
    sprite.userData.labelPriority = LABEL_PRIORITY[id] || 1;
    sprite.raycast = function () { };
    return sprite;
}

function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ==========================================
// BLOCK H: DELETED getDynamicTooltipContent()
// BLOCK I: RAYCASTER PARA CLICS (REPLACES old mousemove)
// ==========================================

renderer.domElement.addEventListener('click', onDocumentClick, false);

function onDocumentClick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(structuresGroup.children, true);
    const selectableTypes = ['box', 'cylinder', 'pump', 'pipe'];

    for (const hit of intersects) {
        let obj = hit.object;
        while (obj && obj !== structuresGroup && (!obj.userData || !obj.userData.rawUnit)) {
            obj = obj.parent;
        }
        if (obj && obj.userData && obj.userData.rawUnit &&
            selectableTypes.indexOf(obj.userData.rawUnit.tipo) !== -1) {
            selectMesh(obj);
            return;
        }
    }
}

function selectMesh(mesh) {
    clearSelection();

    SELECTED_MESH = mesh;
    const userData = mesh.userData;

    if (userData && userData.rawUnit) {
        const raw = userData.rawUnit;
        if (mesh.material && mesh.material.emissive) {
            ORIGINAL_EMISSIVE_HEX = mesh.material.emissive.getHex();
            mesh.material.emissive.setHex(0x555522);
        }

        if (raw.tipo === 'pipe') {
            pipePanel(userData);
        } else {
            unitPanel(raw.id || userData.nombre);
        }
        document.getElementById("status").innerHTML = '<strong>Selección:</strong> ' + (userData.nombre || 'Elemento');
        panel.scrollTop = 0;
        if (window.matchMedia('(max-width: 820px)').matches) {
            panel.classList.add('mobile-open');
            document.getElementById('btn-panel-mobile').setAttribute('aria-expanded', 'true');
        }
        labelLayoutDirty = true;
    }
}

function clearSelection() {
    if (SELECTED_MESH && SELECTED_MESH.material && SELECTED_MESH.material.emissive) {
        SELECTED_MESH.material.emissive.setHex(ORIGINAL_EMISSIVE_HEX);
    }
    SELECTED_MESH = null;
    defaultPanel();
    document.getElementById("status").textContent = 'Haz clic en un equipo o tubería para abrir su ficha de proceso técnica.';
    if (window.matchMedia('(max-width: 820px)').matches) {
        panel.classList.remove('mobile-open');
        document.getElementById('btn-panel-mobile').setAttribute('aria-expanded', 'false');
        document.getElementById('btn-panel-mobile').textContent = 'Ficha técnica';
    }
    labelLayoutDirty = true;
}

// ==========================================
// BLOCK J: showProfileMode (UPDATED for checkboxes)
// ==========================================
function showProfileMode(mode) {
    var profileLayers = {
        agua: ['Línea de Aguas (Primaria)', 'Línea de Aguas (Biológica)', 'Topografía', 'Río', 'Etiquetas'],
        lodos: ['Línea de Fangos (Espesamiento)', 'Línea de Fangos (Digestión)', 'Topografía', 'Río', 'Calle y Accesos', 'Etiquetas'],
        gas: ['Línea de Gas', 'Topografía', 'Río', 'Etiquetas'],
        olores: ['Línea de Olores', 'Topografía', 'Río', 'Calle y Accesos', 'Etiquetas'],
        todo: PROCESS_LINES
    };

    var visibleLayers = profileLayers[mode] || PROCESS_LINES;
    activeLines.clear();
    visibleLayers.forEach(function (l) { activeLines.add(l); });

    // Update checkboxes to match
    document.querySelectorAll('.layer-chk[data-line]').forEach(function (chk) {
        chk.checked = activeLines.has(chk.dataset.line);
    });

    updateLineVisibility();
    document.querySelectorAll('[id^="btn-perf-"]').forEach(function (button) {
        button.classList.toggle('active', button.id === 'btn-perf-' + mode);
    });

    if (mode !== 'todo') {
        setCameraView('side');
        document.querySelectorAll('#btn-iso, #btn-top, #btn-side').forEach(function (b) { b.classList.remove('active'); });
        document.getElementById('btn-side').classList.add('active');
    } else {
        setCameraView('iso');
        document.querySelectorAll('#btn-iso, #btn-top, #btn-side').forEach(function (b) { b.classList.remove('active'); });
        document.getElementById('btn-iso').classList.add('active');
    }
}

document.getElementById('btn-perf-agua').addEventListener('click', function () { showProfileMode('agua'); });
document.getElementById('btn-perf-lodos').addEventListener('click', function () { showProfileMode('lodos'); });
document.getElementById('btn-perf-gas').addEventListener('click', function () { showProfileMode('gas'); });
document.getElementById('btn-perf-olores').addEventListener('click', function () { showProfileMode('olores'); });
document.getElementById('btn-perf-todo').addEventListener('click', function () { showProfileMode('todo'); });

// ==========================================
// BLOCK K: Camera view functions (PRESERVED)
// ==========================================
document.getElementById('btn-iso').addEventListener('click', function (e) {
    setActiveBtn(e.target);
    setCameraView('iso');
});
document.getElementById('btn-top').addEventListener('click', function (e) {
    setActiveBtn(e.target);
    setCameraView('top');
});
document.getElementById('btn-side').addEventListener('click', function (e) {
    setActiveBtn(e.target);
    setCameraView('side');
});

function setActiveBtn(btn) {
    document.querySelectorAll('#btn-iso, #btn-top, #btn-side').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
}

function setCameraView(view) {
    currentView = view;
    fitCameraToVisible(view);
}

// ==========================================
// BLOCK L: VERTICAL EXAGGERATION + MODE BUTTONS
// ==========================================
const vScaleSlider = document.getElementById("vscale");
const vScaleValue = document.getElementById("vscale-value");

vScaleSlider.addEventListener('input', function (e) {
    updateVerticalScale(e.target.value);
});

document.querySelectorAll(".scale-btn").forEach(function (btn) {
    btn.addEventListener('click', function (e) {
        var val = e.target.dataset.scale;
        updateVerticalScale(val);
    });
});

function updateVerticalScale(scale) {
    var vscale = parseFloat(scale);
    vScaleSlider.value = vscale;
    vScaleValue.textContent = vscale.toFixed(1) + 'x';

    document.querySelectorAll(".scale-btn").forEach(function (btn) {
        btn.classList.toggle("active", parseFloat(btn.dataset.scale) === vscale);
    });

    structuresGroup.children.forEach(function (mesh) {
        var u = mesh.userData;
        if (u && u.rawUnit) {
            if (u.tipo === 'pipe') {
                var unit = u.rawUnit;
                var start = new THREE.Vector3(toSceneX(unit.x1), unit.y1 * vscale, toSceneZ(unit.z1));
                var end = new THREE.Vector3(toSceneX(unit.x2), unit.y2 * vscale, toSceneZ(unit.z2));
                var distance = start.distanceTo(end);

                var originalStart = new THREE.Vector3(toSceneX(unit.x1), unit.y1, toSceneZ(unit.z1));
                var originalEnd = new THREE.Vector3(toSceneX(unit.x2), unit.y2, toSceneZ(unit.z2));
                var originalDistance = originalStart.distanceTo(originalEnd);

                var midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
                mesh.position.copy(midPoint);
                mesh.quaternion.setFromUnitVectors(
                    new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()
                );
                mesh.scale.set(1, distance / originalDistance, 1);
            } else if (u.tipo === 'water_plane' || u.tipo === 'label') {
                mesh.position.y = u.originalCenterY * vscale;
            } else {
                mesh.position.y = u.originalCenterY * vscale;
                mesh.scale.y = vscale;
            }
        }
    });

    var terrain = structuresGroup.getObjectByName("dem_terrain_mesh");
    if (terrain) {
        terrain.scale.y = vscale;
    }
    if (hasBuiltPlant) fitCameraToVisible(currentView);
    labelLayoutDirty = true;
}

function applySceneMode(mode, refit) {
    currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach(function (button) {
        button.classList.toggle('active', button.dataset.mode === mode);
    });

    var labelCheckbox = document.querySelector('.layer-chk[data-line="Etiquetas"]');
    var chkToggleLabels = document.getElementById('chk-toggle-labels');
    var terrainWireframe = structuresGroup.getObjectByName('dem_terrain_wireframe');

    if (mode === 'limpio') {
        activeLines.delete('Etiquetas');
        if (labelCheckbox) labelCheckbox.checked = false;
        if (chkToggleLabels) chkToggleLabels.checked = false;
        if (terrainWireframe) terrainWireframe.visible = false;
        renderer.toneMappingExposure = 1.04;
    } else if (mode === 'tecnico') {
        activeLines.add('Etiquetas');
        if (labelCheckbox) labelCheckbox.checked = true;
        if (chkToggleLabels) chkToggleLabels.checked = true;
        if (terrainWireframe) terrainWireframe.visible = true;
        renderer.toneMappingExposure = 0.98;
    } else {
        activeLines.add('Etiquetas');
        if (labelCheckbox) labelCheckbox.checked = true;
        if (chkToggleLabels) chkToggleLabels.checked = true;
        if (terrainWireframe) terrainWireframe.visible = false;
        renderer.toneMappingExposure = 1.12;
    }

    updateLineVisibility();
    labelLayoutDirty = true;
    if (refit !== false) fitCameraToVisible(currentView);
}

// MODE BUTTONS
document.querySelectorAll('.mode-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
        applySceneMode(this.dataset.mode, true);
    });
});

document.getElementById('btn-toggle-controls').addEventListener('click', function () {
    var toolbar = document.querySelector('.toolbar');
    var collapsed = toolbar.classList.toggle('collapsed');
    this.textContent = collapsed ? 'Mostrar' : 'Ocultar';
    this.setAttribute('aria-expanded', String(!collapsed));
    labelLayoutDirty = true;
});

document.getElementById('btn-panel-mobile').addEventListener('click', function () {
    var open = panel.classList.toggle('mobile-open');
    this.setAttribute('aria-expanded', String(open));
    this.textContent = open ? 'Cerrar ficha' : 'Ficha técnica';
    labelLayoutDirty = true;
});

// ==========================================
// BLOCK M: RESIZE — usa bounding rect del contenedor grid
// ==========================================
function resize() {
    var r = container.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    renderer.setSize(Math.floor(r.width), Math.floor(r.height), false);
    if (hasBuiltPlant) fitCameraToVisible(currentView);
    labelLayoutDirty = true;
}
window.removeEventListener('resize', resize);
window.addEventListener('resize', resize);

// ==========================================
// BLOCK N: Initialize default side panel
// ==========================================
defaultPanel();
resize();
updateVerticalScale(1);

// ==========================================
// BLOCK O: Water animation + animate loop (PRESERVED)
// ==========================================

// Water animation for water_plane objects
var waterPlanes = [];
function collectWaterPlanes() {
    waterPlanes = [];
    structuresGroup.children.forEach(function (child) {
        if (child.userData && child.userData.tipo === 'water_plane') {
            waterPlanes.push(child);
        }
    });
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Animate water planes
    var t = performance.now() * 0.001;
    waterPlanes.forEach(function (wp, i) {
        wp.position.y += Math.sin(t * 0.8 + i * 0.7) * 0.015;
        if (wp.material && wp.material.opacity !== undefined) {
            wp.material.opacity = 0.55 + Math.sin(t * 0.6 + i) * 0.08;
        }
    });

    labelFrame += 1;
    if (labelLayoutDirty || labelFrame % 12 === 0) updateSmartLabels();
    renderer.render(scene, camera);
}

controls.addEventListener('change', function () { labelLayoutDirty = true; });
setupLegendToggles();
animate();

// Collect water planes after geometry is loaded with a small delay
setTimeout(collectWaterPlanes, 2000);

// Controles dinámicos de etiquetas
const chkToggleLabels = document.getElementById('chk-toggle-labels');
const labelScaleSlider = document.getElementById('label-scale-slider');
const labelScaleVal = document.getElementById('label-scale-val');

if (chkToggleLabels) {
    chkToggleLabels.addEventListener('change', function() {
        var chkEtiquetas = document.querySelector('.layer-chk[data-line="Etiquetas"]');
        if (chkEtiquetas) {
            chkEtiquetas.checked = this.checked;
            chkEtiquetas.dispatchEvent(new Event('change'));
        } else {
            if (this.checked) {
                activeLines.add('Etiquetas');
            } else {
                activeLines.delete('Etiquetas');
            }
            updateLineVisibility();
        }
    });
}

if (labelScaleSlider && labelScaleVal) {
    labelScaleSlider.addEventListener('input', function(e) {
        labelScaleFactor = parseFloat(e.target.value);
        labelScaleVal.textContent = labelScaleFactor.toFixed(1) + 'x';
        labelLayoutDirty = true;
    });
}

