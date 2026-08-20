/** API bases for the marketing site (family signup). */
export const APP_URL = import.meta.env.VITE_APP_URL || 'https://app.hermesclubapp.com';
export const CLUB_API_URL = (
  import.meta.env.VITE_CLUB_API_URL || 'https://club-backend-t1qz.onrender.com/api'
).replace(/\/$/, '');
export const SUPER_API_URL = (
  import.meta.env.VITE_SUPER_API_URL || 'https://club-super.onrender.com/api'
).replace(/\/$/, '');

export const TERMS_URL = 'https://hermesclub.app/terminos/';
export const PRIVACY_URL = 'https://hermesclub.app/privacidad/';
