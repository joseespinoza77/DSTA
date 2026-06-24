# Gemelo Digital EDAR Silvouta

Este repositorio contiene la interfaz web interactiva 3D del **Gemelo Digital de la EDAR de Silvouta**, diseñado con **Three.js** y optimizado para visualización técnica de procesos de ingeniería sanitaria (línea de agua con MBR, línea de lodos/fangos, biogás y olores).

## Estructura del Repositorio

* `web/` - Carpeta principal del visor del gemelo digital:
  * `index.html` - Visor 3D principal y controles de capas.
  * `datos.html` - Panel de datos de la planta.
  * `app.js` - Lógica de renderizado Three.js, visualización ortogonal, presets y leyendas.
  * `assets/css/styles.css` - Estilos unificados del visor.
  * `data/geometry.json` - Datos geométricos paramétricos de equipos, tuberías y terreno (DEM) de la EDAR.
  * `data/simulation_results.json` - Datos de simulación.
* `scripts/serve_web.py` - Servidor HTTP rápido de Python sin caché para pruebas en local.
* `index.html` - Redirección automática al visor web.

## Cómo Ejecutar en Local

Para ver el Gemelo Digital localmente en tu ordenador, necesitas abrir un servidor web local para evitar restricciones de seguridad del navegador (CORS) al cargar el archivo de geometría JSON.

Puedes hacerlo fácilmente ejecutando el script de Python incluido en este repositorio:

```bash
python scripts/serve_web.py
```

Esto abrirá un servidor en el puerto 8000 (o el primero disponible) e imprimirá la URL directa en la consola:
[http://127.0.0.1:8000/web/](http://127.0.0.1:8000/web/)

## Despliegue en GitHub Pages

Este repositorio está preparado para ser publicado directamente de forma online usando **GitHub Pages**:

1. En la configuración de tu repositorio en GitHub, ve a la pestaña **Settings** (Configuración).
2. Entra en la sección **Pages** (en el menú lateral izquierdo).
3. En **Build and deployment**, selecciona la rama `main` y la carpeta `/ (root)`.
4. Haz clic en **Save** (Guardar).
5. Pasados unos instantes, tu Gemelo Digital estará accesible de forma pública online en:
   `https://joseespinoza77.github.io/DSTA/`
