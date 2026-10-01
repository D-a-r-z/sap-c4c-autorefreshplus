# SAP C4C - Auto-refresh Plus

Script para Tampermonkey que añade autorrefresco y ajustes visuales en la vista de tickets de SAP Cloud for Customer (C4C).

## Funciones principales

- Autorrefresco configurable: añade un temporizador y controles en la barra superior (cuenta atrás, selector de tiempo, botón de pausa y refresco manual).
- Pausa automática: el contador se pausa de forma automática al entrar al detalle de un ticket o al escribir en un campo, para no perder cambios ni cerrar pantallas.
- Badges de prioridad uniformes: iguala el ancho de las etiquetas de prioridad para que mantengan un diseño consistente.
- Columna Nivel: renombra la columna de prioridad de procesamiento a "Nivel" y centra su texto, permitiendo ajustar su tamaño de forma nativa como cualquier otra columna.

## Instalación

1. Abre la extensión Tampermonkey en el navegador.
2. Crea un nuevo script.
3. Copia el contenido de `sap-c4c-autorefreshplus.user.js` y pégalo en el editor.
4. Guarda los cambios (Ctrl + S).
5. Recarga la pantalla de tickets en SAP C4C (F5).
