# Cómo funciona dsh-plugin-csv-cleaner

Limpia y perfila CSV locales: quita filas vacias, duplicados, espacios, normaliza encabezados y reporta cambios, con vista previa y guardado confirmado.

## Arquitectura

```
DSH ──MCP stdio──► server.mjs (bundle single-file)
                    └─ lógica local del plugin
```

## Herramientas reales

- `status`: Estado
- `profile`: Perfilar CSV
- `clean`: Limpiar CSV

## Seguridad

- Lectura por defecto; acciones con `confirm:true`.
- Modo `read-only` por variable de entorno.
- Listas blancas cuando aplique.
- Auditoría en `<DSH_HOME>\cache\csv-cleaner\audit.jsonl`.
- Rate limit de acciones.

## Verificación

Tests end-to-end con el cliente MCP oficial (`@modelcontextprotocol/client@2.2.0`)
y artefacto empaquetado (`npm pack` → `postinstall` → servidor desplegado).
