# How dsh-plugin-csv-cleaner works

Limpia y perfila CSV locales: quita filas vacias, duplicados, espacios, normaliza encabezados y reporta cambios, con vista previa y guardado confirmado.

## Architecture

```
DSH ──MCP stdio──► server.mjs (single-file bundle)
                    └─ local plugin logic
```

## Safety

- Read by default; actions require `confirm:true`.
- `read-only` mode via environment variable.
- Allowlists where applicable.
- Audit at `<DSH_HOME>\cache\csv-cleaner\audit.jsonl`.
- Action rate limit.

## Validation

End-to-end tests with the official MCP client (`@modelcontextprotocol/client@2.2.0`)
and the packaged artifact (`npm pack` → `postinstall` → deployed server).
