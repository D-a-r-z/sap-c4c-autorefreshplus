// ==UserScript==
// @name         SAP C4C - Auto-refresh Plus
// @version      2.26.001
// @description  Autorrefresco y mejoras visuales para tickets en SAP C4C.
// @author       Darz
// @match        https://*.crm.ondemand.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/D-a-r-z/sap-c4c-autorefreshplus/main/sap-c4c-autorefreshplus.user.js
// @downloadURL  https://raw.githubusercontent.com/D-a-r-z/sap-c4c-autorefreshplus/main/sap-c4c-autorefreshplus.user.js
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================================
    // 1. METADATOS Y CONTROL DE VERSIÓN / INSTANCIA ÚNICA
    // =========================================================================
    const SCRIPT_VERSION = '2.26.001';
    const SCRIPT_BUILD   = 2260001; // Representación numérica para comparación secuencial

    if (typeof window.__c4cARInstance !== 'undefined' && window.__c4cARInstance >= SCRIPT_BUILD) {
        return;
    }

    // Cancelar cualquier temporizador, worker u observador previo en la ventana
    if (window.__c4cARTimer) {
        clearInterval(window.__c4cARTimer);
        window.__c4cARTimer = null;
    }
    if (window.__c4cARWorker) {
        try { window.__c4cARWorker.terminate(); } catch (e) {}
        window.__c4cARWorker = null;
    }
    if (window.__c4cARObserver) {
        try { window.__c4cARObserver.disconnect(); } catch (e) {}
        window.__c4cARObserver = null;
    }

    window.__c4cARInstance = SCRIPT_BUILD;

    // =========================================================================
    // 2. CONFIGURACIÓN Y ESTADO GLOBAL
    // =========================================================================
    const STORAGE_KEY_INTERVALO = 'c4c_autorefresh_intervalo';
    const INTERVALO_DEFAULT = 180; // 3 minutos exactamente (180 segundos)
    const INTERVALOS_VALIDOS = [20, 30, 60, 120, 180, 300, 600];

    function obtenerIntervaloInicial() {
        const guardado = localStorage.getItem(STORAGE_KEY_INTERVALO);
        if (!guardado) return INTERVALO_DEFAULT;

        const num = parseInt(guardado, 10);
        return INTERVALOS_VALIDOS.includes(num) ? num : INTERVALO_DEFAULT;
    }

    let intervaloSegundos = obtenerIntervaloInicial();
    let proximoRefresco = Date.now() + (intervaloSegundos * 1000);
    let autoRefreshActivo = true;
    let refrescoEnCurso = false; // Mutex anti-solapamiento de refrescos
    let enTicketPrevio = false;
    let autoPausadoPorTicket = false;

    const ICONO_REFRESH_SVG = `
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style="display: block; margin-right: 4px; flex-shrink: 0;">
            <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
        </svg>
    `;

    // =========================================================================
    // 3. ESTILOS CSS CENTRALIZADOS (UI DEL SCRIPT + AJUSTES VISUALES TABLA)
    // Conserva íntegramente la geometría, anchos y temas nativos de SAP C4C
    // =========================================================================
    function asegurarEstilosCentralizados() {
        // Purgar cualquier estilo residual de versiones o pruebas anteriores
        const testStyle = document.getElementById('test-nivel-style');
        if (testStyle) testStyle.remove();

        let style = document.getElementById('c4c-extension-style');
        if (!style) {
            style = document.createElement('style');
            style.id = 'c4c-extension-style';
            (document.head || document.documentElement).appendChild(style);
        }

        if (style.dataset.version !== SCRIPT_VERSION) {
            style.dataset.version = SCRIPT_VERSION;
            style.textContent = `
                /* -------------------------------------------------------------
                 * 1. CONTENEDOR Y CONTROLES DEL WIDGET (BARRA DE HERRAMIENTAS)
                 * ------------------------------------------------------------- */
                #c4c-toolbar-mas-container {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: flex-start !important;
                    vertical-align: middle !important;
                    user-select: none !important;
                    position: relative !important;
                    margin: 0 6px !important;
                    padding: 0 !important;
                    height: 32px !important;
                    box-sizing: border-box !important;
                    gap: 4px !important;
                }

                .c4c-widget-btn {
                    cursor: pointer !important;
                    padding: 0 !important;
                    margin: 0 2px !important;
                    border: none !important;
                    background: transparent !important;
                    outline: none !important;
                    vertical-align: middle !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    height: 32px !important;
                    box-sizing: border-box !important;
                }

                /* Botón del reloj temporizador (anchura automática horizontal para icono + texto) */
                #c4c-timer-btn {
                    width: auto !important;
                    min-width: 74px !important;
                    height: 32px !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    vertical-align: middle !important;
                    box-sizing: border-box !important;
                }

                #c4c-timer-btn .c4c-widget-inner {
                    width: auto !important;
                    min-width: 74px !important;
                    height: 28px !important;
                    flex-direction: row !important;
                    white-space: nowrap !important;
                    padding: 0 8px !important;
                    box-sizing: border-box !important;
                }

                .c4c-widget-inner {
                    height: 28px !important;
                    min-height: 28px !important;
                    max-height: 28px !important;
                    line-height: 26px !important;
                    border-radius: 4px !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    box-sizing: border-box !important;
                    border: 1px solid #bfbfbf !important;
                    background-color: #ffffff !important;
                    color: #346187 !important;
                    font-variant-numeric: tabular-nums !important;
                    white-space: nowrap !important;
                }

                .c4c-widget-btn:hover .c4c-widget-inner {
                    background-color: #f2f2f2 !important;
                }

                #c4c-timer-num {
                    display: inline-block !important;
                    vertical-align: middle !important;
                    font-size: 11px !important;
                    font-weight: 600 !important;
                    white-space: nowrap !important;
                    margin-left: 2px !important;
                }

                #c4c-mas-select-wrapper {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    height: 32px !important;
                    margin: 0 2px !important;
                    padding: 0 !important;
                    vertical-align: middle !important;
                    box-sizing: border-box !important;
                }

                .c4c-widget-select {
                    cursor: pointer !important;
                    height: 28px !important;
                    min-height: 28px !important;
                    max-height: 28px !important;
                    line-height: 26px !important;
                    border-radius: 4px !important;
                    padding: 0 6px !important;
                    font-size: 11px !important;
                    font-weight: 500 !important;
                    outline: none !important;
                    box-sizing: border-box !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    background-color: #ffffff !important;
                    color: #346187 !important;
                    border: 1px solid #bfbfbf !important;
                }

                #c4c-mas-btn-pause,
                #c4c-mas-btn-refresh {
                    width: 34px !important;
                    height: 32px !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    box-sizing: border-box !important;
                }

                #c4c-mas-btn-pause .c4c-widget-inner,
                #c4c-mas-btn-refresh .c4c-widget-inner {
                    width: 32px !important;
                    min-width: 32px !important;
                    max-width: 32px !important;
                    height: 28px !important;
                    padding: 0 !important;
                    box-sizing: border-box !important;
                }

                /* -------------------------------------------------------------
                 * 2. BADGES DE PRIORIDAD (.box-text / [class*="boxcolor-"])
                 * Anchura unificada de 78px conservando colores nativos
                 * ------------------------------------------------------------- */
                .box-text,
                [class*="boxcolor-"] {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    width: 78px !important;
                    min-width: 78px !important;
                    max-width: 78px !important;
                    text-align: center !important;
                    box-sizing: border-box !important;
                }

                .sapClientBaseControlsCoreOberonComposite:has(> .box-text),
                .sapClientBaseControlsCoreOberonComposite:has(> [class*="boxcolor-"]) {
                    display: flex !important;
                    justify-content: center !important;
                    padding: 0 !important;
                }

                /* -------------------------------------------------------------
                 * 3. COLUMNA NIVEL (Processing priority -> Nivel)
                 * ÚNICAMENTE centrado visual del contenido de texto
                 * CERO control de anchos: ni width, min-width, max-width, flex ni padding
                 * ------------------------------------------------------------- */
                th.c4c-col-nivel {
                    text-align: center !important;
                }

                th.c4c-col-nivel .sapMLabel,
                th.c4c-col-nivel bdi {
                    text-align: center !important;
                }

                td.c4c-col-nivel {
                    text-align: center !important;
                }

                td.c4c-col-nivel .sapClientBaseControlsCoreOberonComposite {
                    justify-content: center !important;
                }

                td.c4c-col-nivel .sapMText {
                    text-align: center !important;
                }
            `;
        }
    }

    // =========================================================================
    // 4. DETECCIÓN Y AJUSTES VISUALES DE TABLA (NIVEL Y BADGES)
    // =========================================================================

    /**
     * Localiza la columna "Processing priority" por su identidad real en el DOM de SAP
     * (UUID estable data-column-id="48c36193756d68d0ebfe9bd069f6572e-column")
     * Renombra el texto visible a "Nivel" y aplica centrado visual sin tocar anchos ni layout.
     */
    function normalizarColumnaNivel() {
        // 1. Localización por identificador persistente del modelo SAP UI5 (o fallback a texto)
        const nivelTh = document.querySelector('th[data-column-id*="48c36193756d68d0ebfe9bd069f6572e"], th[data-sap-automation-id*="48c36193756d68d0ebfe9bd069f6572e"]') ||
            Array.from(document.querySelectorAll('th, .sapMColumnHeader, .sapMTableTH')).find(th => {
                const txt = (th.textContent || '').trim().toLowerCase();
                return txt === 'nivel' || txt.includes('processing priority') || txt.includes('prioridad de procesamiento');
            });

        if (!nivelTh) return;

        const thElement = nivelTh.closest('th') || nivelTh;

        // 2. Renombrar texto visible a "Nivel" si muestra el nombre en inglés
        const bdi = thElement.querySelector('bdi') || thElement.querySelector('.sapMText') || thElement.querySelector('.sapMLabel') || thElement;
        if (bdi && bdi.textContent.trim() !== 'Nivel') {
            bdi.textContent = 'Nivel';
        }

        if (!thElement.classList.contains('c4c-col-nivel')) {
            thElement.classList.add('c4c-col-nivel');
        }

        // 3. Localizar las celdas TD vinculadas exactamente a este TH por headers o data-sap-ui-column (asociación nativa W3C / UI5)
        const thId = thElement.id;
        let tdCells = [];
        if (thId) {
            tdCells = Array.from(document.querySelectorAll(`td[headers~="${thId}"], td[data-sap-ui-column="${thId}"]`));
        }

        // Fallback semántico si la tabla está en mitad de un re-renderizado
        if (tdCells.length === 0) {
            const spans = document.querySelectorAll('span.sapMText[title*="Processing priority"], span.sapMText[title*="prioridad de procesamiento"]');
            tdCells = Array.from(spans).map(s => s.closest('td')).filter(Boolean);
        }

        // 4. Aplicar clase de centrado exclusivamente a las celdas pertenecientes a Nivel
        tdCells.forEach(td => {
            if (!td.classList.contains('c4c-col-nivel')) {
                td.classList.add('c4c-col-nivel');
            }
        });

        // 5. Limpieza de seguridad: garantizar que ninguna otra columna conserve la clase
        document.querySelectorAll('th.c4c-col-nivel').forEach(th => {
            if (th !== thElement) th.classList.remove('c4c-col-nivel');
        });
        document.querySelectorAll('td.c4c-col-nivel').forEach(td => {
            if (!tdCells.includes(td)) td.classList.remove('c4c-col-nivel');
        });
    }

    /**
     * Asegura la uniformidad de 78px en badges de prioridad conservando el tema SAP
     */
    function normalizarBadgesPrioridad() {
        const boxEls = document.querySelectorAll('.box-text, [class*="boxcolor-"]');
        boxEls.forEach(el => {
            if (el.style.width !== '78px') {
                el.style.setProperty('width', '78px', 'important');
                el.style.setProperty('min-width', '78px', 'important');
                el.style.setProperty('max-width', '78px', 'important');
                el.style.setProperty('display', 'inline-flex', 'important');
                el.style.setProperty('justify-content', 'center', 'important');
                el.style.setProperty('align-items', 'center', 'important');
                el.style.setProperty('text-align', 'center', 'important');
                el.style.setProperty('box-sizing', 'border-box', 'important');
            }
        });
    }

    // =========================================================================
    // 5. LOCALIZACIÓN DE ELEMENTOS DEL DOM DE SAP C4C (TOOLBARS Y ACCIONES)
    // =========================================================================

    function obtenerBarraHerramientas() {
        // En cabecera de ticket (vista de detalle o modificación)
        const ticketToolbar = document.querySelector('.sapClientMODHRightIcons [role="toolbar"], .sapClientMODHRightIcons .sapMTB, .sapClientMODHeader [role="toolbar"], .sapClientMODHeader .sapMTB');
        if (ticketToolbar && (ticketToolbar.offsetWidth > 0 || ticketToolbar.offsetHeight > 0)) {
            return ticketToolbar;
        }

        // En vista general de lista de tickets
        return document.querySelector('.sapClientMALPToolbarRow') ||
               document.querySelector('#mainShell-container-canvas .sapClientMALPToolbar') ||
               document.querySelector('#mainShell-container-canvas [role="toolbar"]');
    }

    function obtenerAnclaToolbar(toolbar) {
        if (!toolbar) return null;

        // En la cabecera del ticket: anclar antes del primer botón de acción SAP ([✏️] o [💾])
        const esCabeceraTicket = toolbar.closest('.sapClientMODHeader, .sapClientMODHRightIcons, .sapClientExpandEmbedPaneHeaderToolbarClass');
        if (esCabeceraTicket) {
            const botonesSAP = Array.from(toolbar.querySelectorAll('button, .sapMBtn')).filter(b => !b.closest('#c4c-toolbar-mas-container'));
            if (botonesSAP.length > 0) {
                return botonesSAP[0];
            }
        }

        // En el listado general de tickets: anclar antes del botón "Más"
        let mas = toolbar.querySelector('.sapMClientNewUIQVOverflowButton, [id*="actionbuttonmenu"]');
        if (!mas) {
            const botones = Array.from(toolbar.querySelectorAll('button, .sapMBtn')).filter(b => b.id !== 'c4c-timer-btn' && !b.id.startsWith('c4c-'));
            mas = botones.find(b => {
                const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
                return txt === 'más' || txt === 'mas';
            });
        }
        if (mas) return mas;

        const botones = Array.from(toolbar.querySelectorAll('button, .sapMBtn')).filter(b => b.id !== 'c4c-timer-btn' && !b.id.startsWith('c4c-'));
        return botones.length > 0 ? botones[botones.length - 1] : null;
    }

    function obtenerBotonActualizar() {
        // 1. Buscar en menús desplegables / popups activos
        const popups = Array.from(document.querySelectorAll('.sapMPopover, .sapMActionSheet, [role="menu"], [role="dialog"]'));
        for (const popup of popups) {
            const items = Array.from(popup.querySelectorAll('bdi, span, button, a, li'));
            const el = items.find(b => {
                const texto = (b.textContent || '').replace(/\(.*?\)/g, '').trim().toLowerCase();
                return (texto === 'actualizar' || texto === 'refresh') && !texto.includes('ows');
            });
            if (el) {
                const boton = el.closest('button, [role="button"], .sapMBtn, [role="menuitem"], li') || el.parentElement;
                return { bdi: el, boton };
            }
        }

        // 2. Buscar en la barra de herramientas activa
        const toolbar = obtenerBarraHerramientas();
        if (toolbar) {
            const items = Array.from(toolbar.querySelectorAll('bdi, span, button, a'));
            const el = items.find(b => {
                const texto = (b.textContent || '').replace(/\(.*?\)/g, '').trim().toLowerCase();
                return (texto === 'actualizar' || texto === 'refresh') && !texto.includes('ows');
            });
            if (el) {
                const boton = el.closest('button, [role="button"], .sapMBtn, li') || el.parentElement;
                return { bdi: el, boton };
            }
        }

        return null;
    }

    // =========================================================================
    // 6. MOTOR DE AUTORREFRESCO (DISPARADOR Y SALVAGUARDAS)
    // =========================================================================

    function dispararClickNativo(elemento) {
        if (!elemento) return;
        ['mousedown', 'mouseup', 'click'].forEach(tipo => {
            elemento.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, view: window }));
        });
    }

    function ejecutarRefresco() {
        if (refrescoEnCurso) return;
        refrescoEnCurso = true;

        // Reiniciar inmediatamente el reloj para evitar llamadas dobles
        proximoRefresco = Date.now() + (intervaloSegundos * 1000);
        actualizarTemporizador();

        const contexto = obtenerBotonActualizar();

        if (contexto && contexto.boton) {
            [contexto.boton, contexto.bdi].forEach(el => {
                if (el) dispararClickNativo(el);
            });
            setTimeout(() => {
                refrescoEnCurso = false;
            }, 1200);
        } else {
            // Si el botón está dentro del menú "Más", abrir silenciosamente el menú, ejecutar y cerrar
            const toolbar = obtenerBarraHerramientas();
            const anclaMas = toolbar ? (toolbar.querySelector('.sapMClientNewUIQVOverflowButton, [id*="actionbuttonmenu"]') ||
                                       Array.from(toolbar.querySelectorAll('button, .sapMBtn')).find(b => {
                                           const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
                                           return txt === 'más' || txt === 'mas';
                                       })) : null;
            if (anclaMas) {
                const ocultarMenuTag = document.createElement('style');
                ocultarMenuTag.id = 'c4c-silent-menu-hide';
                ocultarMenuTag.textContent = '.sapMPopover, .sapMActionSheet { opacity: 0 !important; pointer-events: none !important; }';
                document.head.appendChild(ocultarMenuTag);

                dispararClickNativo(anclaMas);

                // Reintentos con intervalos cortos para dar tiempo a que SAP monte el menú en el DOM
                let intentos = 0;
                const checkMenu = setInterval(() => {
                    intentos++;
                    const ctx = obtenerBotonActualizar();
                    if (ctx && ctx.boton) {
                        clearInterval(checkMenu);
                        [ctx.boton, ctx.bdi].forEach(el => {
                            if (el) dispararClickNativo(el);
                        });
                        setTimeout(() => {
                            document.getElementById('c4c-silent-menu-hide')?.remove();
                            refrescoEnCurso = false;
                        }, 80);
                    } else if (intentos >= 6) {
                        clearInterval(checkMenu);
                        document.getElementById('c4c-silent-menu-hide')?.remove();
                        refrescoEnCurso = false;
                    }
                }, 50);
            } else {
                refrescoEnCurso = false;
            }
        }
    }

    function estaEnVistaDetalleTicket() {
        const ticketHeader = document.querySelector('.sapClientMOD, .sapClientMODHeader, .sapClientMODFacetContentObjectHeader, .sapClientExpandEmbedPaneHeaderToolbarClass');
        if (!ticketHeader) return false;
        return ticketHeader.offsetWidth > 0 || ticketHeader.offsetHeight > 0;
    }

    // =========================================================================
    // 7. COMPONENTE DE INTERFAZ (WIDGET DE CONTROL NATIVO)
    // =========================================================================

    function integrarWidget() {
        const toolbar = obtenerBarraHerramientas();
        if (!toolbar) return;

        let contenedor = document.getElementById('c4c-toolbar-mas-container');

        if (contenedor && toolbar.contains(contenedor)) {
            const ancla = obtenerAnclaToolbar(toolbar);
            if (ancla && contenedor.nextElementSibling !== ancla) {
                ancla.insertAdjacentElement('beforebegin', contenedor);
            }
            return;
        }

        // Eliminar posibles instancias huérfanas
        document.querySelectorAll('#c4c-toolbar-mas-container').forEach(el => el.remove());

        contenedor = document.createElement('div');
        contenedor.id = 'c4c-toolbar-mas-container';

        contenedor.innerHTML = `
            <!-- Botón Reloj / Forzar Refresco -->
            <button id="c4c-timer-btn" class="sapMBtnBase sapMBtn sapMBarChild c4c-widget-btn" title="Clic para refrescar ahora">
                <span class="sapMBtnInner sapMBtnHoverable sapMBtnDefault c4c-widget-inner">
                    ${ICONO_REFRESH_SVG}
                    <bdi id="c4c-timer-num">
                        3m 00s
                    </bdi>
                </span>
            </button>

            <!-- Selector de Intervalo (Predeterminado: 3m) -->
            <div id="c4c-mas-select-wrapper">
                <select id="c4c-mas-select" class="c4c-widget-select">
                    <option value="20">20s</option>
                    <option value="30">30s</option>
                    <option value="60">1m</option>
                    <option value="120">2m</option>
                    <option value="180">3m</option>
                    <option value="300">5m</option>
                    <option value="600">10m</option>
                </select>
            </div>

            <!-- Botón Pausa / Reanudar -->
            <button id="c4c-mas-btn-pause" class="sapMBtnBase sapMBtn width-button-form sapMBarChild c4c-widget-btn" title="Pausar / Reanudar autorefresco">
                <span class="sapMBtnInner sapMBtnHoverable sapMBtnDefault c4c-widget-inner">
                    <bdi id="c4c-pause-icon" style="font-size: 12px;">⏸</bdi>
                </span>
            </button>

            <!-- Botón Refresco Manual Inmediato -->
            <button id="c4c-mas-btn-refresh" class="sapMBtnBase sapMBtn width-button-form sapMBarChild c4c-widget-btn" title="Forzar actualización ahora">
                <span class="sapMBtnInner sapMBtnHoverable sapMBtnDefault c4c-widget-inner">
                    <bdi style="font-size: 13px; font-weight: bold;">&#8635;</bdi>
                </span>
            </button>
        `;

        // Vinculación de eventos
        const selectEl = contenedor.querySelector('#c4c-mas-select');
        selectEl.value = String(intervaloSegundos);
        selectEl.addEventListener('change', (e) => {
            const val = parseInt(e.target.value, 10);
            if (INTERVALOS_VALIDOS.includes(val)) {
                intervaloSegundos = val;
                localStorage.setItem(STORAGE_KEY_INTERVALO, String(intervaloSegundos));
            } else {
                intervaloSegundos = INTERVALO_DEFAULT;
            }
            proximoRefresco = Date.now() + (intervaloSegundos * 1000);
            actualizarTemporizador();
        });

        const btnPause = contenedor.querySelector('#c4c-mas-btn-pause');
        btnPause.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            autoRefreshActivo = !autoRefreshActivo;
            if (autoRefreshActivo) {
                proximoRefresco = Date.now() + (intervaloSegundos * 1000);
            }
            actualizarTemporizador();
        });

        const btnRefresh = contenedor.querySelector('#c4c-mas-btn-refresh');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                ejecutarRefresco();
            });
        }

        const timerBtn = contenedor.querySelector('#c4c-timer-btn');
        if (timerBtn) {
            timerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                ejecutarRefresco();
            });
        }

        const ancla = obtenerAnclaToolbar(toolbar);
        if (ancla) {
            ancla.insertAdjacentElement('beforebegin', contenedor);
        } else {
            toolbar.appendChild(contenedor);
        }
    }

    function actualizarTemporizador() {
        const timerNum = document.getElementById('c4c-timer-num');
        const pauseIcon = document.getElementById('c4c-pause-icon');
        const btnPause = document.getElementById('c4c-mas-btn-pause');

        const restanteMs = Math.max(0, proximoRefresco - Date.now());
        const segundosRestantes = Math.ceil(restanteMs / 1000);

        const mins = Math.floor(segundosRestantes / 60);
        const secs = segundosRestantes % 60;
        const textoTiempo = mins > 0 ? `${mins}m ${secs < 10 ? '0' : ''}${secs}s` : `${secs}s`;

        if (!autoRefreshActivo) {
            if (timerNum) {
                timerNum.textContent = 'Pausado';
                timerNum.style.color = '#c93b2b';
            }
            if (pauseIcon) {
                pauseIcon.textContent = '▶';
            }
            if (btnPause) {
                btnPause.title = 'Reanudar autorefresco';
            }
        } else {
            if (timerNum) {
                timerNum.textContent = textoTiempo;
                timerNum.style.color = '#346187';
            }
            if (pauseIcon) {
                pauseIcon.textContent = '⏸';
            }
            if (btnPause) {
                btnPause.title = 'Pausar autorefresco';
            }
        }
    }

    // =========================================================================
    // 8. BUCLE PRINCIPAL DE CONTROL (TICK POR SEGUNDO Y DETECCIÓN DE ESTADO)
    // =========================================================================

    function procesarTick() {
        asegurarEstilosCentralizados();
        integrarWidget();
        normalizarColumnaNivel();
        normalizarBadgesPrioridad();

        // Auto-pausa al entrar en un ticket (vista de detalle o modificación)
        const enTicket = estaEnVistaDetalleTicket();
        if (enTicket && !enTicketPrevio) {
            if (autoRefreshActivo) {
                autoRefreshActivo = false;
                autoPausadoPorTicket = true;
                actualizarTemporizador();
            }
        } else if (!enTicket && enTicketPrevio) {
            if (autoPausadoPorTicket) {
                autoRefreshActivo = true;
                autoPausadoPorTicket = false;
                proximoRefresco = Date.now() + (intervaloSegundos * 1000);
                actualizarTemporizador();
            }
        }
        enTicketPrevio = enTicket;

        // Si estamos dentro de un ticket, NUNCA refrescar automáticamente
        if (enTicket) {
            if (autoRefreshActivo && autoPausadoPorTicket) {
                autoRefreshActivo = false;
            }
            actualizarTemporizador();
            return;
        }

        if (!autoRefreshActivo) {
            actualizarTemporizador();
            return;
        }

        // Salvaguarda: no interrumpir si el usuario escribe o hay un modal abierto
        const activo = document.activeElement;
        const escribiendo = activo && (activo.tagName === 'INPUT' || activo.tagName === 'TEXTAREA' || activo.isContentEditable);
        const modalAbierto = !!document.querySelector('.sapMDialog:not([style*="display: none"]), .sapMMessageBox');

        if (escribiendo || modalAbierto) {
            proximoRefresco = Date.now() + 20000;
            return;
        }

        actualizarTemporizador();

        if (Date.now() >= proximoRefresco) {
            ejecutarRefresco();
        }
    }

    // =========================================================================
    // 9. INICIALIZACIÓN, MUTATIONOBSERVER Y RELOJ EN BACKGROUND (WEB WORKER)
    // =========================================================================

    let observerIniciado = false;
    let observerTimeout = null;

    const observer = new MutationObserver(() => {
        if (!document.getElementById('c4c-toolbar-mas-container')) {
            if (!observerTimeout) {
                observerTimeout = setTimeout(() => {
                    observerTimeout = null;
                    integrarWidget();
                }, 250);
            }
        }
    });
    window.__c4cARObserver = observer;

    function iniciarObserver() {
        if (observerIniciado) return;
        const root = document.getElementById('mainShell-container-canvas') || document.body;
        if (root) {
            observer.observe(root, { childList: true });
            observerIniciado = true;
        }
    }

    // Inicio seguro según estado del documento
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            procesarTick();
            iniciarObserver();
        });
    } else {
        procesarTick();
        iniciarObserver();
    }

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            procesarTick();
        }
    });

    // Motor de reloj en background inmune a throttling de pestañas inactivas
    try {
        const blobWorker = new Blob([`setInterval(() => postMessage('tick'), 1000);`], { type: 'application/javascript' });
        window.__c4cARWorker = new Worker(URL.createObjectURL(blobWorker));
        window.__c4cARWorker.onmessage = () => procesarTick();
    } catch (e) {
        window.__c4cARTimer = setInterval(procesarTick, 1000);
    }

})();
