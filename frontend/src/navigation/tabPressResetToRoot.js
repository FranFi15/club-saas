/**
 * Bottom tabs solo cambian de ruta cuando la pestaña no está enfocada.
 * Si el usuario está en un stack profundo y vuelve a tocar la misma pestaña,
 * no pasa nada: hay que interceptar tabPress y llevar el stack anidado a su raíz.
 *
 * Ojo: `navigation.getParent()` no siempre es el Tab.Navigator (a veces es el Stack
 * raíz de la app, que no tiene rutas como 'Gestión'). Hay que subir hasta encontrar
 * el navegador cuyo `routeNames` incluye la pestaña.
 *
 * @param {string} tabRouteName - Nombre de la pestaña en el Tab.Navigator (ej. 'Gestión')
 * @param {string} stackRootScreenName - Pantalla inicial del stack dentro del tab (ej. 'GestionMenu')
 */
function findNavigatorWithTabRoute(navigation, tabRouteName) {
  let current = navigation;
  for (let i = 0; i < 6 && current != null; i++) {
    const routeNames = current.getState?.()?.routeNames;
    if (Array.isArray(routeNames) && routeNames.includes(tabRouteName)) {
      return current;
    }
    current = current.getParent?.();
  }
  return null;
}

export function tabPressResetToRoot(tabRouteName, stackRootScreenName) {
  return ({ navigation }) => ({
    tabPress: (e) => {
      const tabNav = findNavigatorWithTabRoute(navigation, tabRouteName);
      const state = tabNav?.getState?.();
      const current = state?.routes?.[state.index];
      const alreadyHere = current?.name === tabRouteName;

      // Cambiar de pestaña lo hace el pager. Si además llamamos navigate,
      // iOS cierra la app al volver a la primera pestaña.
      if (!alreadyHere || !stackRootScreenName) return;

      const nested = current?.state;
      const nestedIndex = nested?.index ?? 0;
      const nestedName = nested?.routes?.[nestedIndex]?.name;
      if (!nested || nestedIndex === 0 || nestedName === stackRootScreenName) return;

      e.preventDefault();
      tabNav.navigate(tabRouteName, { screen: stackRootScreenName });
    },
  });
}
