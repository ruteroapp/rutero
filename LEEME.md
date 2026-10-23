# Rutero 🚚

Compañero de ruta para **Euro Truck Simulator 2** y **American Truck Simulator**, conectado con **TruckersMP**.

## Qué hace
- **Panel en directo**: velocímetro, límite, marcha, crucero, luces, combustible, AdBlue, hora del juego, descanso y desgaste.
- **Registro automático de trabajos** con **estadísticas de cada viaje**: gráfica de velocidad, velocidad media y máxima, duración, combustible, tiempo con crucero, exceso de velocidad, daños, dinero desglosado (pago, comisión, sueldo, multas) y gastos del viaje.
- **Multas**: cada multa queda registrada con la infracción, velocidad, límite, carga y ruta. Página propia con totales y tipos, y la empresa ve las multas de todos sus conductores.
- **Empresas**: fundar con logo, color y descripción; unirse con código o enviando una solicitud; la empresa recibe **300.000 por cada conductor que entra** (y 300.000 de capital inicial).
- **Conductores de la empresa**: lo que ha ganado cada uno, lo que ha aportado, sueldos cobrados, multas; ficha con sus viajes.
- **Sueldos**: el fundador o los gerentes ponen un sueldo por km y/o fijo por entrega, que se paga solo desde el banco.
- **Banco y cuentas**: banco principal + cuentas propias (salarios, flota, ahorro…), mover dinero entre cuentas, pagar a conductores, ingresos de los miembros, historial de movimientos.
- **Cartera personal** y **envío de dinero** entre conductores.
- **Concesionario por marca y modelo** (como en el juego): 13 marcas de camión con sus versiones (Scania R 2009 / Streamline / R 2016 / S / BEV, Volvo FH3 / FH4 / FH 2021 / FH Electric, DAF XF 105 / Euro 6 / 2021 / XG+ / XD, MAN TGX, Mercedes Actros MP3 / 2014 / 2019, Renault Magnum / Premium / T / E-Tech, Iveco Stralis / Hi-Way / S-Way, y las americanas de ATS) y 8 marcas de autobús. Cada modelo muestra una **foto real** con licencia libre de Wikimedia Commons (prefiere las de color blanco) con el crédito del autor. Para usar fotos tuyas (por ejemplo, camiones recortados con fondo transparente), ponlas en `config/fotos/` con el id del modelo (`scania-s2016.png`). Remolques llevan ilustraciones propias.
- **Fotos**: foto de perfil y logo de empresa editables.
- **Ranking** de conductores y empresas (semana / total; distancia, dinero, entregas), con fotos.
- **Modo autobús**, **niveles, logros y retos diarios**, **overlay** en el juego (Ctrl + Mayús + K).
- **TruckersMP**: servidores, perfil y bans, eventos, buscador de VTC y detección de partida online.

### Panel de empresa (menú lateral propio)
- **Compañía**: tablero de mandos (saldo, km, entregas, flota, próximo evento, top conductores, noticias) y ajustes (logo, descripción, color, comisión, Discord, web, código de invitación).
- **Miembros**: lista con lo que gana y aporta cada uno; **roles** personalizados (Jefe de tráfico, Instructor…), **etiquetas** (Convoy, Bus…), **rangos** automáticos por kilómetros y **solicitudes** de ingreso.
- **Trabajos**: todas las entregas de la empresa (filtro por conductor), estadísticas de 30 días y multas.
- **Flota y finanzas**: saldo y cuentas, **garajes** por ciudad (dan plazas), **flota** (asignar, aparcar, vender), **concesionario** por marca y modelo, y **mantenimiento** (los vehículos se desgastan con los km y se reparan en el taller).
- **Eventos**: calendario mensual y convoyes con apuntarse / desapuntarse.
- **Contenido**: noticias con imagen y fijadas.

## Cómo usarlo
1. `1-PROBAR-RUTERO.bat` → abre la app para probarla (instala Node.js si hace falta).
2. `2-CREAR-INSTALADOR.bat` → genera `dist/Rutero-Setup-1.0.0.exe` para repartir.
3. En la app: **Ajustes → Instalar plugin** (con el juego cerrado). Después abre el juego.
4. Para empresas y ranking online: sigue `docs/ONLINE.md` (una sola vez).
5. Para que la app se actualice sola con un botón: sigue `docs/ACTUALIZACIONES.md` y publica con `3-PUBLICAR-ACTUALIZACION.bat`.

## Estructura
- `src/main` — lectura de telemetría, detección de trabajos, economía, TruckersMP, online.
- `src/renderer` — interfaz y overlay.
- `config/cloud.json` — clave de Firebase (créala con `0-PONER-CLAVE-ONLINE.bat`; hay un ejemplo en `cloud.example.json`). `config/firestore.rules` — reglas de seguridad.
- `plugin/` — opcional: pon aquí `scs-telemetry.dll` para incluirlo en el instalador.

La telemetría usa el plugin libre scs-sdk-plugin de RenCloud (licencia MIT).
