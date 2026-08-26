# Print Server

Servidor de impresión para tickets de pedido. Acepta `POST /print` con el texto ESC/POS y lo envía a la impresora real (CUPS en Linux, win32print en Windows, o TCP para impresoras de red).

## Archivos

| Archivo | Descripción |
|---|---|
| `print_server.py` | Servidor real — imprime en la impresora física |
| `mock_print_server.py` | Mock para desarrollo — solo loguea el ticket en stdout |

---

## Uso en desarrollo

El mock se levanta automáticamente con el compose de dev:

```bash
docker compose -f docker-compose.dev.yml up
```

La API apunta automáticamente a `http://print_server_mock:5001/print` (configurado en el compose). No hace falta tocar el `.env`.

Para ver los tickets en tiempo real:

```bash
docker compose -f docker-compose.dev.yml logs -f print_server_mock
```

Cada impresión desde el panel web o desde n8n aparece en la consola con el texto completo del ticket.

---

## Endpoint

```
POST /print
Headers: X-Printer-Token: <token>
```

Body JSON:

```json
{
  "text": "PEDIDO\n...",
  "printer_name": "Hasar_USB",
  "cut": true,
  "text_size": "double_width"
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `text` | string | Texto del ticket (encoding latin1) |
| `printer_name` | string | Nombre de impresora CUPS/Windows |
| `ip` | string | IP si la impresora es de red (TCP) |
| `port` | number | Puerto TCP (default 9100) |
| `cut` | boolean | Cortar papel al final |
| `text_size` | string | `normal`, `double_width`, `double_height`, `double`, `triple`, `quad` |

### Respuesta exitosa

```json
{ "status": "printed", "method": "cups", "printer": "Hasar_USB" }
```

### Respuesta del mock

```json
{ "ok": true, "status": "mock" }
```

---

## Variables de entorno

| Variable | Descripción | Default |
|---|---|---|
| `PORT` | Puerto del servidor | `5001` |
| `PRINT_SERVER_TOKEN` | Token de autenticación (`X-Printer-Token`) | `""` (sin validación en mock) |
| `DEFAULT_PRINTER` | Impresora por defecto si no se pasa `printer_name` | — |
