# Mensajes de CustomAlert

Catálogo de lo que ve el usuario en las alertas.  
Pensado para gente del club (no técnica).

**Cómo se muestran los títulos:** en el código a veces dice `Error` / `Éxito` / `Atención`, pero en pantalla se ven como **No se pudo completar** / **Listo** / **Un momento**.  
Botones por defecto: **Entendido** / **Volver**.

Si algo sale mal y el club manda un aviso propio, se muestra ese texto corto. Si no, se usa el mensaje de esta lista.

---

## Entrada a la app

### Buscar club (`WorkspaceSearchScreen`)
| Título | Mensaje | Para qué |
|---|---|---|
| Un momento | Ingresá el código de tu club para continuar. | El campo del código está vacío. |
| No se pudo ingresar | Revisá el código del club e intentá de nuevo. | Código incorrecto o club no encontrado. |
| No se pudo ingresar | No hay conexión ahora. Revisá tu internet e intentá otra vez. | Sin internet. |
| No se pudo ingresar | Está tardando más de lo normal. Probá de nuevo en un momento. | La búsqueda tardó demasiado. |

### Login (`LoginScreen`)
| Título | Mensaje | Para qué |
|---|---|---|
| Un momento | Completá tu email y contraseña para entrar. | Faltan email o contraseña. |
| No se pudo completar | No pudimos iniciar la sesión. Probá de nuevo en un momento. | Algo falló al entrar. |
| No pudimos entrar | Revisá tu conexión e intentá de nuevo. | Credenciales o red. (A veces el club manda un aviso más específico.) |

### Editar perfil (`EditProfileScreen`)
| Título | Mensaje | Para qué |
|---|---|---|
| No se pudo completar | No se pudo cargar tu perfil. | Falló la carga. |
| Un momento | Nombre y apellido son obligatorios. | Validación. |
| Fecha | Usá el formato DD-MM-AAAA para la fecha de nacimiento. | Fecha mal escrita. |
| Contraseña | La contraseña debe tener al menos 6 caracteres. | Password corta. |
| Contraseña | Las contraseñas no coinciden. | Confirmación distinta. |
| Listo | Tus datos quedaron actualizados. | Guardado OK. |
| No se pudo completar | No se pudo guardar. | Falló el guardado. |

### Perfil admin (`AdminProfileScreen`)
| Título | Mensaje | Para qué |
|---|---|---|
| Listo | Mercado Pago quedó conectado. Los tutores y atletas ya pueden pagar cuotas desde la app. | Conexión con Mercado Pago OK. |
| No se pudo conectar | Volvé a intentar desde Perfil → Conectar a Mercado Pago. | No se pudo conectar. |
| No disponible | Mercado Pago todavía no está listo en este club. Escribile a soporte para activarlo. | Mercado Pago no está activado. |
| No se pudo conectar | No pudimos abrir Mercado Pago. Revisá tu conexión e intentá de nuevo. | Falló al abrir la conexión. |

### QR de ingreso (`MemberClubEntryScreen`)
| Título | Mensaje | Para qué |
|---|---|---|
| No se pudo completar | No se pudo generar el QR. | Falló generar el código. |

---

## Finanzas

### Pagos admin (`FinanzasScreen`)
| Título | Mensaje | Para qué |
|---|---|---|
| No se pudo completar | No se pudieron cargar más atletas / los pagos / las familias / más familias. | Error al listar. |
| No se pudo completar | No se pudieron cargar los planes. | Falló planes. |
| No se pudo completar | No se pudo cargar disciplinas y categorías. | Falló al armar las opciones. |
| No se pudo completar | Poné un nombre para el plan. | Plan sin nombre. |
| No se pudo completar | Revisá el monto. | Monto inválido. |
| No se pudo completar | El día de vencimiento tiene que estar entre 1 y 28. | Día fuera de rango. |
| No se pudo completar | Recargo por vencimiento: porcentaje entre 0 y 100. | Recargo inválido. |
| Listo | Plan actualizado. / Plan creado. / Plan asignado. | Plan guardado OK. |
| Archivar plan | ¿Archivamos "{plan}"? No se va a asignar a inscripciones nuevas. | Confirmar archivar. Botón: Archivar. |
| Listo | Plan archivado. / Plan reactivado. | Resultado archivar/reactivar. |
| No se pudo completar | Porcentaje inválido (0-100). | Descuento familiar/hermanos. |
| Listo | Descuento guardado. | Descuento aplicado (a veces con detalle del club). |
| Listo | Pago registrado correctamente. | Cobro manual OK. |
| Generar cuotas | ¿Generamos las cuotas de {mes año} para las inscripciones activas con plan? Las que ya están creadas se dejan como están. | Confirmar generación. Botón: Generar. |
| Listo | Creadas: X. Omitidas: Y. Sin plan: Z. | Resultado de generar. |
| Chequear vencidos | ¿Marcamos como vencidas las cuotas pendientes cuya fecha ya pasó? Si el plan tiene recargo, se aplica. | Confirmar chequeo. Botón: Chequear. |
| Listo | Vencidas: N. | Resultado del chequeo. |

