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

## Idiomas
- Todo lo que se ve en la app tiene que estar traducido a los 7 idiomas (es, en, fr, de, it, pt, pl). La app se escribe en español y se traduce sola en pantalla con `src/renderer/i18n-data.txt`.
- Cada texto nuevo (pantallas, botones, avisos, errores, placeholders) se añade a `i18n-data.txt` con sus 7 columnas y se regenera `i18n.js` con `python3 tools/build-i18n.py`.
- Los números se escriben como `#` en la clave. Los nombres que pone el usuario van en un `<span translate="no">` aparte para que el texto de alrededor se pueda traducir.
