# Activar el modo online de Rutero (empresas, dinero compartido y ranking)

Rutero guarda las empresas, las carteras y los rankings en **Firebase** (de Google), que es gratis
para este uso. Solo lo configuras tú una vez, como creador de la app; tus jugadores no tienen que hacer nada.

## 1. Crear el proyecto
1. Entra en https://console.firebase.google.com con tu cuenta de Google.
2. **Crear un proyecto** → nombre `rutero` → puedes desactivar Google Analytics → Crear.

## 2. Activar las cuentas
1. Menú izquierdo → **Compilación → Authentication** → **Comenzar**.
2. Pestaña **Método de acceso** → **Correo electrónico/contraseña** → Activar → Guardar.

## 3. Crear la base de datos
1. Menú izquierdo → **Compilación → Firestore Database** → **Crear base de datos**.
2. Ubicación: `eur3 (europe-west)` → **Iniciar en modo de producción** → Crear.
3. Pestaña **Reglas**: borra todo, pega el contenido de `config/firestore.rules` y pulsa **Publicar**.

## 4. Copiar las claves a Rutero
1. Rueda dentada (arriba a la izquierda) → **Configuración del proyecto**.
2. En "Tus apps" pulsa el icono **</>** (Web) → nombre `rutero` → Registrar app.
3. Copia `apiKey` y `projectId` y pégalos en `config/cloud.json` (o abre `0-PONER-CLAVE-ONLINE.bat` y pégala ahí):

```json
{
  "apiKey": "AIzaSy...",
  "projectId": "rutero-12345"
}
```

4. Vuelve a crear el instalador con `2-CREAR-INSTALADOR.bat`. ¡Listo!

> La `apiKey` de Firebase no es secreta: lo que protege los datos son las reglas del paso 3.
> El plan gratuito aguanta de sobra cientos de conductores al día.