### Comprobantes (`ComprobantesReviewTab`)
| Título | Mensaje | Para qué |
|---|---|---|
| No se pudo completar | No se pudieron cargar los comprobantes. | Lista. |
| Aprobado | El pago quedó registrado como pagado. / Se registraron N cuotas como pagadas. | Aprobó transferencia. |
| Contanos el motivo | Escribí por qué se rechaza el comprobante. | Rechazo sin motivo. |
| Rechazado | Se notificó al tutor/atleta con el motivo. | Rechazo OK. |

### Morosidad / historial
| Título | Mensaje | Para qué |
|---|---|---|
| No se pudo completar | No se pudo cargar morosidad. / No se pudo cargar historial. | Carga. |
| Listo | Recordatorios enviados. | Avisos enviados (a veces con detalle del club). |
| No se pudo completar | No se pudieron enviar. | Falló el envío de recordatorios. |

### Cuotas socio (`MemberPaymentsScreen`)
| Título | Mensaje | Para qué |
|---|---|---|
| No se pudo completar | No se pudieron cargar las cuotas. | Lista. |
| Pago en la app | Solo atletas de N años o más pueden pagar desde su cuenta. Un tutor puede abonar por vos. | Menor de edad intenta pagar. |
| No se pudo completar | No pudimos armar el link de pago. Probá de nuevo. | Mercado Pago no dio link. |
| No se pudo completar | No se pudo iniciar el pago. | Falló el pago. |
| Enviado | El comprobante quedó en revisión. Te avisaremos cuando el club confirme el pago. | Subió transferencia. |

---

## Alquileres, espacios, grilla

### Alquileres
| Título | Mensaje | Para qué |
|---|---|---|
| No se pudo completar | No se pudieron cargar los espacios / el balance / las reservas. | Carga. |
| No se pudo completar | No se pudo crear el link de Mercado Pago. | Link de cobro. |
| Listo | Link copiado. Pegalo en WhatsApp o mail al cliente. | Copió el link. |
| No se pudo completar | No se pudo copiar el link. / No se pudo abrir Mercado Pago. | Clipboard o apertura. |
| Registrar pago total | ¿Marcar como pagado el saldo de $X de {cliente}? | Confirmar cobro total. Botón: Pagar total. |
| Listo | Pago registrado correctamente. | Cobro OK. |
| No se pudo completar | Completá todos los campos para seguir. | Formulario incompleto. |
| No se pudo completar | Usá horarios en formato HH:MM (24 h). | Hora mal. |
| No se pudo completar | La hora de fin debe ser posterior a la de inicio. | Rango invertido. |
| Horario ocupado | Ese rango choca con un entrenamiento, la grilla fija u otro alquiler. Elegí un horario libre del calendario. | Conflicto de agenda. |
| Listo | Reserva creada correctamente. | Alta OK. |
| Cancelar reserva | ¿Cancelamos la reserva de {cliente}? El horario queda libre y se conservan el registro y los cobros. | Confirmar cancelación. Botón: Cancelar Reserva. |
| Listo | Alquiler cancelado y horario liberado. | Cancelación OK. |

