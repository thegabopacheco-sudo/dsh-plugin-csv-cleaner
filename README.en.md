# dsh-plugin-csv-cleaner — CSV Cleaner

Limpia y perfila CSV locales: quita filas vacias, duplicados, espacios, normaliza encabezados y reporta cambios, con vista previa y guardado confirmado.

## Tools

| Tool | Qué hace |
|---|---|
| `status` | Estado |
| `profile` | Perfilar CSV |
| `clean` | Limpiar CSV |

## Instalación

Desde **DSH → Settings → Plugins** instala `github:thegabopacheco-sudo/dsh-plugin-csv-cleaner` y permite el script de instalación.

```
dsh plugin --profile <perfil> add github:thegabopacheco-sudo/dsh-plugin-csv-cleaner
```

## Seguridad

- Lectura por defecto; escritura solo con `confirm:true` y pedido explícito.
- `DSH_CSV_CLEANER_MODE=read-only` desactiva acciones.
- Listas blancas y auditoría en `<DSH_HOME>\cache\csv-cleaner\audit.jsonl`.

## Licencia

MIT © thegabopacheco-sudo
