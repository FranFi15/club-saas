/** Versión vigente de los Términos — subir este valor fuerza nueva aceptación en la app. */
export const TERMS_VERSION = '2026-08-15';

export const TERMS_URL = 'https://hermesclub.app/terminos/';
export const PRIVACY_URL = 'https://hermesclub.app/privacidad/';

export const TERMS_SECTIONS = [
  {
    title: '1. Identificación del servicio',
    body:
      'Hermes Club App (“Hermes”, “nosotros”) es una plataforma digital de gestión para clubes deportivos. Estos términos regulan el uso de la aplicación móvil y los servicios asociados en la República Argentina. Contacto: hola@hermesclub.app.',
  },
  {
    title: '2. Aceptación',
    body:
      'Al crear una cuenta, iniciar sesión o usar la app, aceptás estos Términos y la Política de privacidad. La aceptación la realiza el titular de la cuenta (administración, staff, atleta o tutor). Si sos tutor/a, también aceptás el uso de la plataforma en relación con los menores a tu cargo vinculados en el club.',
  },
  {
    title: '3. Relación con el club',
    body:
      'Hermes provee la plataforma tecnológica multi-club. El club es quien administra usuarios, planteles, sesiones, cuotas, documentación, noticias y reglas internas. Hermes no es el club, no decide altas/bajas deportivas ni montos de cuotas, y no es empleador del cuerpo técnico ni del personal del club.',
  },
  {
    title: '4. Cuentas y acceso',
    body:
      'Las credenciales son personales. No debés compartirlas ni intentar acceder a cuentas ajenas. El club puede crear, modificar o desactivar usuarios. Hermes puede suspender o restringir el acceso ante uso indebido, riesgo de seguridad o incumplimiento de estos términos.',
  },
  {
    title: '5. Uso permitido y prohibido',
    body:
      'La app debe usarse para la gestión deportiva y administrativa legítima del club. Está prohibido: acceso no autorizado; interferir con el servicio; scrapear o automatizar usos abusivos; publicar contenido ilegal, ofensivo o que vulnere derechos de terceros; suplantar identidades; o eludir medidas de seguridad (incluido el control de ingreso).',
  },
  {
    title: '6. Contenido cargado por usuarios y clubes',
    body:
      'Noticias, documentos, fotos, informes, mensajes de chat y demás archivos son responsabilidad de quien los carga y del club. Hermes puede retirar o restringir contenido que viole la ley o estos términos, sin que ello implique obligación de moderar todo el contenido de antemano.',
  },
  {
    title: '7. Pagos',
    body:
      'Las cuotas, alquileres u otros cobros configurados por el club pueden pagarse mediante Mercado Pago, transferencia u otros medios habilitados por el club. Salvo indicación expresa en contrario, Hermes no es el cobrador del servicio deportivo: el acreedor es el club. Reclamos sobre montos, periodos o prestaciones del club deben dirigirse al club. El procesamiento con Mercado Pago también se rige por los términos de ese proveedor.',
  },
  {
    title: '8. Ingreso al club (QR)',
    body:
      'Cuando el club habilite ingreso por QR, el código es personal e intransferible. El uso indebido puede invalidar el acceso. El club opera el control de ingreso y decide quién puede entrar.',
  },
  {
    title: '9. Menores',
    body:
      'La app puede usarse con atletas menores bajo la responsabilidad del club y de su tutor/a o responsable. Hermes no reemplaza consentimientos deportivos, médicos o institucionales que el club deba obtener por fuera de la plataforma.',
  },
  {
    title: '10. Disponibilidad',
    body:
      'Prestamos el servicio con diligencia razonable, pero pueden existir mantenimientos, interrupciones de hosting, fallas de red o errores. No garantizamos disponibilidad ininterrumpida ni ausencia total de defectos.',
  },
  {
    title: '11. Limitación de responsabilidad',
    body:
      'En la medida permitida por la legislación argentina aplicable (incluida la normativa de defensa del consumidor cuando corresponda), Hermes no responde por decisiones deportivas o administrativas del club, lesiones en la práctica deportiva, conflictos entre el club y sus socios/usuarios, ni por errores en montos o estados de cuotas cargados por el club. Hermes responde por el funcionamiento de la plataforma conforme a estos términos y a la ley.',
  },
  {
    title: '12. Propiedad intelectual',
    body:
      'El software, marca y diseño de Hermes Club App pertenecen a Hermes o a sus licenciantes. El nombre, logo y datos del club siguen siendo del club. No podés copiar, modificar ni explotar la plataforma fuera del uso autorizado.',
  },
  {
    title: '13. Cambios',
    body:
      'Podemos actualizar estos términos. Cuando cambie la versión vigente, la app solicitará una nueva aceptación antes de continuar. La versión publicada en hermesclub.app/terminos y la mostrada en la app indican la vigencia.',
  },
  {
    title: '14. Ley aplicable y contacto',
    body:
      'Estos términos se rigen por las leyes de la República Argentina. Consultas: hola@hermesclub.app.',
  },
];

export function needsTermsAcceptance(acceptedVersion) {
  return String(acceptedVersion || '').trim() !== TERMS_VERSION;
}