### Espacios
| Título | Mensaje | Para qué |
|---|---|---|
| No se pudo completar | No se pudieron cargar los espacios físicos. | Lista. |
| Estado actualizado | Cambio guardado. | Disponible / mantenimiento / clausura. |
| Espacio | Elegí el espacio destino para reubicar las sesiones. | Reubicar sin destino. |
| No se pudo completar | Poné un nombre para el espacio. | Alta/edición. |
| Listo | Espacio actualizado correctamente / Espacio creado correctamente | Guardado OK. |

### Grilla
| Título | Mensaje | Para qué |
|---|---|---|
| No se pudo completar | No se pudo cargar la grilla. | Carga. |
| No se pudo completar | Todos los campos son necesarios. Elegí al menos un día. | Falta día u otros campos. |
| No se pudo completar | Usá horarios en formato HH:MM (24 h), por ejemplo 18:30. | Hora mal. |
| No se pudo completar | Indicá hasta qué fecha crear sesiones para este horario (DD-MM-AAAA). | Falta fecha límite. |
| Listo | Horario guardado en la grilla. | Guardado OK. |
| Quitar horario | ¿Querés quitar este horario de la grilla? | Confirmar baja. |
| No se pudo completar | No se pudo eliminar el horario. | Falló baja. |
| No se pudo completar | No se pudo guardar el horario. Revisá que no se pise con otro. | Choque u error. |

---

## Estructura y usuarios

### Disciplinas (`EstructuraScreen`)
| Título | Mensaje | Para qué |
|---|---|---|
| Un momento | El nombre de la disciplina no puede estar vacío. | Validación. |
| Quitar disciplina | ¿Querés quitar {nombre} de la estructura? Si tiene categorías asociadas, no se va a poder. | Confirmar baja. Botón: Eliminar. |
| No se pudo completar | No se pudo eliminar. Verificá si tiene categorías asociadas. | Baja bloqueada. |

### Categorías (`CategoriasScreen`)
| Título | Mensaje | Para qué |
|---|---|---|
| Un momento | El nombre de la categoría no puede estar vacío. | Validación. |
| Quitar categoría | ¿Querés quitar "{nombre}"? | Confirmar baja. Botón: Eliminar. |
| No se pudo completar | No se pudo eliminar la categoría. | Falló baja. |

### Usuarios
| Título | Mensaje | Para qué |
|---|---|---|
| No se puede hacer ahora | No podés modificar al administrador del club. | Admin no editable por otro rol. |
| Un momento | La contraseña es obligatoria para nuevos usuarios. | Alta sin password. |
| Listo | El usuario fue actualizado. / El usuario fue creado correctamente. | Guardado OK. |
| Dar de baja a {nombre} | ¿Querés desactivar a {nombre apellido}? Podés volver a activarlo después. | Confirmar baja. Botón: Desactivar. |
| Información | Aviso del club sobre el tutor o la familia. | Baja de atleta con aviso extra. |
| Listo | Atleta dado de baja. / Usuario desactivado correctamente. | Baja OK. |

### Detalle categoría
| Título | Mensaje | Para qué |
|---|---|---|
| Listo | Plantel actualizado. | Sync plantel. |
| Listo | {nombre} inscrito / añadido como profesor/prep/nutri/psico. | Vínculo OK. |
| Desvincular | ¿Querés desvincular a {nombre} de esta categoría? | Confirmar. Botón: Desvincular. |
| Aviso | Para editar un perfil, andá a Usuarios. | Atajo inválido. |
| Aviso | Para dar de baja un perfil, andá a Usuarios. | Atajo inválido. |
| Listo | Plan asignado a la inscripción. / Plan quitado de la inscripción. | Plan en la inscripción. |

### Solicitudes de inscripción
| Título | Mensaje | Para qué |
|---|---|---|
| Listo | Los atletas fueron inscriptos en la categoría. / Solicitud rechazada. | Resolución. |
| Rechazar solicitud | ¿Confirmás que estos atletas no se inscriben? | Confirmar rechazo. Botón: Rechazar. |

