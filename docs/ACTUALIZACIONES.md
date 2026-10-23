# Actualizaciones automáticas de Rutero

Con esto, tú y tus jugadores ya no tenéis que descargar Rutero entero cada vez:
la app avisa sola ("⬆️ Versión X disponible" arriba) y en **Ajustes → Actualizaciones**
se descarga e instala con un botón, sin perder datos.

## Preparación (una sola vez)
1. Crea un repositorio en GitHub llamado **rutero** (puede ir en tu organización, como hiciste con rosimpanel).
   Puede ser público; no hace falta subir el código, solo se usan las *Releases*.
2. (Ya hecho) En `package.json` está puesta la organización `ruteroapp`.
3. Crea un token: GitHub → Settings → Developer settings → Personal access tokens → *Tokens (classic)* →
   Generate new token → marca **repo** → copia el token (empieza por `ghp_`). No se lo pases a nadie.

## Publicar una versión nueva
1. Haz los cambios en la app.
2. Abre `3-PUBLICAR-ACTUALIZACION.bat`, escribe la versión nueva (por ejemplo `1.0.1`) y pega tu token.
3. Espera a que termine: se crea la Release en GitHub con el instalador.
4. Todos los que tengan Rutero instalado verán el aviso y lo actualizan con un clic.

> La primera vez, tus jugadores necesitan instalar una versión que ya tenga esto (la 1.0.0 nueva).
> A partir de ahí, todo se actualiza desde la propia app.
