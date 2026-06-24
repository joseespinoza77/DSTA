from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


import json

class NoCacheHTTPRequestHandler(SimpleHTTPRequestHandler):
    def send_response(self, code: int, message: str | None = None) -> None:
        super().send_response(code, message)
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")

    def do_POST(self):
        if self.path == "/save-layout":
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                layout_data = json.loads(post_data.decode('utf-8'))
                geometry_file = ROOT / "web" / "data" / "geometry.json"
                with open(geometry_file, "w", encoding="utf-8") as f:
                    json.dump(layout_data, f, indent=2, ensure_ascii=False)
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": "Layout guardado correctamente"}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()


def serve(first_port: int, last_port: int, host: str) -> int:
    handler = partial(NoCacheHTTPRequestHandler, directory=str(ROOT))
    last_error: OSError | None = None
    for port in range(first_port, last_port + 1):
        try:
            httpd = ThreadingHTTPServer((host, port), handler)
        except OSError as exc:
            last_error = exc
            continue

        url_host = "127.0.0.1" if host == "127.0.0.1" else host
        print()
        print("Visor 3D EDAR listo:")
        print(f"http://{url_host}:{port}/web/")
        print()
        print("Deja esta terminal abierta. Pulsa Ctrl+C para detener el servidor.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor detenido.")
        finally:
            httpd.server_close()
        return 0

    print(f"No hay puertos libres entre {first_port} y {last_port}.")
    if last_error is not None:
        print(f"Ultimo error: {last_error}")
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Sirve el visor 3D EDAR y muestra el enlace directo.")
    parser.add_argument("--port", type=int, default=8000, help="Primer puerto a probar.")
    parser.add_argument("--max-port", type=int, default=8010, help="Ultimo puerto a probar.")
    parser.add_argument("--host", default="127.0.0.1", help="Interfaz de escucha.")
    args = parser.parse_args()

    if args.max_port < args.port:
        parser.error("--max-port debe ser mayor o igual que --port")
    return serve(args.port, args.max_port, args.host)


if __name__ == "__main__":
    raise SystemExit(main())