### Coach: pedir atletas (`CoachCategoryDetailScreen`)
| Título | Mensaje | Para qué |
|---|---|---|
| Atletas | Seleccioná al menos un atleta. | Pedido vacío. |
| Solicitud enviada | Administración revisará el pedido. Cuando la aprueben, los atletas aparecerán en el plantel. | Pedido OK. |
| Listo | Plantel de la categoría actualizado. | Coach actualizó plantel. |

---

## Noticias, docs, ingreso, notificaciones

### Noticias
| Título | Mensaje | Para qué |
|---|---|---|
| Necesitamos un permiso | Necesitamos acceso a tus fotos para continuar. | Galería denegada. |
| No se pudo completar | Título y contenido son obligatorios. | Falta título o texto. |
| Alcance / Destinatarios / Tutores / Jugadores / Categorías | Elegí al menos… | Falta audiencia. |
| Listo | Noticia publicada correctamente. | Publicación OK. |
| Quitar noticia | ¿Querés quitar esta noticia del muro? | Confirmar baja. |

### Pedir documentación (`RequestDocComposer`)
| Título | Mensaje | Para qué |
|---|---|---|
| Un momento | Indicá un título para el pedido. / Elegí al menos una categoría. / Elegí al menos un atleta o persona. | Validación. |
| Fecha | Usá el formato DD-MM-AAAA para el vencimiento. | Fecha mal. |
| No se pudo completar | No se pudo crear el pedido. | Falló el envío. |

### Revisar docs (coach / categoría)
| Título | Mensaje | Para qué |
|---|---|---|
| Archivo | Esta entrega no tiene archivo adjunto. | No hay archivo. |
| Aprobar documento | ¿Confirmás la documentación de {nombre}? | Confirmar aprobación. |
| Motivo | Escribí por qué se rechaza el documento. | Rechazo sin texto. |

### Control de ingreso
| Título | Mensaje | Para qué |
|---|---|---|
| Cámara no disponible | Permití el acceso a la cámara en el navegador… | Web sin cámara. |
| No se pudo registrar | Código inválido o expirado. | QR inválido. |

### Notificaciones (`NotificationsModal`)
| Título | Mensaje | Para qué |
|---|---|---|
| Limpiar notificaciones | ¿Querés borrar todas las notificaciones? Esta acción no se puede deshacer. | Confirmar borrado. Botón: Eliminar todas. |

---

## Coach, staff, atleta

### Sesión (`CoachSessionDetailScreen`)
| Título | Mensaje | Para qué |
|---|---|---|
| Listo | Asistencia guardada. / …Se envió un aviso a las familias por novedades. | Check-in. |
| Plan copiado | Revisá los bloques y guardá para vincularlo a esta sesión. | Duplicó el último plan. |
| Sin plan previo | No hay un plan reciente en esta categoría para duplicar. | Nada que copiar. |
| Revisá el plan | El bloque N necesita un título / duración. | Plan incompleto. |
| Plan vacío | Agregá al menos un bloque de entrenamiento. | Sin bloques. |
| Listo | Plan guardado. Pasá a En vivo para el cronómetro. | Plan guardado. |
| Reabrir sesión | La sesión vuelve a quedar abierta y se borran los tiempos por bloque. El plan y la asistencia se mantienen. ¿Seguimos? | Confirmar reopen. |
| Listo | Sesión reabierta. Podés corregir horarios y cronometrar de nuevo. | Reopen OK. |
| Finalizar | ¿Guardamos los tiempos y cerramos la sesión? | Confirmar cierre entreno. |
| Finalizar | ¿Marcamos esta consulta como realizada? | Confirmar cierre consulta. |
| Primero el plan | Guardá o cancelá la edición… / Armá y guardá el plan en Planificar… | Quiere En vivo sin plan. |
| Fecha / horario / lugar / sede / espacio | Validaciones de datos de sesión. | Formulario. |
| Listo | Datos de la sesión/consulta actualizados. / Consulta cerrada. / Sesión finalizada… | Guardados varios. |

### Nueva sesión (`CoachNewSessionScreen`)
| Título | Mensaje | Para qué |
|---|---|---|
| Falta un dato | Elegí una categoría. / Elegí un día en el calendario. | Form incompleto. |
| Horario | Tocá un horario libre en el espacio que quieras usar. | Sin horario. |
| Revisá el horario | Elegí un horario de la lista. / Usá HH:MM en 24 h. | Hora inválida. |
| Sede del partido | Escribí dónde se juega (cancha rival, ciudad, dirección… al menos 3 caracteres). | Partido externo. |

