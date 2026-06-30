export const APP_NAME = 'Hermes Club App';
export const APP_URL = import.meta.env.VITE_APP_URL || 'https://your-app.vercel.app';

export const FEATURES = [
  {
    title: 'Finanzas y cuotas',
    description: 'Planes, cobranzas, familias con descuento, comprobantes y Mercado Pago integrado.',
    icon: 'payments',
    image: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Plantel y categorías',
    description: 'Disciplinas, edades, inscripciones y delegación del armado de plantel al cuerpo técnico.',
    icon: 'team',
    image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Entrenamientos y agenda',
    description: 'Grilla semanal, sesiones, asistencia, alquiler de espacios y reservas externas.',
    icon: 'calendar',
    image: 'https://www.lanacion.com.ar/resizer/v2/muchas-personas-prefieren-utilizar-un-calendario-AW3TWR43FFBGPN34XQATTZ6EDQ.jpg?auth=1aef2f95366bbbc69b13f7873dc2d1d659198be97c01c7ed335d691739a822a5&width=780&height=520&quality=70&smart=true',
  },
  {
    title: 'Comunicación',
    description: 'Noticias del club, notificaciones y recursos para atletas, tutores y staff.',
    icon: 'news',
    image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Documentación',
    description: 'Pedí archivos, revisá entregas y llevá el estado de cada atleta al día.',
    icon: 'docs',
    image: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Control de ingreso',
    description: 'QR de acceso para socios, registro de entradas y operación en puerta.',
    icon: 'qr',
    image: 'https://www.clikisalud.net/wp-content/uploads/2016/08/tel%C3%A9fonos-celulares-cercania-personas.jpg',
  },
];

export const ROLES = [
  { label: 'Administración', detail: 'Estructura, usuarios, finanzas y operación del club.' },
  { label: 'Cuerpo técnico', detail: 'Plantel, sesiones, asistencia y comunicación con el equipo.' },
  { label: 'Atletas y tutores', detail: 'Agenda, cuotas, documentos y novedades en el celular.' },
  { label: 'Staff especializado', detail: 'Nutrición, psicología, wellness y seguimiento individual.' },
];
