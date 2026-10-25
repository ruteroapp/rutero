# Rutero

## Publicar una versión
- Sube `version` en `package.json` y haz push a `main`: el flujo `.github/workflows/publicar.yml` crea el instalador y la versión en GitHub.
- Título del commit: `Rutero X.Y.Z: resumen`. El cuerpo del commit son las notas de la versión, y el bot de Discord las anuncia.
- Las notas llevan siempre las dos partes, español primero y después una línea `EN:` con la parte en inglés (si falta, el canal inglés solo muestra el texto genérico):

```
- Novedad en español.

EN:
- Change in English.
```