### Relocalizar sesiones
| Título | Mensaje | Para qué |
|---|---|---|
| Selección | Marcá al menos una sesión / para restaurar. | Nada tildado. |
| Sede externa | Escribí la sede (mín. 3 caracteres). | Texto corto. |
| Espacio | Elegí un espacio del club. | Falta espacio. |
| Listo | Se aplicó el lugar a N sesión(es). | Cambio aplicado. |
| Nada para guardar | Configurá el lugar de al menos una sesión antes de guardar. | Nada listo para guardar. |
| Listo | Cambios guardados. | Resultado OK (a veces con detalle si falló alguna). |

### Recurso (`CoachResourceSendScreen`)
| Título | Mensaje | Para qué |
|---|---|---|
| Necesitamos un permiso | Necesitamos acceso a tus fotos para continuar. | Galería. |
| Falta un dato | Título y archivo o enlace de YouTube son obligatorios. | Falta material. |
| Revisá el enlace | Pegá un enlace válido de YouTube (watch, youtu.be o shorts). | Link malo. |
| Un momento | Elegí una categoría. / Elegí un atleta. | Destinatario. |

### Mediciones
| Título | Mensaje | Para qué |
|---|---|---|
| Un momento | Poné un nombre para la métrica. | Alta métrica. |
| Listo | Métrica creada. / Medición guardada / actualizada / eliminada. | Guardado OK. |
| Falta un dato | Elegí métrica e ingresá un valor numérico. | Carga. |
| Revisá ese valor | Ingresá un número (coma o punto). / Revisá el número en “{nombre}”. | Número malo. |
| Quitar medición | ¿Querés borrar este registro? | Confirmar. |
| Esperá un momento | Las medidas se están preparando. Volvé a intentar en unos segundos. | Todavía no está listo. |
| Falta completar | Completá al menos un valor antes de guardar. | Nada cargado. |
| Guardado | Mediciones guardadas. | Guardado OK. |

### Consultas nutri / psico
| Título | Mensaje | Para qué |
|---|---|---|
| Falta un dato | Elegí categoría, atleta y fecha. | Form. |
| Revisá la fecha | Usá el formato DD-MM-AAAA con día y mes válidos. | Fecha. |
| Revisá el horario | Usá HH:MM en 24 h. | Hora. |
| Cancelar consulta | ¿Cancelamos esta consulta? Después vas a poder avisar al atleta con un comunicado. | Confirmar. Botón: Continuar. |
| Listo | Se asignó otro atleta y se volvió a pedir confirmación. | Cambio de atleta. |

### Wellness coach
| Título | Mensaje | Para qué |
|---|---|---|
| Sin sesión | El RPE solo se carga cuando hay entrenamiento o partido ese día. | RPE sin sesión. |

### Agenda atleta
| Título | Mensaje | Para qué |
|---|---|---|
| Confirmar asistencia | ¿Vas a asistir a esta consulta? | Confirmar. |
| Listo | Confirmaste tu asistencia. / Avisamos que no podés asistir. | Respuesta. |

### Docs / recursos atleta
| Título | Mensaje | Para qué |
|---|---|---|
| Listo | Tu archivo fue enviado y está en revisión. | Upload. |
| Necesitamos un permiso | Necesitamos acceso a tus fotos para continuar. | Galería. |
| Archivo | Este recurso no tiene un archivo adjunto. | Recurso sin archivo. |

---

## Errores genéricos de carga

Se repiten en agendas, paneles, planteles, noticias, etc.:

- **No se pudo completar** + `No se pudo cargar la agenda.`
- **No se pudo completar** + `No se pudieron cargar las categorías / el plantel / las noticias / los recursos / las novedades / el wellness.`

---

## Cómo pedir un cambio

Indicá **pantalla + título + mensaje nuevo**. Ejemplo:  
`Login / Un momento / “Completá tu email y contraseña para entrar.” → “Escribí email y contraseña.”`
